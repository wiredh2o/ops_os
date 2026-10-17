import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as XLSX from "https://esm.sh/xlsx@0.18.5"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ExportOptions = {
  includePackedDimensions: boolean;
  includeTTMSeed: boolean;
  includeMedia: boolean;
  includeSubassemblies: boolean;
  includeUOM: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { options } = await req.json() as { options: ExportOptions };

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

    console.log("Export options:", options);

    // ===== INVENTORY ITEMS =====
    const inventoryColumns = [
      'sku',
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
      'quantity_on_hand',
      'lead_time_days',
      'minimum_order_quantity',
      'is_taxable',
      'visible_for_sale',
      'eligible_for_distributor_discount',
    ];

    if (options.includePackedDimensions) {
      inventoryColumns.push('packed_dimension_l', 'packed_dimension_w', 'packed_dimension_h', 'always_ship_stacked', 'max_stack_quantity');
    }

    if (options.includeTTMSeed) {
      inventoryColumns.push('consumption_last_12_months', 'consumption_start_date');
    }

    if (options.includeMedia) {
      inventoryColumns.push('image_urls', 'video_url');
    }

    // Always include stocking_uom as it's the base unit
    if (options.includeUOM) {
      inventoryColumns.push('stocking_uom');
    }

    const { data: inventoryItems, error: inventoryError } = await supabase
      .from('inventory_items')
      .select(inventoryColumns.join(','))
      .order('sku');

    if (inventoryError) {
      throw new Error(`Failed to fetch inventory items: ${inventoryError.message}`);
    }

    // Transform inventory data for Excel
    const inventoryData = (inventoryItems || []).map(item => {
      const row: Record<string, any> = {};
      inventoryColumns.forEach(col => {
        let value = item[col];
        if (Array.isArray(value)) {
          value = value.join(';');
        }
        row[col] = value ?? '';
      });
      return row;
    });

    // ===== ASSEMBLIES =====
    const assemblyColumns = [
      'sku',
      'description',
      'sales_description',
      'purchase_description',
      'selling_price',
      'weight_oz',
      'dimension_l',
      'dimension_w',
      'dimension_h',
      'lead_time_days',
      'eligible_for_distributor_discount',
      'is_subassembly',
      'visible_for_sale',
      'quantity_on_hand',
    ];

    if (options.includePackedDimensions) {
      assemblyColumns.push('packed_dimension_l', 'packed_dimension_w', 'packed_dimension_h', 'always_ship_stacked', 'max_stack_quantity');
    }

    if (options.includeTTMSeed) {
      assemblyColumns.push('consumption_last_12_months', 'consumption_start_date');
    }

    let assemblyQuery = supabase
      .from('assemblies')
      .select(assemblyColumns.join(','))
      .order('sku');

    if (!options.includeSubassemblies) {
      assemblyQuery = assemblyQuery.eq('is_subassembly', false);
    }

    const { data: assemblies, error: assemblyError } = await assemblyQuery;

    if (assemblyError) {
      throw new Error(`Failed to fetch assemblies: ${assemblyError.message}`);
    }

    const assemblyData = (assemblies || []).map(item => {
      const row: Record<string, any> = {};
      assemblyColumns.forEach(col => {
        row[col] = item[col] ?? '';
      });
      return row;
    });

    // ===== ASSEMBLY COMPONENTS (BOM) =====
    const { data: components, error: componentError } = await supabase
      .from('assembly_components')
      .select(`
        quantity_needed,
        assemblies!inner(sku),
        inventory_items!inner(sku)
      `);

    if (componentError) {
      throw new Error(`Failed to fetch assembly components: ${componentError.message}`);
    }

    const componentData = (components || []).map((comp: any) => ({
      assembly_sku: comp.assemblies?.sku || '',
      component_sku: comp.inventory_items?.sku || '',
      quantity_needed: comp.quantity_needed,
    }));

    // ===== SALES UOMs (NEW) =====
    let salesUomData: any[] = [];
    if (options.includeUOM) {
      const { data: salesUoms, error: salesUomError } = await supabase
        .from('inventory_sales_uoms')
        .select(`
          quantity,
          unit_price,
          description,
          is_default,
          sort_order,
          inventory_items!inner(sku)
        `)
        .order('inventory_item_id')
        .order('sort_order');

      if (salesUomError) {
        console.error('Failed to fetch sales UOMs:', salesUomError.message);
      } else {
        salesUomData = (salesUoms || []).map((uom: any) => ({
          sku: uom.inventory_items?.sku || '',
          quantity: uom.quantity,
          unit_price: uom.unit_price,
          description: uom.description || '',
          is_default: uom.is_default,
          sort_order: uom.sort_order,
        }));
      }
      console.log(`Fetched ${salesUomData.length} sales UOMs`);
    }

    // ===== PURCHASE UOMs (NEW) =====
    let purchaseUomData: any[] = [];
    if (options.includeUOM) {
      const { data: purchaseUoms, error: purchaseUomError } = await supabase
        .from('inventory_purchase_uoms')
        .select(`
          purchase_uom,
          quantity,
          unit_cost,
          supplier_name,
          lead_time_days,
          minimum_order_quantity,
          is_default,
          sort_order,
          inventory_items!inner(sku)
        `)
        .order('inventory_item_id')
        .order('sort_order');

      if (purchaseUomError) {
        console.error('Failed to fetch purchase UOMs:', purchaseUomError.message);
      } else {
        purchaseUomData = (purchaseUoms || []).map((uom: any) => ({
          sku: uom.inventory_items?.sku || '',
          purchase_uom: uom.purchase_uom,
          quantity: uom.quantity,
          unit_cost: uom.unit_cost,
          supplier_name: uom.supplier_name || '',
          lead_time_days: uom.lead_time_days ?? '',
          minimum_order_quantity: uom.minimum_order_quantity ?? '',
          is_default: uom.is_default,
          sort_order: uom.sort_order,
        }));
      }
      console.log(`Fetched ${purchaseUomData.length} purchase UOMs`);
    }

    // ===== CREATE XLSX WORKBOOK =====
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Inventory Items
    const inventorySheet = XLSX.utils.json_to_sheet(inventoryData);
    XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventory Items");

    // Sheet 2: Assemblies
    const assemblySheet = XLSX.utils.json_to_sheet(assemblyData);
    XLSX.utils.book_append_sheet(workbook, assemblySheet, "Assemblies");

    // Sheet 3: Assembly Components (BOM)
    const componentSheet = XLSX.utils.json_to_sheet(componentData);
    XLSX.utils.book_append_sheet(workbook, componentSheet, "Assembly Components");

    // Sheet 4: Sales UOMs (NEW)
    if (options.includeUOM && salesUomData.length > 0) {
      const salesUomSheet = XLSX.utils.json_to_sheet(salesUomData);
      XLSX.utils.book_append_sheet(workbook, salesUomSheet, "Sales UOMs");
    }

    // Sheet 5: Purchase UOMs (NEW)
    if (options.includeUOM && purchaseUomData.length > 0) {
      const purchaseUomSheet = XLSX.utils.json_to_sheet(purchaseUomData);
      XLSX.utils.book_append_sheet(workbook, purchaseUomSheet, "Purchase UOMs");
    }

    // Generate XLSX binary
    const xlsxData = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    console.log(`Export complete: ${inventoryData.length} inventory items, ${assemblyData.length} assemblies, ${componentData.length} components, ${salesUomData.length} sales UOMs, ${purchaseUomData.length} purchase UOMs`);

    return new Response(
      JSON.stringify({
        xlsxData,
        counts: {
          inventoryItems: inventoryData.length,
          assemblies: assemblyData.length,
          components: componentData.length,
          salesUoms: salesUomData.length,
          purchaseUoms: purchaseUomData.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
