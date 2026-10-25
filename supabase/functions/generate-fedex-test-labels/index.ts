import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys, getCaller } from "../_shared/tenant-integrations.ts";
import { fedexDocTabLabelSpec } from "../_shared/fedex-doc-tab.ts";

// Generates FedEx SANDBOX test labels for the Bar Code Analysis Group
// certification packet. Returns raw label data (ZPL) directly in the
// response — nothing is written to the database or storage, so no
// fictitious orders, shipments, or tracking rows ever exist.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Address {
  name: string;
  company?: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  country?: string;
  residential?: boolean;
}

interface ScenarioResult {
  scenario: string;
  service: string;
  labels: { trackingNumber: string; sequence: number; totalPieces: number; zplBase64: string }[];
  error?: string;
}

async function getFedExToken(apiKey: string, secretKey: string): Promise<string> {
  const response = await fetch('https://apis-sandbox.fedex.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: secretKey,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`FedEx sandbox authentication failed (${response.status}). Check the saved sandbox API key and secret.`);
  }
  return (await response.json()).access_token;
}

function fedexParty(a: Address) {
  return {
    contact: {
      personName: a.name || a.company || 'Shipping Dept',
      phoneNumber: a.phone,
      ...(a.company ? { companyName: a.company } : {}),
    },
    address: {
      streetLines: [a.street, a.street2].filter(Boolean),
      city: a.city,
      stateOrProvinceCode: a.state,
      postalCode: a.postal_code,
      countryCode: a.country || 'US',
      ...(a.residential !== undefined ? { residential: a.residential } : {}),
    },
  };
}

async function createShipment(
  token: string,
  accountNumber: string,
  shipFrom: Address,
  shipTo: Address,
  serviceType: string,
  pieces: { weight: number; length: number; width: number; height: number }[],
  scenario: string,
): Promise<{ trackingNumber: string; sequence: number; totalPieces: number; zplBase64: string }[]> {
  const totalPackageCount = pieces.length;
  const shipmentRequest = {
    labelResponseOptions: 'LABEL',
    requestedShipment: {
      shipper: fedexParty(shipFrom),
      recipients: [fedexParty(shipTo)],
      shipDatestamp: new Date().toISOString().split('T')[0],
      serviceType,
      packagingType: 'YOUR_PACKAGING',
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      blockInsightVisibility: false,
      totalPackageCount,
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: { responsibleParty: { accountNumber: { value: accountNumber } } },
      },
      labelSpecification: fedexDocTabLabelSpec({
        invoice: `TEST-${scenario}`,
        customer: shipTo.company || shipTo.name,
        handling: '0.00',
      }),
      requestedPackageLineItems: pieces.map((p, i) => ({
        sequenceNumber: i + 1,
        groupPackageCount: 1,
        weight: { value: p.weight, units: 'LB' },
        dimensions: { length: p.length, width: p.width, height: p.height, units: 'IN' },
      })),
    },
    accountNumber: { value: accountNumber },
  };

  const res = await fetch('https://apis-sandbox.fedex.com/ship/v1/shipments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-locale': 'en_US' },
    body: JSON.stringify(shipmentRequest),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`FedEx rejected the ${serviceType} shipment: ${errorText.slice(0, 500)}`);
  }

  const data = await res.json();
  const pieceResponses = data.output?.transactionShipments?.[0]?.pieceResponses ?? [];

  // Capture EVERY piece — certification requires a label for each package
  // in a multi-piece shipment (master + child CRN labels).
  return pieceResponses.map((piece: any, i: number) => ({
    trackingNumber: piece.trackingNumber,
    sequence: i + 1,
    totalPieces: totalPackageCount,
    zplBase64: piece.packageDocuments?.[0]?.encodedLabel ?? '',
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Staff only — this uses the company's FedEx sandbox credentials.
    const caller = await getCaller(req);
    if (!caller?.isStaff) {
      return new Response(JSON.stringify({ error: 'Staff sign-in required.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const TENANT_KEYS = await loadTenantKeys(req, ['fedex']);
    const FEDEX_API_KEY = TENANT_KEYS['FEDEX_SANDBOX_API_KEY'];
    const FEDEX_SECRET_KEY = TENANT_KEYS['FEDEX_SANDBOX_SECRET_KEY'];
    const FEDEX_ACCOUNT_NUMBER = TENANT_KEYS['FEDEX_SANDBOX_ACCOUNT'];
    if (!FEDEX_API_KEY || !FEDEX_SECRET_KEY || !FEDEX_ACCOUNT_NUMBER) {
      throw new Error('FedEx sandbox credentials are not configured for this company.');
    }

    const { ship_from, ship_to, weight_lbs, dimensions } = await req.json();
    if (!ship_from?.phone || !ship_to?.phone) {
      throw new Error('FedEx certification requires real 10-digit phone numbers for both shipper and recipient.');
    }
    if (!ship_from?.street || !ship_to?.street || !weight_lbs || !dimensions) {
      throw new Error('Missing ship-from, ship-to, weight, or dimensions.');
    }

    const token = await getFedExToken(FEDEX_API_KEY, FEDEX_SECRET_KEY);
    const pkg = { weight: weight_lbs, length: dimensions.length, width: dimensions.width, height: dimensions.height };

    const scenarios: { name: string; service: string; pieces: typeof pkg[] }[] = [
      { name: 'Single-piece Ground', service: 'FEDEX_GROUND', pieces: [pkg] },
      { name: 'Single-piece Express 2Day', service: 'FEDEX_2_DAY', pieces: [pkg] },
      { name: 'Multi-piece Ground (2 boxes)', service: 'FEDEX_GROUND', pieces: [pkg, pkg] },
    ];

    const results: ScenarioResult[] = [];
    for (const s of scenarios) {
      try {
        const labels = await createShipment(token, FEDEX_ACCOUNT_NUMBER, ship_from, ship_to, s.service, s.pieces, s.scenario ?? s.name ?? s.service);
        results.push({ scenario: s.name, service: s.service, labels });
      } catch (e) {
        results.push({ scenario: s.name, service: s.service, labels: [], error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating FedEx test labels:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
