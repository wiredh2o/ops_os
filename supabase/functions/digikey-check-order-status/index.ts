import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIGIKEY_API_BASE = "https://api.digikey.com";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['digikey']);
    const clientId = TENANT_KEYS['DIGIKEY_CLIENT_ID'];
    if (!clientId) {
      throw new Error("DigiKey API credentials are not configured");
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

    // Get access token
    const tokenResponse = await fetch(`${supabaseUrl}/functions/v1/digikey-get-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({}),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.success || !tokenData.accessToken) {
      throw new Error(`Failed to get DigiKey access token: ${tokenData.error}`);
    }

    const accessToken = tokenData.accessToken;

    // Fetch order status from DigiKey API
    const response = await fetch(`${DIGIKEY_API_BASE}/ordersupport/v2/orders/${vendorOrderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-DIGIKEY-Client-Id': clientId,
      },
    });

    const orderData = await response.json();
    console.log("DigiKey order status response:", JSON.stringify(orderData, null, 2));

    if (!response.ok) {
      throw new Error(`DigiKey API error: ${orderData.Message || orderData.message || JSON.stringify(orderData)}`);
    }

    // Extract tracking info from shipments
    const shipments = orderData.Shipments || [];
    let trackingNumber: string | null = null;
    let carrier: string | null = null;
    let shipDate: string | null = null;

    if (shipments.length > 0) {
      const latestShipment = shipments[0];
      trackingNumber = latestShipment.TrackingNumber || null;
      carrier = latestShipment.Carrier?.toLowerCase() || null;
      shipDate = latestShipment.ShipDate || null;
    }

    // Map DigiKey status to our delivery status
    const orderStatus = orderData.Status || 'Unknown';
    let deliveryStatus = 'processing';
    
    const statusLower = orderStatus.toLowerCase();
    if (statusLower.includes('ship') || statusLower.includes('transit')) {
      deliveryStatus = 'shipped';
    } else if (statusLower.includes('deliver') || statusLower.includes('complete')) {
      deliveryStatus = 'delivered';
    } else if (statusLower.includes('cancel')) {
      deliveryStatus = 'cancelled';
    } else if (statusLower.includes('process') || statusLower.includes('pending') || statusLower.includes('open')) {
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
    console.error("Error in digikey-check-order-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
