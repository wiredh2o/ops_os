import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MOUSER_API_BASE = "https://api.mouser.com/api/v2";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['mouser']);
    const mouserApiKey = TENANT_KEYS['MOUSER_ALLBUT_SEARCH_KEY'];
    if (!mouserApiKey) {
      throw new Error("MOUSER_ALLBUT_SEARCH_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { purchaseOrderId, vendorOrderId } = await req.json();

    if (!vendorOrderId) {
      return new Response(
        JSON.stringify({ error: "vendorOrderId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch order status from Mouser API
    const response = await fetch(`${MOUSER_API_BASE}/order/${vendorOrderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': mouserApiKey,
      },
    });

    const orderData = await response.json();
    console.log("Mouser order status response:", JSON.stringify(orderData, null, 2));

    if (!response.ok) {
      throw new Error(`Mouser API error: ${orderData.Message || JSON.stringify(orderData)}`);
    }

    // Extract tracking info from shipments
    const shipments = orderData.Shipments || [];
    let trackingNumber: string | null = null;
    let carrier: string | null = null;
    let shipDate: string | null = null;

    if (shipments.length > 0) {
      const latestShipment = shipments[0];
      trackingNumber = latestShipment.TrackingNumber || null;
      carrier = latestShipment.CarrierName?.toLowerCase() || null;
      shipDate = latestShipment.ShipDate || null;
    }

    // Map Mouser status to our delivery status
    const orderStatus = orderData.OrderStatus || orderData.Status || 'Unknown';
    let deliveryStatus = 'processing';
    
    if (orderStatus.toLowerCase().includes('ship')) {
      deliveryStatus = 'shipped';
    } else if (orderStatus.toLowerCase().includes('deliver')) {
      deliveryStatus = 'delivered';
    } else if (orderStatus.toLowerCase().includes('cancel')) {
      deliveryStatus = 'cancelled';
    } else if (orderStatus.toLowerCase().includes('process') || orderStatus.toLowerCase().includes('pending')) {
      deliveryStatus = 'processing';
    }

    // Update purchase order if ID provided
    if (purchaseOrderId) {
      const updateData: any = {
        vendor_order_status: orderStatus,
        vendor_delivery_status: deliveryStatus,
      };

      if (trackingNumber) {
        updateData.vendor_tracking_number = trackingNumber;
      }
      if (carrier) {
        updateData.vendor_tracking_carrier = carrier;
      }
      if (shipDate && deliveryStatus === 'shipped') {
        updateData.vendor_shipped_at = new Date(shipDate).toISOString();
      }
      if (deliveryStatus === 'delivered') {
        updateData.vendor_delivered_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', purchaseOrderId);

      if (updateError) {
        console.error("Failed to update PO status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        vendorOrderId,
        orderStatus,
        deliveryStatus,
        trackingNumber,
        carrier,
        shipDate,
        rawResponse: orderData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in mouser-check-order-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
