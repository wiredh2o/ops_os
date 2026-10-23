import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Payment token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching order by token:", token);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order by payment token
    const { data: order, error: orderError } = await supabase
      .from("production_orders")
      .select(`
        id,
        order_number,
        order_type,
        status,
        payment_status,
        payment_received_at,
        payment_token_expires_at,
        shipping_cost,
        tax_amount,
        tax_lines,
        tax_review_required,
        customer_id,
        created_at,
        companies:customer_id (
          id,
          name,
          email,
          phone,
          stripe_customer_id,
          is_taxable
        )
      `)
      .eq("payment_token", token)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", orderError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired payment link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (order.payment_token_expires_at && new Date(order.payment_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This payment link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already paid
    if (order.payment_status === "paid" && order.payment_received_at) {
      return new Response(
        JSON.stringify({ 
          error: "This order has already been paid",
          already_paid: true,
          order_number: order.order_number,
          paid_at: order.payment_received_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch line items
    const { data: lineItems, error: itemsError } = await supabase
      .from("production_order_items")
      .select(`
        id,
        item_name,
        item_sku,
        item_type,
        quantity,
        unit_price,
        total_price,
        notes,
        is_taxable,
        tax_amount,
        repair_item_id
      `)
      .eq("production_order_id", order.id);

    if (itemsError) {
      console.error("Failed to fetch line items:", itemsError);
    }

    // Fetch repair items with photos if this is a repair order
    const repairItemIds = lineItems?.filter(li => li.repair_item_id).map(li => li.repair_item_id) || [];
    let repairItems: any[] = [];

    if (repairItemIds.length > 0) {
      const { data: repairs, error: repairsError } = await supabase
        .from("repair_items")
        .select(`
          id,
          item_description,
          diagnosis_notes,
          repair_notes,
          actual_issue,
          repair_item_photos (
            id,
            file_path,
            photo_type
          )
        `)
        .in("id", repairItemIds);

      if (!repairsError && repairs) {
        // Generate signed URLs for photos
        for (const repair of repairs) {
          if (repair.repair_item_photos?.length > 0) {
            for (const photo of repair.repair_item_photos) {
              const { data: signedUrl } = await supabase.storage
                .from("repair-photos")
                .createSignedUrl(photo.file_path, 3600); // 1 hour expiry
              
              photo.signed_url = signedUrl?.signedUrl || null;
            }
          }
        }
        repairItems = repairs;
      }
    }

    // Calculate totals
    const subtotal = lineItems?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
    if (order.tax_review_required) return new Response(JSON.stringify({ error: 'Tax jurisdiction review is required before payment' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const taxAmount = order.tax_amount || 0;
    const shippingCost = order.shipping_cost || 0;
    const total = subtotal + taxAmount + shippingCost;

    // Create PaymentIntent if not already paid
    const TENANT_KEYS = await loadTenantKeys(req, ['stripe']);
    const stripeSecretKey = TENANT_KEYS['STRIPE_SECRET_KEY'];
    let clientSecret: string | null = null;

    if (stripeSecretKey && total > 0) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      const paymentIntentData: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(total * 100), // Convert to cents
        currency: "usd",
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      };

      // Attach to Stripe customer if available
      const customer = order.companies as any;
      if (customer?.stripe_customer_id) {
        paymentIntentData.customer = customer.stripe_customer_id;
        paymentIntentData.setup_future_usage = "off_session";
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      clientSecret = paymentIntent.client_secret;

      console.log("Created PaymentIntent:", paymentIntent.id);
    }

    const customer = order.companies as any;

    return new Response(
      JSON.stringify({
        order: {
          id: order.id,
          order_number: order.order_number,
          order_type: order.order_type,
          status: order.status,
          created_at: order.created_at,
        },
        customer: customer ? {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        } : null,
        line_items: lineItems || [],
        repair_items: repairItems,
        totals: {
          subtotal,
          tax: taxAmount,
          tax_lines: order.tax_lines || [],
          shipping: shippingCost,
          total,
        },
        payment: {
          client_secret: clientSecret,
          stripe_customer_id: customer?.stripe_customer_id,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-order-by-token:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
