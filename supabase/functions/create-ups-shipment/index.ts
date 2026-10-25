import { creditHoldResponse } from '../_shared/credit-hold.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getUPSToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('UPS auth error:', error);
    throw new Error('Failed to authenticate with UPS');
  }

  const data = await response.json();
  return data.access_token;
}

function generateMockLabel(): string {
  // Generate a simple SVG-based mock label as base64 PNG equivalent
  // This is a placeholder - in production we'd use a PDF library
  const mockLabelSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <rect fill="white" width="400" height="600"/>
  <rect fill="#351C15" x="10" y="10" width="380" height="60"/>
  <text fill="white" font-family="Arial" font-size="32" font-weight="bold" x="30" y="50">UPS</text>
  <text fill="#351C15" font-family="Arial" font-size="12" x="20" y="100">SANDBOX MODE - NOT FOR SHIPPING</text>
  <rect fill="none" stroke="#351C15" stroke-width="2" x="20" y="120" width="360" height="100"/>
  <text fill="#351C15" font-family="Arial" font-size="14" x="30" y="150">FROM:</text>
  <text fill="#351C15" font-family="Arial" font-size="12" x="30" y="170">Sample Shipper</text>
  <text fill="#351C15" font-family="Arial" font-size="12" x="30" y="190">123 Origin St, City, ST 12345</text>
  <rect fill="none" stroke="#351C15" stroke-width="2" x="20" y="240" width="360" height="100"/>
  <text fill="#351C15" font-family="Arial" font-size="14" x="30" y="270">TO:</text>
  <text fill="#351C15" font-family="Arial" font-size="12" x="30" y="290">Sample Recipient</text>
  <text fill="#351C15" font-family="Arial" font-size="12" x="30" y="310">456 Dest Ave, Town, ST 67890</text>
  <rect fill="#FFC400" x="20" y="360" width="360" height="80"/>
  <text fill="#351C15" font-family="Arial" font-size="24" font-weight="bold" x="30" y="410">MOCK LABEL</text>
  <rect fill="none" stroke="#351C15" stroke-width="1" x="20" y="460" width="360" height="60"/>
  <text fill="#351C15" font-family="monospace" font-size="16" x="80" y="500">1Z MOCK TRACKING</text>
  <rect fill="black" x="50" y="530" width="300" height="50"/>
  <text fill="white" font-family="monospace" font-size="10" x="60" y="560">|||||||||||||||||||||||||||||||||||</text>
</svg>`;

  // Convert SVG to base64
  return btoa(mockLabelSvg);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['ups']);
    const UPS_CLIENT_ID = TENANT_KEYS['UPS_CLIENT_ID'];
    const UPS_CLIENT_SECRET = TENANT_KEYS['UPS_CLIENT_SECRET'];
    const UPS_ACCOUNT_NUMBER = TENANT_KEYS['UPS_ACCOUNT_NUMBER'];
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const {
      order_id,
      service_type,
      ship_from,
      ship_to,
      packages,
      label_format,
      // Third-party billing parameters
      third_party_billing,
      third_party_ups_account,
      third_party_ups_zip,
    } = await req.json();

    console.log('Creating UPS shipment:', { order_id, service_type, third_party_billing });

    if (!order_id || !service_type || !ship_from || !ship_to || !packages) {
      throw new Error('Missing required shipment details');
    }

    const held = await creditHoldResponse(order_id, corsHeaders);
    if (held) return held;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let isMock = false;
    let trackingNumber: string;
    let labelData: string;
    let shippingCost: number;

    // Check if we have UPS credentials
    if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET || !UPS_ACCOUNT_NUMBER) {
      console.log('UPS credentials not configured - creating mock shipment');
      isMock = true;

      // Generate mock tracking number (UPS format: 1Z + 6 alphanumeric + 2 digits + 8 digits)
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const randomDigits = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
      trackingNumber = `MOCK1Z${randomPart}00${randomDigits}`;

      // Mock shipping cost based on service
      const serviceCosts: Record<string, number> = {
        '03': 12.99,  // Ground
        '12': 19.99,  // 3 Day Select
        '02': 28.99,  // 2nd Day Air
        '01': 49.99,  // Next Day Air
      };
      shippingCost = serviceCosts[service_type] || 15.99;

      // Generate mock label
      labelData = generateMockLabel();
    } else {
      // Real UPS API call
      console.log('Creating UPS shipment with live credentials');
      const token = await getUPSToken(UPS_CLIENT_ID, UPS_CLIENT_SECRET);

      const shipmentRequest = {
        ShipmentRequest: {
          Request: {
            RequestOption: 'nonvalidate',
          },
          Shipment: {
            Description: 'Package',
            Shipper: {
              Name: ship_from.name || ship_from.company || 'Shipper',
              ShipperNumber: UPS_ACCOUNT_NUMBER,
              Phone: { Number: ship_from.phone || '0000000000' },
              Address: {
                AddressLine: [ship_from.street, ship_from.street2].filter(Boolean),
                City: ship_from.city,
                StateProvinceCode: ship_from.state,
                PostalCode: ship_from.postal_code,
                CountryCode: ship_from.country || 'US',
              },
            },
            ShipTo: {
              Name: ship_to.name || ship_to.company || 'Recipient',
              Phone: { Number: ship_to.phone || '0000000000' },
              Address: {
                AddressLine: [ship_to.street, ship_to.street2].filter(Boolean),
                City: ship_to.city,
                StateProvinceCode: ship_to.state,
                PostalCode: ship_to.postal_code,
                CountryCode: ship_to.country || 'US',
              },
            },
            ShipFrom: {
              Name: ship_from.name || ship_from.company || 'Shipper',
              Phone: { Number: ship_from.phone || '0000000000' },
              Address: {
                AddressLine: [ship_from.street, ship_from.street2].filter(Boolean),
                City: ship_from.city,
                StateProvinceCode: ship_from.state,
                PostalCode: ship_from.postal_code,
                CountryCode: ship_from.country || 'US',
              },
            },
            PaymentInformation: third_party_billing && third_party_ups_account ? {
              ShipmentCharge: [{
                Type: '01',
                BillThirdParty: {
                  AccountNumber: third_party_ups_account,
                  Address: {
                    PostalCode: third_party_ups_zip || '',
                    CountryCode: 'US',
                  },
                },
              }],
            } : {
              ShipmentCharge: [{
                Type: '01',
                BillShipper: {
                  AccountNumber: UPS_ACCOUNT_NUMBER,
                },
              }],
            },
            Service: { Code: service_type },
            Package: packages.map((pkg: any) => ({
              Packaging: { Code: '02' }, // Customer Supplied Package
              Dimensions: pkg.dimensions ? {
                UnitOfMeasurement: { Code: 'IN' },
                Length: String(pkg.dimensions.length),
                Width: String(pkg.dimensions.width),
                Height: String(pkg.dimensions.height),
              } : undefined,
              PackageWeight: {
                UnitOfMeasurement: { Code: 'LBS' },
                Weight: String(pkg.weight_lbs || 1),
              },
            })),
          },
          LabelSpecification: {
            LabelImageFormat: { Code: 'PNG' },
            LabelStockSize: { Height: '6', Width: '4' },
          },
        },
      };

      const shipResponse = await fetch('https://onlinetools.ups.com/api/shipments/v1/ship', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'transId': crypto.randomUUID(),
          'transactionSrc': 'lovable',
        },
        body: JSON.stringify(shipmentRequest),
      });

      if (!shipResponse.ok) {
        const errorText = await shipResponse.text();
        console.error('UPS shipment error:', errorText);
        
        // Check if this is a third-party billing error
        const isThirdPartyError = third_party_billing && (
          errorText.includes('INVALID') ||
          errorText.includes('invalid') ||
          errorText.includes('ACCOUNT') ||
          errorText.includes('account') ||
          errorText.includes('THIRD') ||
          errorText.includes('third') ||
          errorText.includes('BILLING') ||
          errorText.includes('billing') ||
          errorText.includes('120124') // UPS billing error code
        );
        
        if (isThirdPartyError) {
          return new Response(
            JSON.stringify({ 
              error: 'Third-party billing failed', 
              isThirdPartyError: true,
              details: errorText 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error('Failed to create UPS shipment');
      }

      const shipData = await shipResponse.json();
      const packageResult = shipData.ShipmentResponse?.ShipmentResults?.PackageResults?.[0];

      trackingNumber = packageResult?.TrackingNumber;
      labelData = packageResult?.ShippingLabel?.GraphicImage;
      shippingCost = parseFloat(
        shipData.ShipmentResponse?.ShipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue || '0'
      );
    }

    // Upload label to Supabase Storage
    let labelPath = null;
    if (labelData) {
      try {
        const binaryString = atob(labelData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const fileExtension = isMock ? 'svg' : 'png';
        const contentType = isMock ? 'image/svg+xml' : 'image/png';
        const fileName = `${trackingNumber}_${Date.now()}.${fileExtension}`;

        const { error: uploadError } = await supabase
          .storage
          .from('shipping-labels')
          .upload(fileName, bytes, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error('Failed to upload label to storage:', uploadError);
        } else {
          labelPath = fileName;
          console.log('UPS label uploaded to storage:', labelPath);
        }
      } catch (labelError) {
        console.error('Error processing label:', labelError);
      }
    }

    // Update order in database
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        fedex_tracking_number: trackingNumber, // Using same field for compatibility
        fedex_label_url: labelPath,
        shipping_cost: shippingCost,
        shipping_carrier: 'UPS',
        carrier: 'ups',
        is_mock_shipment: isMock,
        label_created_at: new Date().toISOString(),
        status: 'label_staged',
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tracking_number: trackingNumber,
        label_path: labelPath,
        shipping_cost: shippingCost,
        isMock,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error creating UPS shipment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
