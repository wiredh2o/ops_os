import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getFedExToken(apiKey: string, secretKey: string): Promise<string> {
  const response = await fetch('https://apis-sandbox.fedex.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: secretKey,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('FedEx auth error:', error);
    throw new Error('Failed to authenticate with FedEx');
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['fedex']);
    const FEDEX_API_KEY = TENANT_KEYS['FEDEX_SANDBOX_API_KEY'];
    const FEDEX_SECRET_KEY = TENANT_KEYS['FEDEX_SANDBOX_SECRET_KEY'];
    const FEDEX_ACCOUNT_NUMBER = TENANT_KEYS['FEDEX_SANDBOX_ACCOUNT'];
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FEDEX_API_KEY || !FEDEX_SECRET_KEY || !FEDEX_ACCOUNT_NUMBER) {
      throw new Error('FedEx credentials not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const { 
      order_id,
      service_type,
      ship_from,
      ship_to,
      packages,
      signature_required,
      label_format,
      // Doc-tab summary values not known to FedEx (invoice, customer, dept, handling)
      doc_tab,
      // Third-party billing parameters
      third_party_billing,
      third_party_fedex_account,
      third_party_fedex_zip,
    } = await req.json();

    console.log('Creating FedEx shipment:', { order_id, service_type, third_party_billing });

    if (!order_id || !service_type || !ship_from || !ship_to || !packages) {
      throw new Error('Missing required shipment details');
    }

    // Get auth token
    const token = await getFedExToken(FEDEX_API_KEY, FEDEX_SECRET_KEY);

    // Build shipment request - use LABEL to get Base64 data instead of temporary URL
    const shipmentRequest = {
      labelResponseOptions: 'LABEL',
      requestedShipment: {
        shipper: {
          contact: {
            personName: ship_from.name || ship_from.company || 'Shipping Dept',
            phoneNumber: ship_from.phone || '0000000000',
            ...(ship_from.company ? { companyName: ship_from.company } : {}),
          },
          address: {
            streetLines: [ship_from.street, ship_from.street2].filter(Boolean),
            city: ship_from.city,
            stateOrProvinceCode: ship_from.state,
            postalCode: ship_from.postal_code,
            countryCode: ship_from.country || 'US',
          },
        },
        recipients: [{
          contact: {
            personName: ship_to.name || ship_to.company,
            phoneNumber: ship_to.phone || '0000000000',
            ...(ship_to.company && ship_to.company !== ship_to.name ? { companyName: ship_to.company } : {}),
          },
          address: {
            streetLines: [ship_to.street, ship_to.street2].filter(Boolean),
            city: ship_to.city,
            stateOrProvinceCode: ship_to.state,
            postalCode: ship_to.postal_code,
            countryCode: ship_to.country || 'US',
            residential: ship_to.residential ?? true,
          },
        }],
        shipDatestamp: new Date().toISOString().split('T')[0],
        serviceType: service_type,
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        blockInsightVisibility: false,
        shippingChargesPayment: third_party_billing && third_party_fedex_account ? {
          paymentType: 'THIRD_PARTY',
          payor: {
            responsibleParty: {
              accountNumber: {
                value: third_party_fedex_account,
              },
              address: {
                postalCode: third_party_fedex_zip || '',
                countryCode: 'US',
              },
            },
          },
        } : {
          paymentType: 'SENDER',
          payor: {
            responsibleParty: {
              accountNumber: {
                value: FEDEX_ACCOUNT_NUMBER,
              },
            },
          },
        },
        labelSpecification: (() => {
          // Default to PDF for sharp vector-based text and barcodes
          const imageType = (label_format || 'PDF').toUpperCase();
          const isThermal = imageType === 'ZPLII' || imageType === 'EPL2';
          // FedEx only offers doc tabs on thermal stock: 4" x 6.75" with the
          // last 3/4" as a trailing peel-off summary tab.
          if (!isThermal) {
            return { imageType, labelStockType: 'PAPER_4X675', labelPrintingOrientation: 'BOTTOM_EDGE_OF_TEXT_FIRST' };
          }
          const lit = (v: unknown) => (v == null ? '' : String(v)).slice(0, 30);
          const zones = [
            { zoneNumber: 1, header: 'Invoice', literalValue: lit(doc_tab?.invoice) },
            { zoneNumber: 2, header: 'Custo', literalValue: lit(doc_tab?.customer) },
            { zoneNumber: 3, header: 'Dept', literalValue: lit(doc_tab?.dept) },
            { zoneNumber: 4, header: 'Date', dataField: 'REQUEST/SHIPMENT/ShipTimestamp' },
            { zoneNumber: 5, header: 'Weight', dataField: 'REQUEST/PACKAGE/Weight/Value' },
            { zoneNumber: 6, header: 'COD', dataField: 'REQUEST/SHIPMENT/SpecialServicesRequested/CodDetail/CodCollectionAmount/Amount' },
            { zoneNumber: 7, header: 'DV', dataField: 'REQUEST/PACKAGE/InsuredValue/Amount' },
            { zoneNumber: 8, header: 'Shipping', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalBaseCharge/Amount' },
            { zoneNumber: 9, header: 'Special', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalSurcharges/Amount' },
            { zoneNumber: 10, header: 'Handling', literalValue: lit(doc_tab?.handling ?? '0.00') },
            { zoneNumber: 11, header: 'Total', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalNetCharge/Amount' },
          ];
          return {
            imageType,
            labelStockType: 'STOCK_4X675_TRAILING_DOC_TAB',
            labelPrintingOrientation: 'BOTTOM_EDGE_OF_TEXT_FIRST',
            customerSpecifiedDetail: {
              docTabContent: {
                docTabContentType: 'ZONE001',
                zone001: { docTabZoneSpecifications: zones },
              },
            },
          };
        })(),
        requestedPackageLineItems: packages.map((pkg: any) => ({
          weight: {
            value: pkg.weight_lbs || 1,
            units: 'LB',
          },
          dimensions: pkg.dimensions ? {
            length: pkg.dimensions.length,
            width: pkg.dimensions.width,
            height: pkg.dimensions.height,
            units: 'IN',
          } : undefined,
        })),
      },
      accountNumber: {
        value: FEDEX_ACCOUNT_NUMBER,
      },
    };

    // Add signature option if required
    if (signature_required) {
      shipmentRequest.requestedShipment.requestedPackageLineItems[0].packageSpecialServices = {
        signatureOptionType: 'DIRECT',
      };
    }

    const shipResponse = await fetch('https://apis-sandbox.fedex.com/ship/v1/shipments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify(shipmentRequest),
    });

    if (!shipResponse.ok) {
      const errorText = await shipResponse.text();
      console.error('FedEx shipment error:', errorText);
      
      // Check if this is a third-party billing error
      const isThirdPartyError = third_party_billing && (
        errorText.includes('INVALID') ||
        errorText.includes('ACCOUNT') ||
        errorText.includes('THIRD') ||
        errorText.includes('BILLING') ||
        errorText.includes('NOT AUTHORIZED') ||
        errorText.includes('not authorized')
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
      
      throw new Error('Failed to create FedEx shipment');
    }

    const shipData = await shipResponse.json();
    const pieceResponses = shipData.output?.transactionShipments?.[0]?.pieceResponses || [];
    
    const trackingNumber = pieceResponses[0]?.trackingNumber;
    const encodedLabel = pieceResponses[0]?.packageDocuments?.[0]?.encodedLabel;
    const totalCharge = shipData.output?.transactionShipments?.[0]?.completedShipmentDetail?.shipmentRating?.shipmentRateDetails?.[0]?.totalNetCharge;

    console.log('Created shipment:', { trackingNumber, hasLabel: !!encodedLabel });

    // Create Supabase client for storage and database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upload label to Supabase Storage (private bucket - role-restricted access)
    let labelPath = null;
    if (encodedLabel) {
      try {
        // Decode Base64 label data
        const binaryString = atob(encodedLabel);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const imageFormat = (label_format || 'PDF').toUpperCase();
        const fileExtension = imageFormat === 'PNG' ? 'png' : 'pdf';
        const contentType = imageFormat === 'PNG' ? 'image/png' : 'application/pdf';
        const fileName = `${trackingNumber}_${Date.now()}.${fileExtension}`;
        
        const { error: uploadError } = await supabase
          .storage
          .from('shipping-labels')
          .upload(fileName, bytes, {
            contentType: contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error('Failed to upload label to storage:', uploadError);
        } else {
          // Store the file path - frontend will generate signed URLs for authorized users
          labelPath = fileName;
          console.log('Label uploaded to secure storage:', labelPath);
        }
      } catch (labelError) {
        console.error('Error processing label:', labelError);
      }
    }

    // Update order in database with the label path (not a public URL)
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        fedex_tracking_number: trackingNumber,
        fedex_label_url: labelPath, // Store path, not URL - frontend generates signed URLs
        shipping_cost: totalCharge,
        shipping_carrier: 'FedEx',
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
        label_path: labelPath, // Return path for frontend to generate signed URLs
        shipping_cost: totalCharge,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating FedEx shipment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
