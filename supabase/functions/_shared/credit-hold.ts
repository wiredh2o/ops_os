import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Returns a 409 Response when the order's customer is on credit hold, else null.
 * Runs before any carrier label is bought; the DB trigger is the final backstop.
 */
export async function creditHoldResponse(orderId: string, headers: Record<string, string>): Promise<Response | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase configuration missing');
  const { data, error } = await createClient(url, key).rpc('production_order_credit_hold', { _order_id: orderId });
  if (error) throw new Error(`Could not check credit hold: ${error.message}`);
  if (!data) return null;
  return new Response(
    JSON.stringify({ error: "Credit hold: this customer is over their credit limit, so the order can't ship yet", credit_hold: true }),
    { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } },
  );
}
