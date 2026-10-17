import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch purchase order by shipment token
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        purchase_order_number,
        order_date,
        ship_by_date,
        requested_shipping_carrier,
        requested_shipping_method,
        status,
        notes,
        subtotal,
        total,
        vendor_tracking_number,
        vendor_tracking_carrier,
        vendor_shipped_at,
        vendor_delivery_status,
        is_drop_ship,
        drop_ship_address_snapshot,
        supplier_id
      `)
      .eq('shipment_token', token)
      .maybeSingle();

    if (poError) {
      console.error("Error fetching PO:", poError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch purchase order" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!po) {
      return new Response(
        JSON.stringify({ error: "Purchase order not found or link expired" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch supplier details
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', po.supplier_id)
      .single();

    if (supplierError || !supplier) {
      console.error("Error fetching supplier:", supplierError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch supplier details" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch PO items
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('id, item_name, quantity, uom, unit_cost, total_cost')
      .eq('purchase_order_id', po.id);

    if (itemsError) {
      console.error("Error fetching items:", itemsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch order items" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch ship-to address (facility or drop-ship)
    let shipToAddress: string | null = null;
    
    if (po.is_drop_ship && po.drop_ship_address_snapshot) {
      // Use drop-ship address snapshot
      const addr = po.drop_ship_address_snapshot as any;
      shipToAddress = [
        addr.attention || addr.company_name,
        addr.street1,
        addr.street2,
        `${addr.city}, ${addr.state} ${addr.postal_code}`,
        addr.country
      ].filter(Boolean).join('\n');
    } else {
      // Fetch facility ship-from address (used as receiving address)
      const { data: facilityAddress } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'ship_from_address')
        .eq('is_active', true)
        .maybeSingle();
      
      if (facilityAddress?.setting_value) {
        try {
          const addr = JSON.parse(facilityAddress.setting_value);
          shipToAddress = [
            addr.company,
            addr.attention,
            addr.street1,
            addr.street2,
            `${addr.city}, ${addr.state} ${addr.postalCode}`,
            addr.country
          ].filter(Boolean).join('\n');
        } catch (e) {
          shipToAddress = facilityAddress.setting_value;
        }
      }
    }

    // Fetch company name for header
    const { data: companyName } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'company_name')
      .eq('is_active', true)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        purchaseOrder: {
          id: po.id,
          purchaseOrderNumber: po.purchase_order_number,
          orderDate: po.order_date,
          shipByDate: po.ship_by_date,
          requestedCarrier: po.requested_shipping_carrier,
          requestedMethod: po.requested_shipping_method,
          status: po.status,
          notes: po.notes,
          subtotal: po.subtotal,
          total: po.total,
          vendorTrackingNumber: po.vendor_tracking_number,
          vendorTrackingCarrier: po.vendor_tracking_carrier,
          vendorShippedAt: po.vendor_shipped_at,
          vendorDeliveryStatus: po.vendor_delivery_status,
          isDropShip: po.is_drop_ship,
        },
        supplier: {
          id: supplier.id,
          name: supplier.name,
        },
        items: items || [],
        shipToAddress,
        companyName: companyName?.setting_value || 'WashGear',
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in get-po-by-shipment-token:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
