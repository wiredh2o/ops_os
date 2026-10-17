import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getUSPSToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://api.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('USPS auth error:', error);
    throw new Error('Failed to authenticate with USPS');
  }

  const data = await response.json();
  return data.access_token;
}

function generateMockLabel(): string {
  // Generate a simple SVG-based mock label
  const mockLabelSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <rect fill="white" width="400" height="600"/>
  <rect fill="#004B87" x="10" y="10" width="380" height="60"/>
  <text fill="white" font-family="Arial" font-size="28" font-weight="bold" x="30" y="50">USPS</text>
  <text fill="#004B87" font-family="Arial" font-size="12" x="20" y="100">SANDBOX MODE - NOT FOR SHIPPING</text>
  <rect fill="none" stroke="#004B87" stroke-width="2" x="20" y="120" width="360" height="100"/>
  <text fill="#004B87" font-family="Arial" font-size="14" x="30" y="150">FROM:</text>
  <text fill="#004B87" font-family="Arial" font-size="12" x="30" y="170">Sample Shipper</text>
  <text fill="#004B87" font-family="Arial" font-size="12" x="30" y="190">123 Origin St, City, ST 12345</text>
  <rect fill="none" stroke="#004B87" stroke-width="2" x="20" y="240" width="360" height="100"/>
  <text fill="#004B87" font-family="Arial" font-size="14" x="30" y="270">TO:</text>
  <text fill="#004B87" font-family="Arial" font-size="12" x="30" y="290">Sample Recipient</text>
  <text fill="#004B87" font-family="Arial" font-size="12" x="30" y="310">456 Dest Ave, Town, ST 67890</text>
  <rect fill="#DA291C" x="20" y="360" width="360" height="80"/>
  <text fill="white" font-family="Arial" font-size="20" font-weight="bold" x="100" y="410">PRIORITY MAIL</text>
  <rect fill="none" stroke="#004B87" stroke-width="1" x="20" y="460" width="360" height="60"/>
  <text fill="#004B87" font-family="monospace" font-size="14" x="50" y="500">9400 MOCK TRACKING</text>
  <rect fill="black" x="50" y="530" width="300" height="50"/>
  <text fill="white" font-family="monospace" font-size="10" x="60" y="560">|||||||||||||||||||||||||||||||||||</text>
</svg>`;

  return btoa(mockLabelSvg);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const USPS_CLIENT_ID = Deno.env.get('USPS_CLIENT_ID');
    const USPS_CLIENT_SECRET = Deno.env.get('USPS_CLIENT_SECRET');
    const USPS_ACCOUNT_ID = Deno.env.get('USPS_ACCOUNT_ID');
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
      container_type, // For flat rate boxes
    } = await req.json();

    if (!order_id || !service_type || !ship_from || !ship_to || !packages) {
      throw new Error('Missing required shipment details');
    }

    // Determine if this is a flat rate shipment
    const isFlatRate = service_type.startsWith('FLAT_RATE_') || !!container_type;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let isMock = false;
    let trackingNumber: string;
    let labelData: string;
    let shippingCost: number;

    // Check if we have USPS credentials
    if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
      console.log('USPS credentials not configured - creating mock shipment');
      isMock = true;

      // Generate mock tracking number (USPS format: 9400 + 18 digits)
      const randomDigits = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join('');
      trackingNumber = `MOCK9400${randomDigits}`;

      // Mock shipping cost based on service or container type
      const flatRatePrices: Record<string, number> = {
        'SMALL_FLAT_RATE_BOX': 9.65,
        'MEDIUM_FLAT_RATE_BOX_TOP': 17.05,
        'MEDIUM_FLAT_RATE_BOX_SIDE': 17.05,
        'LARGE_FLAT_RATE_BOX': 22.90,
        'FLAT_RATE_ENVELOPE': 9.30,
      };
      
      const serviceCosts: Record<string, number> = {
        'USPS_GROUND_ADVANTAGE': 7.99,
        'PRIORITY_MAIL': 12.99,
        'PRIORITY_MAIL_EXPRESS': 32.99,
      };
      
      // Use container type price if it's a flat rate, otherwise use service type
      if (container_type && flatRatePrices[container_type]) {
        shippingCost = flatRatePrices[container_type];
      } else if (service_type.startsWith('FLAT_RATE_')) {
        const boxId = service_type.replace('FLAT_RATE_', '');
        shippingCost = flatRatePrices[boxId] || 9.99;
      } else {
        shippingCost = serviceCosts[service_type] || 9.99;
      }

      // Generate mock label
      labelData = generateMockLabel();
    } else {
      // Real USPS API call
      console.log('Creating USPS label with live credentials');
      const token = await getUSPSToken(USPS_CLIENT_ID, USPS_CLIENT_SECRET);

      // First check EPS balance
      const balanceResponse = await fetch(
        `https://api.usps.com/payments/v3/payment-account/${USPS_ACCOUNT_ID}/balance`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const balance = balanceData.balance || balanceData.availableBalance || 0;
        
        // Estimate label cost (rough estimate for validation)
        const estimatedCost = 15; // Conservative estimate
        if (balance < estimatedCost) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Insufficient EPS balance',
              balance,
              required: estimatedCost,
              shortfall: estimatedCost - balance,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const pkg = packages[0];
      const labelRequest = {
        imageInfo: {
          imageType: 'PDF',
          labelType: 'LABEL_4X6',
        },
        toAddress: {
          firstName: ship_to.name?.split(' ')[0] || 'Recipient',
          lastName: ship_to.name?.split(' ').slice(1).join(' ') || '',
          streetAddress: ship_to.street,
          city: ship_to.city,
          state: ship_to.state,
          ZIPCode: ship_to.postal_code,
        },
        fromAddress: {
          firstName: ship_from.name?.split(' ')[0] || 'Shipper',
          lastName: ship_from.name?.split(' ').slice(1).join(' ') || '',
          streetAddress: ship_from.street,
          city: ship_from.city,
          state: ship_from.state,
          ZIPCode: ship_from.postal_code,
        },
        packageDescription: {
          weight: pkg.weight_lbs || 1,
          length: pkg.dimensions?.length || 6,
          width: pkg.dimensions?.width || 6,
          height: pkg.dimensions?.height || 6,
          mailClass: service_type,
          processingCategory: 'MACHINABLE',
          rateIndicator: 'SP',
        },
      };

      const labelResponse = await fetch('https://api.usps.com/labels/v3/label', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(labelRequest),
      });

      if (!labelResponse.ok) {
        const error = await labelResponse.text();
        console.error('USPS label error:', error);
        throw new Error('Failed to create USPS label');
      }

      const labelResult = await labelResponse.json();
      trackingNumber = labelResult.trackingNumber;
      labelData = labelResult.labelImage;
      shippingCost = labelResult.postage || labelResult.totalPostage || 0;
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

        const fileExtension = isMock ? 'svg' : 'pdf';
        const contentType = isMock ? 'image/svg+xml' : 'application/pdf';
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
          console.log('USPS label uploaded to storage:', labelPath);
        }
      } catch (labelError) {
        console.error('Error processing label:', labelError);
      }
    }

    // Update order in database
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        fedex_tracking_number: trackingNumber,
        fedex_label_url: labelPath,
        shipping_cost: shippingCost,
        shipping_carrier: 'USPS',
        carrier: 'usps',
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
    console.error('Error creating USPS label:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
