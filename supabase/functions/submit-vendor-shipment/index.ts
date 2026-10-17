import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitShipmentRequest {
  token: string;
  trackingNumber: string;
  carrier: string;
  shipDate?: string;
  notes?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, trackingNumber, carrier, shipDate, notes }: SubmitShipmentRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!trackingNumber || !carrier) {
      return new Response(
        JSON.stringify({ error: "Tracking number and carrier are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch purchase order by shipment token to verify it exists
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('id, purchase_order_number, status, vendor_delivery_status')
      .eq('shipment_token', token)
      .maybeSingle();

    if (poError) {
      console.error("Error fetching PO:", poError);
      return new Response(
        JSON.stringify({ error: "Failed to verify purchase order" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!po) {
      return new Response(
        JSON.stringify({ error: "Purchase order not found or link expired" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already shipped
    if (po.vendor_delivery_status === 'shipped' || po.vendor_delivery_status === 'delivered') {
      return new Response(
        JSON.stringify({ 
          error: "This order has already been marked as shipped",
          alreadyShipped: true 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update purchase order with tracking info
    const shippedAt = shipDate ? new Date(shipDate).toISOString() : new Date().toISOString();
    
    const { error: updateError } = await supabase
      .from('purchase_orders')
      .update({
        vendor_tracking_number: trackingNumber.trim(),
        vendor_tracking_carrier: carrier.toLowerCase(),
        vendor_shipped_at: shippedAt,
        vendor_delivery_status: 'shipped',
        notes: notes ? `${po.status === 'sent' ? '' : (po as any).notes || ''}${notes ? `\n[Vendor Note]: ${notes}` : ''}`.trim() : undefined,
      })
      .eq('id', po.id);

    if (updateError) {
      console.error("Error updating PO:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update tracking information" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Vendor shipment submitted for PO ${po.purchase_order_number}: ${carrier} ${trackingNumber}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Shipment tracking information submitted successfully",
        purchaseOrderNumber: po.purchase_order_number,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in submit-vendor-shipment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
