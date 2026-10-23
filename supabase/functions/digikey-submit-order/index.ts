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

    const { purchaseOrderId } = await req.json();

    if (!purchaseOrderId) {
      return new Response(
        JSON.stringify({ error: "purchaseOrderId is required" }),
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

    if (po.suppliers?.api_integration_type !== 'digikey') {
      return new Response(
        JSON.stringify({ error: "This supplier is not configured for DigiKey API integration" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch PO items with DigiKey part numbers
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        item_name,
        quantity,
        inventory_item_id,
        inventory_items (
          digikey_part_number,
          sku
        )
      `)
      .eq('purchase_order_id', purchaseOrderId);

    if (itemsError) {
      throw new Error(`Failed to fetch PO items: ${itemsError.message}`);
    }

    // Validate all items have DigiKey part numbers
    const lineItems: any[] = [];
    const missingParts: string[] = [];

    for (const item of items || []) {
      const digikeyPart = (item as any).inventory_items?.digikey_part_number;
      if (!digikeyPart) {
        missingParts.push(item.item_name);
      } else {
        lineItems.push({
          DigiKeyPartNumber: digikeyPart,
          Quantity: item.quantity,
          CustomerPartNumber: (item as any).inventory_items?.sku,
        });
      }
    }

    if (missingParts.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Some items are missing DigiKey part numbers",
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
        Company: addr.company_name || addr.attention,
        FirstName: addr.first_name || "",
        LastName: addr.last_name || addr.attention,
        AddressLineOne: addr.street1,
        AddressLineTwo: addr.street2 || "",
        City: addr.city,
        Province: addr.state,
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
            Company: addr.company || "WashGear",
            FirstName: "",
            LastName: addr.attention || "Receiving",
            AddressLineOne: addr.street1,
            AddressLineTwo: addr.street2 || "",
            City: addr.city,
            Province: addr.state,
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

    // Build DigiKey order request
    const digikeyOrder = {
      CustomerReference: po.purchase_order_number,
      ShipToAddress: shipToAddress,
      LineItems: lineItems,
    };

    console.log("Submitting DigiKey order:", JSON.stringify(digikeyOrder, null, 2));

    // Submit order to DigiKey API
    const response = await fetch(`${DIGIKEY_API_BASE}/ordersupport/v2/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-DIGIKEY-Client-Id': clientId,
      },
      body: JSON.stringify(digikeyOrder),
    });

    const responseData = await response.json();
    console.log("DigiKey API response:", JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      throw new Error(`DigiKey API error: ${responseData.Message || responseData.message || JSON.stringify(responseData)}`);
    }

    // Extract order confirmation details
    const salesOrderId = responseData.SalesOrderId || responseData.OrderId;
    const orderStatus = responseData.Status || 'Submitted';

    // Update purchase order with vendor order ID
    const { error: updateError } = await supabase
      .from('purchase_orders')
      .update({
        vendor_order_id: salesOrderId,
        vendor_order_status: orderStatus,
        vendor_delivery_status: 'processing',
        status: 'sent',
      })
      .eq('id', purchaseOrderId);

    if (updateError) {
      console.error("Failed to update PO with DigiKey order ID:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        vendorOrderId: salesOrderId,
        orderStatus,
        message: `Order submitted to DigiKey successfully. Order ID: ${salesOrderId}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in digikey-submit-order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
