import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as XLSX from "https://esm.sh/xlsx@0.18.5"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ImportMapping = {
  inventoryItems: Record<string, string>;
  assemblies: Record<string, string>;
  components: Record<string, string>;
  salesUoms: Record<string, string>;
  purchaseUoms: Record<string, string>;
}

// STRICT WHITELISTS: Only these fields can EVER be updated via import
const ALLOWED_INVENTORY_FIELDS = new Set([
  'sales_description',
  'purchase_description',
  'unit_price',
  'unit_cost',
  'manufacturer_part_number',
  'vendor',
  'weight_oz',
  'dimension_l',
  'dimension_w',
  'dimension_h',
  'packed_dimension_l',
  'packed_dimension_w',
  'packed_dimension_h',
  'quantity_on_hand',
  'lead_time_days',
  'minimum_order_quantity',
  'is_taxable',
  'visible_for_sale',
  'eligible_for_distributor_discount',
  'consumption_last_12_months',
  'consumption_start_date',
  'image_urls',
  'video_url',
  'stocking_uom',
]);

const ALLOWED_ASSEMBLY_FIELDS = new Set([
  'description',
  'sales_description',
  'purchase_description',
  'selling_price',
  'weight_oz',
  'dimension_l',
  'dimension_w',
  'dimension_h',
  'packed_dimension_l',
  'packed_dimension_w',
  'packed_dimension_h',
  'lead_time_days',
  'eligible_for_distributor_discount',
  'is_subassembly',
  'visible_for_sale',
  'quantity_on_hand',
  'consumption_last_12_months',
  'consumption_start_date',
  'image_urls',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xlsxData, mapping } = await req.json() as { 
      xlsxData: string; 
      mapping: ImportMapping;
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Authentication required");
    }

    // Parse XLSX from base64
    const binaryData = Uint8Array.from(atob(xlsxData), c => c.charCodeAt(0));
    const workbook = XLSX.read(binaryData, { type: 'array' });

    console.log("Workbook sheets:", workbook.SheetNames);

    const stats = {
      inventoryCreated: 0,
      inventoryUpdated: 0,
      assembliesCreated: 0,
      assembliesUpdated: 0,
      componentsCreated: 0,
      componentsUpdated: 0,
      salesUomsCreated: 0,
      salesUomsUpdated: 0,
      purchaseUomsCreated: 0,
      purchaseUomsUpdated: 0,
      errors: [] as string[],
    };

    // Helper functions
    const toNumber = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    const toBoolean = (val: any): boolean | null => {
      if (val === null || val === undefined || val === '') return null;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        if (['true', 'yes', '1', 'y'].includes(lower)) return true;
        if (['false', 'no', '0', 'n'].includes(lower)) return false;
      }
      return null;
    };

    // Helper to build partial update object with STRICT WHITELIST enforcement
    const buildPartialUpdate = (
      row: any,
      fieldMapping: Record<string, string>,
      fieldProcessors: Record<string, (val: any) => any>,
      allowedFields: Set<string>
    ): Record<string, any> => {
      const result: Record<string, any> = {};
      
      for (const [dbField, processor] of Object.entries(fieldProcessors)) {
        if (!allowedFields.has(dbField)) {
          continue;
        }
        
        const csvColumn = fieldMapping[dbField];
        if (!csvColumn) continue;
        
        const rawValue = row[csvColumn];
        if (rawValue === undefined || rawValue === '') continue;
        
        const processedValue = processor(rawValue);
        if (processedValue !== null) {
          result[dbField] = processedValue;
        }
      }
      
      return result;
    };

    // Field processors for inventory items
    const inventoryFieldProcessors: Record<string, (val: any) => any> = {
      sales_description: (v) => v?.toString() || null,
      purchase_description: (v) => v?.toString() || null,
      unit_price: (v) => toNumber(v) ?? 0,
      unit_cost: (v) => toNumber(v),
      manufacturer_part_number: (v) => v?.toString() || null,
      vendor: (v) => v?.toString() || null,
      weight_oz: (v) => toNumber(v),
      dimension_l: (v) => toNumber(v),
      dimension_w: (v) => toNumber(v),
      dimension_h: (v) => toNumber(v),
      packed_dimension_l: (v) => toNumber(v),
      packed_dimension_w: (v) => toNumber(v),
      packed_dimension_h: (v) => toNumber(v),
      quantity_on_hand: (v) => toNumber(v) ?? 0,
      lead_time_days: (v) => toNumber(v),
      minimum_order_quantity: (v) => toNumber(v),
      is_taxable: (v) => toBoolean(v),
      visible_for_sale: (v) => toBoolean(v),
      eligible_for_distributor_discount: (v) => toBoolean(v),
      consumption_last_12_months: (v) => toNumber(v),
      consumption_start_date: (v) => v?.toString() || null,
      image_urls: (v) => typeof v === 'string' ? v.split(';').map((u: string) => u.trim()).filter(Boolean) : v,
      video_url: (v) => v?.toString() || null,
      stocking_uom: (v) => v?.toString() || null,
    };

    // Field processors for assemblies
    const assemblyFieldProcessors: Record<string, (val: any) => any> = {
      description: (v) => v?.toString() || null,
      sales_description: (v) => v?.toString() || null,
      purchase_description: (v) => v?.toString() || null,
      selling_price: (v) => toNumber(v) ?? 0,
      weight_oz: (v) => toNumber(v),
      dimension_l: (v) => toNumber(v),
      dimension_w: (v) => toNumber(v),
      dimension_h: (v) => toNumber(v),
      packed_dimension_l: (v) => toNumber(v),
      packed_dimension_w: (v) => toNumber(v),
      packed_dimension_h: (v) => toNumber(v),
      lead_time_days: (v) => toNumber(v),
      eligible_for_distributor_discount: (v) => toBoolean(v),
      is_subassembly: (v) => toBoolean(v),
      visible_for_sale: (v) => toBoolean(v),
      quantity_on_hand: (v) => toNumber(v) ?? 0,
      consumption_last_12_months: (v) => toNumber(v),
      consumption_start_date: (v) => v?.toString() || null,
    };

    // Build SKU to ID lookup cache for inventory items
    const skuToInventoryId: Map<string, string> = new Map();
    const { data: allInventoryItems } = await supabase
      .from('inventory_items')
      .select('id, sku');
    
    for (const item of allInventoryItems || []) {
      skuToInventoryId.set(item.sku, item.id);
    }

    // ===== PHASE 1: Import Inventory Items =====
    const inventorySheetName = workbook.SheetNames.find(s => 
      s.toLowerCase().includes('inventory') && !s.toLowerCase().includes('component')
    );
    
    if (inventorySheetName && mapping.inventoryItems) {
      const sheet = workbook.Sheets[inventorySheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      console.log(`Processing ${rows.length} inventory items from sheet: ${inventorySheetName}`);

      for (const row of rows) {
        try {
          const skuColumn = mapping.inventoryItems['sku'];
          const sku = skuColumn ? row[skuColumn]?.toString()?.trim() : null;
          if (!sku) continue;

          const itemData = buildPartialUpdate(row, mapping.inventoryItems, inventoryFieldProcessors, ALLOWED_INVENTORY_FIELDS);

          const existingId = skuToInventoryId.get(sku);

          if (existingId) {
            if (Object.keys(itemData).length > 0) {
              const { error } = await supabase
                .from('inventory_items')
                .update(itemData)
                .eq('id', existingId);
              if (error) throw error;
              stats.inventoryUpdated++;
            }
          } else {
            const { data: newItem, error } = await supabase
              .from('inventory_items')
              .insert({ 
                sku,
                ...itemData, 
                created_by: user.id,
                unit_price: itemData.unit_price ?? 0,
                quantity_on_hand: itemData.quantity_on_hand ?? 0,
              })
              .select('id')
              .single();
            if (error) throw error;
            if (newItem) {
              skuToInventoryId.set(sku, newItem.id);
            }
            stats.inventoryCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Inventory item error: ${err.message}`);
        }
      }
    }

    // ===== PHASE 2: Import Assemblies =====
    const assemblySheetName = workbook.SheetNames.find(s => 
      s.toLowerCase().includes('assembl') && !s.toLowerCase().includes('component')
    );
    
    if (assemblySheetName && mapping.assemblies) {
      const sheet = workbook.Sheets[assemblySheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      console.log(`Processing ${rows.length} assemblies from sheet: ${assemblySheetName}`);

      for (const row of rows) {
        try {
          const skuColumn = mapping.assemblies['sku'];
          const sku = skuColumn ? row[skuColumn]?.toString()?.trim() : null;
          if (!sku) continue;

          const assemblyData = buildPartialUpdate(row, mapping.assemblies, assemblyFieldProcessors, ALLOWED_ASSEMBLY_FIELDS);

          const { data: existing } = await supabase
            .from('assemblies')
            .select('id')
            .eq('sku', sku)
            .maybeSingle();

          if (existing) {
            if (Object.keys(assemblyData).length > 0) {
              const { error } = await supabase
                .from('assemblies')
                .update(assemblyData)
                .eq('id', existing.id);
              if (error) throw error;
              stats.assembliesUpdated++;
            }
          } else {
            const { error } = await supabase
              .from('assemblies')
              .insert({ 
                sku,
                ...assemblyData, 
                created_by: user.id,
                selling_price: assemblyData.selling_price ?? 0,
                quantity_on_hand: assemblyData.quantity_on_hand ?? 0,
              });
            if (error) throw error;
            stats.assembliesCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Assembly error: ${err.message}`);
        }
      }
    }

    // ===== PHASE 3: Import Assembly Components =====
    const componentSheetName = workbook.SheetNames.find(s => 
      s.toLowerCase().includes('component')
    );
    
    if (componentSheetName && mapping.components) {
      const sheet = workbook.Sheets[componentSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      console.log(`Processing ${rows.length} components from sheet: ${componentSheetName}`);

      for (const row of rows) {
        try {
          const assemblySkuCol = mapping.components['assembly_sku'];
          const componentSkuCol = mapping.components['component_sku'];
          const quantityCol = mapping.components['quantity_needed'];

          const assemblySku = assemblySkuCol ? row[assemblySkuCol]?.toString()?.trim() : null;
          const componentSku = componentSkuCol ? row[componentSkuCol]?.toString()?.trim() : null;
          const quantityNeeded = quantityCol ? (toNumber(row[quantityCol]) ?? 1) : 1;

          if (!assemblySku || !componentSku) continue;

          const { data: assembly } = await supabase
            .from('assemblies')
            .select('id')
            .eq('sku', assemblySku)
            .maybeSingle();

          if (!assembly) {
            stats.errors.push(`Assembly not found: ${assemblySku}`);
            continue;
          }

          const inventoryItemId = skuToInventoryId.get(componentSku);
          if (!inventoryItemId) {
            stats.errors.push(`Component not found: ${componentSku}`);
            continue;
          }

          const { data: existing } = await supabase
            .from('assembly_components')
            .select('id')
            .eq('assembly_id', assembly.id)
            .eq('inventory_item_id', inventoryItemId)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('assembly_components')
              .update({ quantity_needed: quantityNeeded })
              .eq('id', existing.id);
            if (error) throw error;
            stats.componentsUpdated++;
          } else {
            const { error } = await supabase
              .from('assembly_components')
              .insert({
                assembly_id: assembly.id,
                inventory_item_id: inventoryItemId,
                quantity_needed: quantityNeeded,
              });
            if (error) throw error;
            stats.componentsCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Component error: ${err.message}`);
        }
      }
    }

    // ===== PHASE 4: Import Sales UOMs (NEW) =====
    const salesUomSheetName = workbook.SheetNames.find(s => 
      s.toLowerCase().includes('sales') && s.toLowerCase().includes('uom')
    );
    
    if (salesUomSheetName && mapping.salesUoms) {
      const sheet = workbook.Sheets[salesUomSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      console.log(`Processing ${rows.length} sales UOMs from sheet: ${salesUomSheetName}`);

      for (const row of rows) {
        try {
          const skuCol = mapping.salesUoms['sku'];
          const quantityCol = mapping.salesUoms['quantity'];
          const unitPriceCol = mapping.salesUoms['unit_price'];
          const descriptionCol = mapping.salesUoms['description'];
          const isDefaultCol = mapping.salesUoms['is_default'];
          const sortOrderCol = mapping.salesUoms['sort_order'];

          const sku = skuCol ? row[skuCol]?.toString()?.trim() : null;
          const quantity = quantityCol ? toNumber(row[quantityCol]) : null;
          const unitPrice = unitPriceCol ? toNumber(row[unitPriceCol]) : null;

          if (!sku || !quantity || quantity <= 0 || unitPrice === null) {
            continue;
          }

          const inventoryItemId = skuToInventoryId.get(sku);
          if (!inventoryItemId) {
            stats.errors.push(`Sales UOM: Inventory item not found: ${sku}`);
            continue;
          }

          const description = descriptionCol ? row[descriptionCol]?.toString() || null : null;
          const isDefault = isDefaultCol ? (toBoolean(row[isDefaultCol]) ?? false) : false;
          const sortOrder = sortOrderCol ? (toNumber(row[sortOrderCol]) ?? 0) : 0;

          // Check if exists by inventory_item_id and quantity (unique constraint)
          const { data: existing } = await supabase
            .from('inventory_sales_uoms')
            .select('id')
            .eq('inventory_item_id', inventoryItemId)
            .eq('quantity', quantity)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('inventory_sales_uoms')
              .update({
                unit_price: unitPrice,
                description,
                is_default: isDefault,
                sort_order: sortOrder,
              })
              .eq('id', existing.id);
            if (error) throw error;
            stats.salesUomsUpdated++;
          } else {
            const { error } = await supabase
              .from('inventory_sales_uoms')
              .insert({
                inventory_item_id: inventoryItemId,
                quantity,
                unit_price: unitPrice,
                description,
                is_default: isDefault,
                sort_order: sortOrder,
              });
            if (error) throw error;
            stats.salesUomsCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Sales UOM error: ${err.message}`);
        }
      }
    }

    // ===== PHASE 5: Import Purchase UOMs (NEW) =====
    const purchaseUomSheetName = workbook.SheetNames.find(s => 
      s.toLowerCase().includes('purchase') && s.toLowerCase().includes('uom')
    );
    
    if (purchaseUomSheetName && mapping.purchaseUoms) {
      const sheet = workbook.Sheets[purchaseUomSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      console.log(`Processing ${rows.length} purchase UOMs from sheet: ${purchaseUomSheetName}`);

      for (const row of rows) {
        try {
          const skuCol = mapping.purchaseUoms['sku'];
          const purchaseUomCol = mapping.purchaseUoms['purchase_uom'];
          const quantityCol = mapping.purchaseUoms['quantity'];
          const unitCostCol = mapping.purchaseUoms['unit_cost'];
          const supplierCol = mapping.purchaseUoms['supplier_name'];
          const leadTimeCol = mapping.purchaseUoms['lead_time_days'];
          const moqCol = mapping.purchaseUoms['minimum_order_quantity'];
          const isDefaultCol = mapping.purchaseUoms['is_default'];
          const sortOrderCol = mapping.purchaseUoms['sort_order'];

          const sku = skuCol ? row[skuCol]?.toString()?.trim() : null;
          const purchaseUom = purchaseUomCol ? row[purchaseUomCol]?.toString()?.trim() : null;
          const quantity = quantityCol ? toNumber(row[quantityCol]) : null;
          const unitCost = unitCostCol ? toNumber(row[unitCostCol]) : null;

          if (!sku || !purchaseUom || !quantity || quantity <= 0 || unitCost === null) {
            continue;
          }

          const inventoryItemId = skuToInventoryId.get(sku);
          if (!inventoryItemId) {
            stats.errors.push(`Purchase UOM: Inventory item not found: ${sku}`);
            continue;
          }

          const supplierName = supplierCol ? row[supplierCol]?.toString() || null : null;
          const leadTimeDays = leadTimeCol ? toNumber(row[leadTimeCol]) : null;
          const minimumOrderQuantity = moqCol ? toNumber(row[moqCol]) : null;
          const isDefault = isDefaultCol ? (toBoolean(row[isDefaultCol]) ?? false) : false;
          const sortOrder = sortOrderCol ? (toNumber(row[sortOrderCol]) ?? 0) : 0;

          // Check if exists by unique constraint (inventory_item_id, supplier_name, purchase_uom, quantity)
          let existingQuery = supabase
            .from('inventory_purchase_uoms')
            .select('id')
            .eq('inventory_item_id', inventoryItemId)
            .eq('purchase_uom', purchaseUom)
            .eq('quantity', quantity);

          if (supplierName) {
            existingQuery = existingQuery.eq('supplier_name', supplierName);
          } else {
            existingQuery = existingQuery.is('supplier_name', null);
          }

          const { data: existing } = await existingQuery.maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('inventory_purchase_uoms')
              .update({
                unit_cost: unitCost,
                lead_time_days: leadTimeDays,
                minimum_order_quantity: minimumOrderQuantity,
                is_default: isDefault,
                sort_order: sortOrder,
              })
              .eq('id', existing.id);
            if (error) throw error;
            stats.purchaseUomsUpdated++;
          } else {
            const { error } = await supabase
              .from('inventory_purchase_uoms')
              .insert({
                inventory_item_id: inventoryItemId,
                purchase_uom: purchaseUom,
                quantity,
                unit_cost: unitCost,
                supplier_name: supplierName,
                lead_time_days: leadTimeDays,
                minimum_order_quantity: minimumOrderQuantity,
                is_default: isDefault,
                sort_order: sortOrder,
              });
            if (error) throw error;
            stats.purchaseUomsCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Purchase UOM error: ${err.message}`);
        }
      }
    }

    // Trigger post-import calculations
    let calculationResult = null;
    if (stats.inventoryCreated + stats.inventoryUpdated + stats.assembliesCreated + stats.assembliesUpdated > 0) {
      try {
        const { data } = await supabase.functions.invoke('manual-calculation-trigger', {
          body: { triggerSource: 'unified-import' }
        });
        calculationResult = data;
      } catch (calcError) {
        console.error('Calculation trigger failed:', calcError);
      }
    }

    console.log("Import complete:", stats);

    return new Response(
      JSON.stringify({ stats, calculationResult }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
