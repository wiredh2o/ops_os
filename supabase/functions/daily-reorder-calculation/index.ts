
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LeanPullReorderData {
  reorder_point: number;
  demand_rate: number;
  safety_stock: number;
  recommended_order_qty: number;
  moq_coverage_days?: number;
}

interface AssemblyLeanPullReorderData {
  reorder_point: number;
  demand_rate: number;
  safety_stock: number;
  recommended_order_qty: number;
}

interface ReorderTrigger {
  item_type: 'inventory_item' | 'assembly';
  item_id: string;
  current_quantity: number;
  reorder_point: number;
  trending_velocity: number;
  trigger_reason: string;
}

interface OrderGeneration {
  item_id: string;
  item_type: 'inventory_item' | 'assembly';
  quantity_needed: number;
  lead_time_days: number;
  reason: string;
}

// Helper function to get current hour in Mountain Time (handles DST automatically)
const getMountainHour = (): number => {
  const now = new Date();
  const mtTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    hour12: false
  }).format(now);
  return parseInt(mtTime, 10);
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    // DST-aware scheduling: Only run at 1 AM or 1 PM Mountain Time
    // This allows multiple cron jobs (MST and MDT times) to trigger,
    // but only the correct one for the current DST state will execute
    const currentMTHour = getMountainHour();
    const targetHours = [1, 13]; // 1 AM and 1 PM MT
    
    // Check if this is a manual trigger (parse JSON body properly)
    let isManualTrigger = false;
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const bodyJson = JSON.parse(bodyText);
        isManualTrigger = bodyJson?.manual === true;
      }
    } catch (e) {
      // Body is not valid JSON or empty, not a manual trigger
      isManualTrigger = false;
    }
    
    if (!isManualTrigger && !targetHours.includes(currentMTHour)) {
      console.log(`Skipping: Current MT hour is ${currentMTHour}, not a target hour (1 AM or 1 PM MT)`);
      return new Response(
        JSON.stringify({ 
          skipped: true, 
          reason: `Current MT hour (${currentMTHour}) is not a scheduled run time (1 AM or 1 PM MT)`,
          targetHours,
          currentMTHour
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Running reorder calculation at ${currentMTHour}:00 MT${isManualTrigger ? ' (manual trigger)' : ''}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting enhanced LEAN pull inventory calculation with 365-day analysis...');

    const reorderTriggers: ReorderTrigger[] = [];
    const ordersToGenerate: OrderGeneration[] = [];

    // Get all inventory items with lead times - include quantity_atp for correct effective inventory
    // FIX #4: Use quantity_atp which accounts for allocations (on_hand - allocated + on_order)
    const { data: inventoryItems, error: inventoryError } = await supabase
      .from('inventory_items')
      .select('id, sku, lead_time_days, minimum_order_quantity, quantity_on_hand, quantity_on_order, quantity_atp, reorder_point')
      .filter('lead_time_days', 'not.is', null);

    if (inventoryError) {
      console.error('Error fetching inventory items:', inventoryError);
      throw inventoryError;
    }

    console.log(`Processing ${inventoryItems?.length || 0} inventory items with enhanced LEAN pull methodology (365-day analysis)`);

    let itemsProcessed = 0;
    let itemsNeedingReorder = 0;

    // Process each inventory item using enhanced LEAN pull calculations (365-day analysis)
    for (const item of inventoryItems || []) {
      try {
        itemsProcessed++;
        
        // Calculate enhanced LEAN pull reorder point with 365-day analysis and MOQ optimization
        const { data: leanPullData, error: leanPullError } = await supabase
          .rpc('calculate_lean_pull_reorder_point', {
            item_id: item.id,
            lead_time_days: item.lead_time_days,
            minimum_order_quantity: item.minimum_order_quantity || 1,
            analysis_period_days: 365 // Now using full year for more stable calculations
          });

        if (leanPullError) {
          console.error(`Error calculating enhanced LEAN pull reorder point for item ${item.id}:`, leanPullError);
          continue;
        }

        if (leanPullData && leanPullData.length > 0) {
          const pullData = leanPullData[0] as LeanPullReorderData;
          
          // Update inventory item with new enhanced LEAN pull reorder point
          const { error: updateError } = await supabase
            .from('inventory_items')
            .update({ reorder_point: pullData.reorder_point })
            .eq('id', item.id);

          if (updateError) {
            console.error(`Error updating reorder point for item ${item.id}:`, updateError);
          }

          // FIX #4: Use quantity_atp which correctly accounts for allocations
          // quantity_atp = on_hand - allocated + on_order (already calculated by DB)
          const effectiveInventory = item.quantity_atp ?? (item.quantity_on_hand + (item.quantity_on_order || 0));
          
          // True LEAN pull: only order when effective inventory falls below reorder point
          if (effectiveInventory < pullData.reorder_point) {
            // Check for existing draft PO to update instead of creating new
            const { data: existingDraftItem } = await supabase
              .from('purchase_order_items')
              .select(`
                id,
                quantity,
                purchase_order_id,
                purchase_orders!inner(id, purchase_order_number, status, auto_generated)
              `)
              .eq('inventory_item_id', item.id)
              .eq('purchase_orders.status', 'draft')
              .eq('purchase_orders.auto_generated', true)
              .limit(1)
              .maybeSingle();

            if (existingDraftItem) {
              // Update existing draft PO item quantity
              const { error: updateError } = await supabase
                .from('purchase_order_items')
                .update({
                  quantity: pullData.recommended_order_qty,
                  quantity_remaining: pullData.recommended_order_qty,
                  notes: `Updated by LEAN Pull - 365-day Demand Rate=${pullData.demand_rate.toFixed(3)}/day, Safety Stock=${pullData.safety_stock.toFixed(0)}`
                })
                .eq('id', existingDraftItem.id);

              if (!updateError) {
                console.log(`Updated existing draft PO ${(existingDraftItem as any).purchase_orders?.purchase_order_number} for ${item.sku}: ${pullData.recommended_order_qty} units`);
              }
              // Don't add to ordersToGenerate since we updated existing
              continue;
            }

            itemsNeedingReorder++;
            
            reorderTriggers.push({
              item_type: 'inventory_item',
              item_id: item.id,
              current_quantity: item.quantity_on_hand,
              reorder_point: pullData.reorder_point,
              trending_velocity: pullData.demand_rate,
              trigger_reason: `Enhanced LEAN Pull: Effective inventory (${effectiveInventory}) below reorder point (${pullData.reorder_point}) - 365-day analysis`
            });

            // Add to order generation queue with CORRECTED order quantity
            // FIX #1: Order qty = shortage + lead time demand (not just lead time demand)
            const waitQty = Math.ceil(pullData.demand_rate * item.lead_time_days);
            const moq = item.minimum_order_quantity || 1;
            
            // Calculate shortage: how far below reorder point are we?
            const shortage = Math.max(pullData.reorder_point - effectiveInventory, 0);
            // Natural order qty = shortage + demand during lead time
            const naturalQty = shortage + waitQty;
            // Apply MOQ
            const correctedOrderQty = Math.max(naturalQty, moq);
            
            // Reverse-calculate demand stddev from safety stock: safety = 3.09 × stddev × √(leadTime)
            const zScore = 3.09;
            const sqrtLeadTime = Math.sqrt(item.lead_time_days);
            const demandStdDev = pullData.safety_stock > 0 
              ? (pullData.safety_stock / (zScore * sqrtLeadTime)).toFixed(2)
              : '0';
            
            // Get quantity_allocated from item (we need to fetch it separately since it wasn't in original select)
            const onHand = item.quantity_on_hand || 0;
            const onOrder = item.quantity_on_order || 0;
            // Calculate allocated from ATP: ATP = on_hand - allocated + on_order, so allocated = on_hand + on_order - ATP
            const allocated = Math.max(0, onHand + onOrder - effectiveInventory);
            const demandDuringLeadTime = waitQty;
            
            // Format: FRIENDLY|demandRate|leadTime|waitQty|safetyStock|reorderPoint|effectiveInv|orderQty|sku|moq|naturalQty|demandStdDev|shortage|onHand|allocated|onOrder|demandDuringLeadTime
            const friendlyReason = `FRIENDLY|${pullData.demand_rate.toFixed(2)}|${item.lead_time_days}|${waitQty}|${Math.round(pullData.safety_stock)}|${pullData.reorder_point}|${effectiveInventory}|${correctedOrderQty}|${item.sku}|${moq}|${naturalQty}|${demandStdDev}|${shortage}|${onHand}|${allocated}|${onOrder}|${demandDuringLeadTime}`;
            
            ordersToGenerate.push({
              item_id: item.id,
              item_type: 'inventory_item',
              quantity_needed: correctedOrderQty,  // FIX #1: Use corrected qty
              lead_time_days: item.lead_time_days,
              reason: friendlyReason
            });

            console.log(`Item ${item.sku}: Enhanced pull triggered - ATP: ${effectiveInventory}, Reorder: ${pullData.reorder_point}, Shortage: ${shortage}, WaitQty: ${waitQty}, Order Qty: ${correctedOrderQty}`);
          }
        }
      } catch (itemError) {
        console.error(`Error processing inventory item ${item.id}:`, itemError);
      }
    }

    // Process assemblies with enhanced LEAN pull methodology (365-day analysis)
    // FIX #5: Only process assemblies WITH lead_time_days set (skip those without)
    const { data: assemblies, error: assembliesError } = await supabase
      .from('assemblies')
      .select('id, sku, lead_time_days, quantity_on_hand, quantity_on_order, quantity_atp, reorder_point, last_14_day_check_date, auto_production_orders_generated')
      .not('lead_time_days', 'is', null);

    if (assembliesError) {
      console.error('Error fetching assemblies:', assembliesError);
    }

    let assembliesProcessed = 0;
    let assembliesNeedingReorder = 0;
    let assemblyAutoOrdersGenerated = 0;

    for (const assembly of assemblies || []) {
      try {
        assembliesProcessed++;
        
        // FIX #5: lead_time_days is guaranteed non-null by the query filter
        const assemblyLeadTime = assembly.lead_time_days!;
        
        // Calculate assembly enhanced LEAN pull reorder point with 365-day analysis
        const { data: assemblyPullData, error: assemblyPullError } = await supabase
          .rpc('calculate_assembly_lean_pull_reorder_point', {
            assembly_id_param: assembly.id,
            lead_time_days: assemblyLeadTime,
            analysis_period_days: 365 // Enhanced 365-day analysis
          });

        if (assemblyPullError) {
          console.error(`Error calculating assembly enhanced LEAN pull reorder point for ${assembly.id}:`, assemblyPullError);
          continue;
        }

        if (assemblyPullData && assemblyPullData.length > 0) {
          const pullData = assemblyPullData[0] as AssemblyLeanPullReorderData;
          
          // Update assembly with new enhanced LEAN pull reorder point
          const { error: updateError } = await supabase
            .from('assemblies')
            .update({ reorder_point: pullData.reorder_point })
            .eq('id', assembly.id);

          if (updateError) {
            console.error(`Error updating assembly reorder point for ${assembly.id}:`, updateError);
          }

          // FIX #4: Use quantity_atp for assemblies too
          const effectiveInventory = assembly.quantity_atp ?? (assembly.quantity_on_hand + (assembly.quantity_on_order || 0));
          
          // True LEAN pull: only order when effective inventory falls below reorder point
          if (effectiveInventory < pullData.reorder_point) {
            assembliesNeedingReorder++;
            
            reorderTriggers.push({
              item_type: 'assembly',
              item_id: assembly.id,
              current_quantity: assembly.quantity_on_hand,
              reorder_point: pullData.reorder_point,
              trending_velocity: pullData.demand_rate,
              trigger_reason: `Enhanced LEAN Pull: Assembly effective inventory (${effectiveInventory}) below reorder point (${pullData.reorder_point}) - 365-day analysis`
            });

            // FIX #1: Calculate corrected order quantity for assemblies too
            const assemblyWaitQty = Math.ceil(pullData.demand_rate * assemblyLeadTime);
            const assemblyShortage = Math.max(pullData.reorder_point - effectiveInventory, 0);
            const assemblyNaturalQty = assemblyShortage + assemblyWaitQty;
            const assemblyCorrectedQty = Math.max(assemblyNaturalQty, 1); // MOQ = 1 for assemblies
            
            // Reverse-calculate demand stddev from safety stock: safety = 3.09 × stddev × √(leadTime)
            const zScoreAssembly = 3.09;
            const sqrtAssemblyLeadTime = Math.sqrt(assemblyLeadTime);
            const assemblyDemandStdDev = pullData.safety_stock > 0 
              ? (pullData.safety_stock / (zScoreAssembly * sqrtAssemblyLeadTime)).toFixed(2)
              : '0';
            
            // Get inventory values for assemblies
            const assemblyOnHand = assembly.quantity_on_hand || 0;
            const assemblyOnOrder = assembly.quantity_on_order || 0;
            // Calculate allocated from ATP: ATP = on_hand - allocated + on_order, so allocated = on_hand + on_order - ATP
            const assemblyAllocated = Math.max(0, assemblyOnHand + assemblyOnOrder - effectiveInventory);
            const assemblyDemandDuringLeadTime = assemblyWaitQty;
            
            // Format: FRIENDLY|demandRate|leadTime|waitQty|safetyStock|reorderPoint|effectiveInv|orderQty|sku|moq|naturalQty|demandStdDev|shortage|onHand|allocated|onOrder|demandDuringLeadTime
            const assemblyFriendlyReason = `FRIENDLY|${pullData.demand_rate.toFixed(2)}|${assemblyLeadTime}|${assemblyWaitQty}|${Math.round(pullData.safety_stock)}|${pullData.reorder_point}|${effectiveInventory}|${assemblyCorrectedQty}|${assembly.sku}|1|${assemblyNaturalQty}|${assemblyDemandStdDev}|${assemblyShortage}|${assemblyOnHand}|${assemblyAllocated}|${assemblyOnOrder}|${assemblyDemandDuringLeadTime}`;
            
            ordersToGenerate.push({
              item_id: assembly.id,
              item_type: 'assembly',
              quantity_needed: assemblyCorrectedQty,  // FIX #1: Use corrected qty
              lead_time_days: assemblyLeadTime,
              reason: assemblyFriendlyReason
            });

            console.log(`Assembly ${assembly.sku}: Enhanced pull triggered - ATP: ${effectiveInventory}, Reorder: ${pullData.reorder_point}, Shortage: ${assemblyShortage}, WaitQty: ${assemblyWaitQty}, Production Qty: ${assemblyCorrectedQty}`);
          }
        }
      } catch (assemblyError) {
        console.error(`Error processing assembly ${assembly.id}:`, assemblyError);
      }
    }

    // Record all reorder triggers in database
    for (const trigger of reorderTriggers) {
      const { error: triggerError } = await supabase
        .from('reorder_triggers')
        .insert({
          item_type: trigger.item_type,
          item_id: trigger.item_id,
          current_quantity: trigger.current_quantity,
          reorder_point: trigger.reorder_point,
          trending_velocity: trigger.trending_velocity,
          trigger_reason: trigger.trigger_reason
        });

      if (triggerError) {
        console.error(`Error recording reorder trigger for ${trigger.item_type} ${trigger.item_id}:`, triggerError);
      }
    }

    // Generate purchase orders for inventory items (Enhanced LEAN pull-driven)
    let purchaseOrdersGenerated = 0;
    const inventoryOrders = ordersToGenerate.filter(o => o.item_type === 'inventory_item');
    
    for (const order of inventoryOrders) {
      try {
        // Get item details for order generation
        const { data: item, error: itemError } = await supabase
          .from('inventory_items')
          .select('sku, unit_price, vendor, minimum_order_quantity')
          .eq('id', order.item_id)
          .single();

        if (itemError || !item) {
          console.error(`Error fetching item details for ${order.item_id}:`, itemError);
          continue;
        }

        // Find or create supplier based on vendor
        let supplierId = null;
        if (item.vendor) {
          const { data: supplier } = await supabase
            .from('suppliers')
            .select('id')
            .eq('name', item.vendor)
            .single();
          
          if (supplier) {
            supplierId = supplier.id;
          } else {
            // Create new supplier for vendor
            const { data: newSupplier, error: supplierError } = await supabase
              .from('suppliers')
              .insert({
                name: item.vendor,
                created_by: '00000000-0000-0000-0000-000000000000' // System user
              })
              .select('id')
              .single();
            
            if (!supplierError && newSupplier) {
              supplierId = newSupplier.id;
            }
          }
        }

        // Create default supplier if none exists
        if (!supplierId) {
          const { data: defaultSupplier } = await supabase
            .from('suppliers')
            .select('id')
            .eq('name', 'Enhanced LEAN Pull Auto-Supplier')
            .single();

          if (defaultSupplier) {
            supplierId = defaultSupplier.id;
          } else {
            const { data: newDefaultSupplier } = await supabase
              .from('suppliers')
              .insert({
                name: 'Enhanced LEAN Pull Auto-Supplier',
                created_by: '00000000-0000-0000-0000-000000000000'
              })
              .select('id')
              .single();
            
            if (newDefaultSupplier) {
              supplierId = newDefaultSupplier.id;
            }
          }
        }

        if (supplierId) {
          const today = new Date().toISOString().split('T')[0];
          const poNumber = `LEAN365-PO-${today.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
          
          // Create enhanced LEAN pull-driven purchase order with flexible receiving
          const { data: purchaseOrder, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
              purchase_order_number: poNumber,
              supplier_id: supplierId,
              status: 'draft',
              auto_generated: true,
              source_reason: order.reason,
              notes: 'Enhanced LEAN Pull with 365-day analysis and flexible receiving validation',
              created_by: '00000000-0000-0000-0000-000000000000'
            })
            .select('id')
            .single();

          if (poError || !purchaseOrder) {
            console.error(`Error creating purchase order for item ${order.item_id}:`, poError);
            continue;
          }

          // Add purchase order item with MOQ-optimized quantity and flexible receiving
          const { error: poItemError } = await supabase
            .from('purchase_order_items')
            .insert({
              purchase_order_id: purchaseOrder.id,
              item_type: 'inventory_item',
              inventory_item_id: order.item_id,
              quantity: order.quantity_needed,
              unit_cost: item.unit_price || 0,
              notes: `Enhanced LEAN Pull Order with Flexible Receiving - ${order.reason}`,
              quantity_received: 0,
              quantity_remaining: order.quantity_needed,
              receiving_variance: 0
            });

          if (poItemError) {
            console.error(`Error creating purchase order item for ${order.item_id}:`, poItemError);
          } else {
            purchaseOrdersGenerated++;
            console.log(`Generated enhanced LEAN pull purchase order ${poNumber} for ${item.sku}: ${order.quantity_needed} units (365-day analysis)`);
          }
        }
      } catch (orderError) {
        console.error(`Error generating purchase order for item ${order.item_id}:`, orderError);
      }
    }

    // Generate production orders for assemblies (Enhanced LEAN pull-driven)
    let productionOrdersGenerated = 0;
    const assemblyOrders = ordersToGenerate.filter(o => o.item_type === 'assembly');
    
    for (const order of assemblyOrders) {
      try {
        const { data: assembly, error: assemblyError } = await supabase
          .from('assemblies')
          .select('sku')
          .eq('id', order.item_id)
          .single();

        if (assemblyError || !assembly) {
          console.error(`Error fetching assembly details for ${order.item_id}:`, assemblyError);
          continue;
        }

        const today = new Date().toISOString().split('T')[0];
        const prodNumber = `LEAN365-PROD-${today.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
        
        // Create enhanced LEAN pull-driven production order
        const { data: productionOrder, error: prodError } = await supabase
          .from('production_orders')
          .insert({
            order_number: prodNumber,
            customer_name: 'Enhanced LEAN Pull System (365-day)',
            order_type: 'assembly_build',
            priority: 'high',
            status: 'approved',
            auto_generated: true,
            source_reason: order.reason,
            notes: 'Enhanced auto-generated with 365-day analysis: Assembly ' + assembly.sku + ' production order with automated allocation and completion tracking',
            created_by: '00000000-0000-0000-0000-000000000000'
          })
          .select('id')
          .single();

        if (prodError || !productionOrder) {
          console.error(`Error creating production order for assembly ${order.item_id}:`, prodError);
          continue;
        }

        // Add production order item (this will trigger assembly allocation via database trigger)
        const { error: prodItemError } = await supabase
          .from('production_order_items')
          .insert({
            production_order_id: productionOrder.id,
            item_type: 'assembly',
            assembly_id: order.item_id,
            item_name: 'Assembly: ' + assembly.sku,
            item_sku: assembly.sku,
            quantity: order.quantity_needed,
            notes: `Enhanced LEAN Pull Production with 365-day Analysis - ${order.reason}`
          });

        if (prodItemError) {
          console.error(`Error creating production order item for ${order.item_id}:`, prodItemError);
        } else {
          productionOrdersGenerated++;
          console.log(`Generated enhanced LEAN pull production order ${prodNumber} for ${assembly.sku}: ${order.quantity_needed} units (365-day analysis, auto allocation enabled)`);
        }
      } catch (orderError) {
        console.error(`Error generating production order for assembly ${order.item_id}:`, orderError);
      }
    }

    // Count assembly auto-generated orders from the new tracking system
    const { data: assemblyTriggerCount } = await supabase
      .from('assembly_production_triggers')
      .select('id', { count: 'exact' })
      .eq('trigger_date', new Date().toISOString().split('T')[0])
      .eq('status', 'generated');

    assemblyAutoOrdersGenerated = assemblyTriggerCount?.length || 0;

    // Log enhanced calculation summary
    const endTime = Date.now();
    const duration = endTime - startTime;

    const { error: calcLogError } = await supabase
      .from('reorder_calculations')
      .insert({
        calculation_date: new Date().toISOString().split('T')[0],
        total_items_processed: itemsProcessed,
        total_assemblies_processed: assembliesProcessed,
        items_needing_reorder: itemsNeedingReorder,
        assemblies_needing_reorder: assembliesNeedingReorder,
        purchase_orders_generated: purchaseOrdersGenerated,
        production_orders_generated: productionOrdersGenerated,
        calculation_duration_ms: duration
      });

    if (calcLogError) {
      console.error('Error logging calculation summary:', calcLogError);
    }

    const summary = {
      success: true,
      message: 'Enhanced LEAN Pull inventory calculation completed successfully',
      stats: {
        items_processed: itemsProcessed,
        assemblies_processed: assembliesProcessed,
        items_needing_reorder: itemsNeedingReorder,
        assemblies_needing_reorder: assembliesNeedingReorder,
        purchase_orders_generated: purchaseOrdersGenerated,
        production_orders_generated: productionOrdersGenerated,
        assembly_auto_orders_from_triggers: assemblyAutoOrdersGenerated,
        total_orders_generated: purchaseOrdersGenerated + productionOrdersGenerated,
        calculation_duration_ms: duration
      },
      enhancements: {
        analysis_period: '365 days (full year for stability)',
        methodology: 'Enhanced LEAN Pull with Statistical Safety Stock (99.9% service level)',
        principle: 'True demand-driven pull system - orders only when stock is consumed below reorder point',
        receiving: 'Flexible validation allowing over/under receiving with variance tracking',
        assembly_monitoring: '14-day threshold auto-generation with trigger tracking',
        allocation_tracking: 'Automated assembly sales allocation and production completion'
      }
    };

    console.log('Enhanced LEAN Pull Calculation Summary:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in enhanced LEAN pull daily reorder calculation:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to execute enhanced LEAN pull reorder calculation', 
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
