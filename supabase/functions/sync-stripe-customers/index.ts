import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple string similarity function
function similarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  
  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  // Simple word overlap
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all Stripe customers
    console.log('Fetching Stripe customers...');
    let allStripeCustomers: any[] = [];
    let hasMore = true;
    let startingAfter: string | null = null;

    while (hasMore) {
      const params = new URLSearchParams({ limit: '100' });
      if (startingAfter) params.append('starting_after', startingAfter);

      const response = await fetch(
        `https://api.stripe.com/v1/customers?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Stripe API error: ${response.status}`);
      }

      const data = await response.json();
      allStripeCustomers = [...allStripeCustomers, ...data.data];
      hasMore = data.has_more;
      if (data.data.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      }
    }

    console.log(`Fetched ${allStripeCustomers.length} Stripe customers`);

    // Fetch unlinked companies from database
    const { data: companies, error: fetchError } = await supabase
      .from('companies')
      .select('id, name, email, customer_number')
      .is('stripe_customer_id', null)
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`);
    }

    console.log(`Found ${companies?.length || 0} unlinked companies`);

    const results = {
      auto_matched: [] as { company_id: string; company_name: string; stripe_id: string; stripe_name: string; match_type: string }[],
      needs_review: [] as { company_id: string; company_name: string; candidates: { stripe_id: string; stripe_name: string; score: number }[] }[],
      no_match: [] as { company_id: string; company_name: string }[],
    };

    for (const company of companies || []) {
      let bestMatch: { customer: any; score: number; type: string } | null = null;
      const candidates: { stripe_id: string; stripe_name: string; score: number }[] = [];

      for (const stripeCustomer of allStripeCustomers) {
        // Skip already matched Stripe customers
        if (stripeCustomer.metadata?.app_customer_id) continue;

        // Priority 1: Exact email match
        if (company.email && stripeCustomer.email && 
            company.email.toLowerCase() === stripeCustomer.email.toLowerCase()) {
          bestMatch = { customer: stripeCustomer, score: 1.0, type: 'email' };
          break;
        }

        // Priority 2: Name similarity
        const nameScore = similarity(company.name, stripeCustomer.name || '');
        if (nameScore > 0.8) {
          if (!bestMatch || nameScore > bestMatch.score) {
            bestMatch = { customer: stripeCustomer, score: nameScore, type: 'name' };
          }
        } else if (nameScore > 0.5) {
          candidates.push({
            stripe_id: stripeCustomer.id,
            stripe_name: stripeCustomer.name || stripeCustomer.email || 'Unknown',
            score: nameScore,
          });
        }
      }

      if (bestMatch && bestMatch.score >= 0.9) {
        // Auto-match with high confidence
        const { error: updateError } = await supabase
          .from('companies')
          .update({
            stripe_customer_id: bestMatch.customer.id,
            stripe_sync_status: 'synced',
            stripe_last_synced_at: new Date().toISOString(),
          })
          .eq('id', company.id);

        if (!updateError) {
          results.auto_matched.push({
            company_id: company.id,
            company_name: company.name,
            stripe_id: bestMatch.customer.id,
            stripe_name: bestMatch.customer.name || bestMatch.customer.email,
            match_type: bestMatch.type,
          });

          // Update Stripe customer metadata
          await fetch(`https://api.stripe.com/v1/customers/${bestMatch.customer.id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              'metadata[app_customer_id]': company.id,
              'metadata[customer_number]': company.customer_number?.toString() || '',
            }).toString(),
          });
        }
      } else if (candidates.length > 0) {
        // Needs manual review
        await supabase
          .from('companies')
          .update({ stripe_sync_status: 'needs_review' })
          .eq('id', company.id);

        results.needs_review.push({
          company_id: company.id,
          company_name: company.name,
          candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 5),
        });
      } else {
        // No match found
        results.no_match.push({
          company_id: company.id,
          company_name: company.name,
        });
      }
    }

    console.log('Sync results:', {
      auto_matched: results.auto_matched.length,
      needs_review: results.needs_review.length,
      no_match: results.no_match.length,
    });

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error syncing Stripe customers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
