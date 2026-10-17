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
  includeSubassemblies: boolean;
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

    // Static/user-set fields only - no calculated values
    const assemblyColumns = [
      'sku',
      'description',
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

    // Packed dimensions (optional)
    if (options.includePackedDimensions) {
      assemblyColumns.push(
        'packed_dimension_l',
        'packed_dimension_w',
        'packed_dimension_h'
      );
    }

    // TTM seed data (optional)
    if (options.includeTTMSeed) {
      assemblyColumns.push('consumption_last_12_months');
    }

    // Build query
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

    // Fetch component relationships
    const { data: components, error: componentError } = await supabase
      .from('assembly_components')
      .select(`
        assembly_id,
        inventory_item_id,
        quantity_needed,
        assemblies!inner(sku),
        inventory_items!inner(sku)
      `);

    if (componentError) {
      throw new Error(`Failed to fetch components: ${componentError.message}`);
    }

    // Build assembly sheet data
    const assemblyData = (assemblies || []).map((assembly: Record<string, unknown>) => {
      const row: Record<string, unknown> = {};
      for (const col of assemblyColumns) {
        row[col] = assembly[col] ?? '';
      }
      return row;
    });

    // Build component sheet data
    const componentData = (components || []).map((component: Record<string, unknown>) => ({
      assembly_sku: (component.assemblies as Record<string, unknown>)?.sku || '',
      component_sku: (component.inventory_items as Record<string, unknown>)?.sku || '',
      quantity_needed: component.quantity_needed
    }));

    // Create workbook with SheetJS
    const workbook = XLSX.utils.book_new();

    // Assemblies sheet
    const assemblySheet = XLSX.utils.json_to_sheet(assemblyData);
    XLSX.utils.book_append_sheet(workbook, assemblySheet, "Assemblies");

    // Components sheet
    const componentSheet = XLSX.utils.json_to_sheet(componentData);
    XLSX.utils.book_append_sheet(workbook, componentSheet, "Components");

    // Generate base64 XLSX
    const xlsxBuffer = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

    console.log(`Export complete. Assemblies: ${assemblies?.length || 0}, Components: ${componentData.length}`);

    return new Response(
      JSON.stringify({
        xlsxBase64: xlsxBuffer,
        assemblyCount: assemblies?.length || 0,
        componentCount: componentData.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
