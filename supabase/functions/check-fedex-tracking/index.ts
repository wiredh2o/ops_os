import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackingResult {
  orderId: string;
  trackingNumber: string;
  status: 'in_transit' | 'delivered' | 'unknown';
  deliveryDate?: string;
  estimatedDelivery?: string;
  lastEvent?: string;
}

// FedEx event codes that indicate in-transit status
const IN_TRANSIT_CODES = [
  'PU', // Picked up
  'IT', // In transit
  'AR', // Arrived at FedEx location
  'DP', // Departed FedEx location
  'OD', // On FedEx vehicle for delivery
  'AD', // At local FedEx facility
  'AF', // At FedEx destination sort facility
];

// FedEx event codes that indicate delivered status
const DELIVERED_CODES = [
  'DL', // Delivered
];

async function getFedExToken(apiKey: string, secretKey: string): Promise<string> {
  console.log('Getting FedEx auth token...');
  
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
  console.log('Got FedEx token successfully');
  return data.access_token;
}

async function trackPackage(
  token: string, 
  trackingNumber: string
): Promise<{ status: 'in_transit' | 'delivered' | 'unknown'; deliveryDate?: string; estimatedDelivery?: string; lastEvent?: string }> {
  console.log(`Tracking package: ${trackingNumber}`);
  
  const response = await fetch('https://apis-sandbox.fedex.com/track/v1/trackingnumbers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-locale': 'en_US',
    },
    body: JSON.stringify({
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber: trackingNumber,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`FedEx track error for ${trackingNumber}:`, error);
    return { status: 'unknown' };
  }

  const data = await response.json();
  const trackResult = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
  
  if (!trackResult) {
    console.log(`No tracking results for ${trackingNumber}`);
    return { status: 'unknown' };
  }

  // Get latest status
  const latestStatus = trackResult.latestStatusDetail;
  const statusCode = latestStatus?.code;
  const lastEvent = latestStatus?.description;
  
  console.log(`Package ${trackingNumber} status: ${statusCode} - ${lastEvent}`);

  // Check for delivery
  if (DELIVERED_CODES.includes(statusCode)) {
    // Get actual delivery date from scan events
    const deliveryEvent = trackResult.scanEvents?.find(
      (e: any) => DELIVERED_CODES.includes(e.derivedStatus || e.eventType)
    );
    
    return {
      status: 'delivered',
      deliveryDate: deliveryEvent?.date || trackResult.dateAndTimes?.find(
        (d: any) => d.type === 'ACTUAL_DELIVERY'
      )?.dateTime,
      lastEvent,
    };
  }

  // Check for in-transit
  if (IN_TRANSIT_CODES.includes(statusCode)) {
    // Get estimated delivery
    const estimatedDelivery = trackResult.dateAndTimes?.find(
      (d: any) => d.type === 'ESTIMATED_DELIVERY'
    )?.dateTime;

    return {
      status: 'in_transit',
      estimatedDelivery,
      lastEvent,
    };
  }

  return { status: 'unknown', lastEvent };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Starting FedEx Tracking Check ===');

  try {
    const FEDEX_API_KEY = Deno.env.get('FEDEX_SANDBOX_API_KEY');
    const FEDEX_SECRET_KEY = Deno.env.get('FEDEX_SANDBOX_SECRET_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FEDEX_API_KEY || !FEDEX_SECRET_KEY) {
      throw new Error('FedEx credentials not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find orders with tracking numbers that have repair items not yet delivered
    const { data: orders, error: ordersError } = await supabase
      .from('production_orders')
      .select(`
        id,
        order_number,
        fedex_tracking_number,
        production_order_items!inner(
          repair_item_id
        )
      `)
      .not('fedex_tracking_number', 'is', null)
      .eq('status', 'awaiting_pickup')
      .eq('order_type', 'repair');

    if (ordersError) {
      throw new Error(`Failed to fetch orders: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      console.log('No orders with tracking numbers to check');
      return new Response(
        JSON.stringify({ 
          message: 'No orders to check',
          checked: 0,
          updated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get repair item IDs from these orders that aren't already delivered
    const repairItemIds = orders.flatMap(o => 
      o.production_order_items.map((i: any) => i.repair_item_id).filter(Boolean)
    );

    if (repairItemIds.length === 0) {
      console.log('No repair items to check');
      return new Response(
        JSON.stringify({ 
          message: 'No repair items to check',
          checked: 0,
          updated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check which items are not yet delivered
    const { data: repairItems, error: repairItemsError } = await supabase
      .from('repair_items')
      .select('id, status')
      .in('id', repairItemIds)
      .neq('status', 'delivered');

    if (repairItemsError) {
      throw new Error(`Failed to fetch repair items: ${repairItemsError.message}`);
    }

    const itemsToCheck = new Set(repairItems?.map(i => i.id) || []);
    
    if (itemsToCheck.size === 0) {
      console.log('All repair items already delivered');
      return new Response(
        JSON.stringify({ 
          message: 'All items already delivered',
          checked: 0,
          updated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter orders to only those with non-delivered items
    const ordersToCheck = orders.filter(o => 
      o.production_order_items.some((i: any) => itemsToCheck.has(i.repair_item_id))
    );

    console.log(`Checking ${ordersToCheck.length} orders with ${itemsToCheck.size} non-delivered repair items`);

    // Get FedEx token
    const token = await getFedExToken(FEDEX_API_KEY, FEDEX_SECRET_KEY);

    // Track each unique tracking number
    const trackingNumbers = [...new Set(ordersToCheck.map(o => o.fedex_tracking_number))];
    const results: TrackingResult[] = [];
    let updatedCount = 0;

    for (const trackingNumber of trackingNumbers) {
      try {
        const trackResult = await trackPackage(token, trackingNumber);
        
        // Find all orders with this tracking number
        const matchingOrders = ordersToCheck.filter(o => o.fedex_tracking_number === trackingNumber);
        
        for (const order of matchingOrders) {
          results.push({
            orderId: order.id,
            trackingNumber,
            status: trackResult.status,
            deliveryDate: trackResult.deliveryDate,
            estimatedDelivery: trackResult.estimatedDelivery,
            lastEvent: trackResult.lastEvent,
          });

          if (trackResult.status !== 'unknown') {
            // Get repair item IDs for this order that need updating
            const orderRepairItemIds = order.production_order_items
              .map((i: any) => i.repair_item_id)
              .filter((id: string) => itemsToCheck.has(id));

            if (orderRepairItemIds.length > 0) {
              // Update repair items status
              const newStatus = trackResult.status;
              const { error: updateError } = await supabase
                .from('repair_items')
                .update({ status: newStatus })
                .in('id', orderRepairItemIds);

              if (updateError) {
                console.error(`Failed to update repair items for order ${order.id}:`, updateError);
              } else {
                updatedCount += orderRepairItemIds.length;
                console.log(`Updated ${orderRepairItemIds.length} repair items to '${newStatus}'`);
              }
            }

            // Update order tracking metadata
            const orderUpdate: Record<string, any> = {
              fedex_last_status_check: new Date().toISOString(),
            };
            
            if (trackResult.estimatedDelivery) {
              orderUpdate.fedex_estimated_delivery = trackResult.estimatedDelivery;
            }
            
            if (trackResult.deliveryDate) {
              orderUpdate.fedex_delivery_date = trackResult.deliveryDate;
            }

            // Set picked_up_at when we first detect the package is in transit or delivered
            if (trackResult.status === 'in_transit' || trackResult.status === 'delivered') {
              // Check if picked_up_at is already set
              const { data: currentOrder } = await supabase
                .from('production_orders')
                .select('picked_up_at')
                .eq('id', order.id)
                .single();
              
              if (!currentOrder?.picked_up_at) {
                // First carrier scan detected - set picked_up_at
                orderUpdate.picked_up_at = new Date().toISOString();
                console.log(`Setting picked_up_at for order ${order.id}`);
              }
            }

            await supabase
              .from('production_orders')
              .update(orderUpdate)
              .eq('id', order.id);
          }
        }

        // Small delay between API calls to be nice to FedEx
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (trackError) {
        console.error(`Error tracking ${trackingNumber}:`, trackError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`=== FedEx Tracking Check Complete ===`);
    console.log(`Checked: ${trackingNumbers.length} tracking numbers`);
    console.log(`Updated: ${updatedCount} repair items`);
    console.log(`Duration: ${duration}ms`);

    return new Response(
      JSON.stringify({
        message: 'Tracking check complete',
        checked: trackingNumbers.length,
        updated: updatedCount,
        results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-fedex-tracking:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
