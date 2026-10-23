import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MOUSER_API_BASE = "https://api.mouser.com/api/v2";

interface MouserOrderLine {
  MouserPartNumber: string;
  Quantity: number;
  CustomerPartNumber?: string;
}

interface MouserOrderRequest {
  OrderHeader: {
    PONumber: string;
    ShippingMethodCode?: string;
    ShipToAddress: {
      AttentionLine?: string;
      CompanyName: string;
      AddressLine1: string;
      AddressLine2?: string;
      City: string;
      StateOrProvince: string;
      PostalCode: string;
      Country: string;
    };
  };
  OrderLines: MouserOrderLine[];
}

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

    const { purchaseOrderId } = await req.json();

    if (!purchaseOrderId) {
      return new Response(
        JSON.stringify({ error: "purchaseOrderId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (
          id, name, api_integration_type, api_customer_id
        )
      `)
      .eq('id', purchaseOrderId)
      .single();

    if (poError || !po) {
      throw new Error(`Purchase order not found: ${poError?.message}`);
    }

    if (po.suppliers?.api_integration_type !== 'mouser') {
      return new Response(
        JSON.stringify({ error: "This supplier is not configured for Mouser API integration" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch PO items with Mouser part numbers
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        item_name,
        quantity,
        inventory_item_id,
        inventory_items (
          mouser_part_number,
          sku
        )
      `)
      .eq('purchase_order_id', purchaseOrderId);

    if (itemsError) {
      throw new Error(`Failed to fetch PO items: ${itemsError.message}`);
    }

    // Validate all items have Mouser part numbers
    const orderLines: MouserOrderLine[] = [];
    const missingParts: string[] = [];

    for (const item of items || []) {
      const mouserPart = (item as any).inventory_items?.mouser_part_number;
      if (!mouserPart) {
        missingParts.push(item.item_name);
      } else {
        orderLines.push({
          MouserPartNumber: mouserPart,
          Quantity: item.quantity,
          CustomerPartNumber: (item as any).inventory_items?.sku,
        });
      }
    }

    if (missingParts.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Some items are missing Mouser part numbers",
          missingItems: missingParts 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get ship-to address
    let shipToAddress: any;
    
    if (po.is_drop_ship && po.drop_ship_address_snapshot) {
      const addr = po.drop_ship_address_snapshot as any;
      shipToAddress = {
        AttentionLine: addr.attention,
        CompanyName: addr.company_name || addr.attention,
        AddressLine1: addr.street1,
        AddressLine2: addr.street2,
        City: addr.city,
        StateOrProvince: addr.state,
        PostalCode: addr.postal_code,
        Country: addr.country || "US",
      };
    } else {
      // Fetch facility address
      const { data: facilityAddress } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'ship_from_address')
        .eq('is_active', true)
        .maybeSingle();
      
      if (facilityAddress?.setting_value) {
        try {
          const addr = JSON.parse(facilityAddress.setting_value);
          shipToAddress = {
            AttentionLine: addr.attention,
            CompanyName: addr.company || "WashGear",
            AddressLine1: addr.street1,
            AddressLine2: addr.street2,
            City: addr.city,
            StateOrProvince: addr.state,
            PostalCode: addr.postalCode,
            Country: addr.country || "US",
          };
        } catch (e) {
          throw new Error("Failed to parse facility address");
        }
      } else {
        throw new Error("No ship-to address configured");
      }
    }

    // Map carrier to Mouser shipping method code
    const shippingMethodMap: Record<string, string> = {
      'fedex_ground': 'FEDEX_GROUND',
      'fedex_express_saver': 'FEDEX_EXPRESS_SAVER',
      'fedex_2day': 'FEDEX_2DAY',
      'fedex_priority_overnight': 'FEDEX_PRIORITY_OVERNIGHT',
      'ups_ground': 'UPS_GROUND',
      'ups_3day_select': 'UPS_3_DAY_SELECT',
      'ups_2nd_day_air': 'UPS_2ND_DAY_AIR',
      'ups_next_day_air': 'UPS_NEXT_DAY_AIR',
    };

    const carrierMethod = `${po.requested_shipping_carrier}_${po.requested_shipping_method}`.toLowerCase();
    const shippingMethodCode = shippingMethodMap[carrierMethod] || 'UPS_GROUND';

    // Build Mouser order request
    const mouserOrder: MouserOrderRequest = {
      OrderHeader: {
        PONumber: po.purchase_order_number,
        ShippingMethodCode: shippingMethodCode,
        ShipToAddress: shipToAddress,
      },
      OrderLines: orderLines,
    };

    console.log("Submitting Mouser order:", JSON.stringify(mouserOrder, null, 2));

    // Submit order to Mouser API
    const response = await fetch(`${MOUSER_API_BASE}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': mouserApiKey,
      },
      body: JSON.stringify(mouserOrder),
    });

    const responseData = await response.json();
    console.log("Mouser API response:", JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      throw new Error(`Mouser API error: ${responseData.Message || JSON.stringify(responseData)}`);
    }

    // Extract order confirmation details
    const webOrderNumber = responseData.WebOrderNumber || responseData.OrderNumber;
    const orderStatus = responseData.OrderStatus || 'Submitted';

    // Update purchase order with vendor order ID
    const { error: updateError } = await supabase
      .from('purchase_orders')
      .update({
        vendor_order_id: webOrderNumber,
        vendor_order_status: orderStatus,
        vendor_delivery_status: 'processing',
        status: 'sent',
      })
      .eq('id', purchaseOrderId);

    if (updateError) {
      console.error("Failed to update PO with Mouser order ID:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        vendorOrderId: webOrderNumber,
        orderStatus,
        message: `Order submitted to Mouser successfully. Order ID: ${webOrderNumber}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in mouser-submit-order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
