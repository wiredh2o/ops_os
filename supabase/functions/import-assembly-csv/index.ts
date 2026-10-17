import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Only static/user-set fields and seed data - no calculated values
type AssemblyMapping = {
  sku: string;
  description?: string;
  selling_price?: string;
  weight_oz?: string;
  dimension_l?: string;
  dimension_w?: string;
  dimension_h?: string;
  packed_dimension_l?: string;
  packed_dimension_w?: string;
  packed_dimension_h?: string;
  lead_time_days?: string;
  eligible_for_distributor_discount?: string;
  is_subassembly?: string;
  visible_for_sale?: string;
  quantity_on_hand?: string;
  consumption_last_12_months?: string;
  always_ship_stacked?: string;
  max_stack_quantity?: string;
  created_by_source: "current_user" | "column";
  created_by_column?: string;
}

type ComponentMapping = {
  assembly_sku: string;
  component_sku: string;
  quantity_needed: string;
}

type AssemblyRow = Record<string, unknown>;
type ComponentRow = Record<string, unknown>;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assemblyRows, componentRows, assemblyMapping, componentMapping } = await req.json();

    if (!Array.isArray(assemblyRows) || !Array.isArray(componentRows)) {
      throw new Error("Invalid data format");
    }

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

    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };

    const toBoolean = (value: unknown): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'y';
      }
      return Boolean(value);
    };

    let assembliesCreated = 0;
    let componentsCreated = 0;
    const errors: string[] = [];

    // Process assemblies - only static/seed fields
    for (const row of assemblyRows as AssemblyRow[]) {
      try {
        const skuValue = row[assemblyMapping.sku];
        if (!skuValue) continue;

        const assemblyData: Record<string, unknown> = {
          sku: skuValue,
          consumption_start_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
        };

        // Static fields
        if (assemblyMapping.description && row[assemblyMapping.description]) {
          assemblyData.description = row[assemblyMapping.description];
        }
        if (assemblyMapping.selling_price && row[assemblyMapping.selling_price]) {
          assemblyData.selling_price = toNumber(row[assemblyMapping.selling_price]) || 0;
        }
        if (assemblyMapping.weight_oz && row[assemblyMapping.weight_oz]) {
          assemblyData.weight_oz = toNumber(row[assemblyMapping.weight_oz]);
        }

        // Dimensions
        if (assemblyMapping.dimension_l && row[assemblyMapping.dimension_l]) {
          assemblyData.dimension_l = toNumber(row[assemblyMapping.dimension_l]);
        }
        if (assemblyMapping.dimension_w && row[assemblyMapping.dimension_w]) {
          assemblyData.dimension_w = toNumber(row[assemblyMapping.dimension_w]);
        }
        if (assemblyMapping.dimension_h && row[assemblyMapping.dimension_h]) {
          assemblyData.dimension_h = toNumber(row[assemblyMapping.dimension_h]);
        }

        // Packed dimensions
        if (assemblyMapping.packed_dimension_l && row[assemblyMapping.packed_dimension_l]) {
          assemblyData.packed_dimension_l = toNumber(row[assemblyMapping.packed_dimension_l]);
        }
        if (assemblyMapping.packed_dimension_w && row[assemblyMapping.packed_dimension_w]) {
          assemblyData.packed_dimension_w = toNumber(row[assemblyMapping.packed_dimension_w]);
        }
        if (assemblyMapping.packed_dimension_h && row[assemblyMapping.packed_dimension_h]) {
          assemblyData.packed_dimension_h = toNumber(row[assemblyMapping.packed_dimension_h]);
        }

        // Business rules
        if (assemblyMapping.lead_time_days && row[assemblyMapping.lead_time_days]) {
          assemblyData.lead_time_days = toNumber(row[assemblyMapping.lead_time_days]);
        }
        if (assemblyMapping.eligible_for_distributor_discount && row[assemblyMapping.eligible_for_distributor_discount]) {
          assemblyData.eligible_for_distributor_discount = toBoolean(row[assemblyMapping.eligible_for_distributor_discount]);
        }
        if (assemblyMapping.is_subassembly && row[assemblyMapping.is_subassembly]) {
          assemblyData.is_subassembly = toBoolean(row[assemblyMapping.is_subassembly]);
        }
        if (assemblyMapping.visible_for_sale !== undefined) {
          const visVal = row[assemblyMapping.visible_for_sale];
          assemblyData.visible_for_sale = visVal !== undefined && visVal !== '' 
            ? toBoolean(visVal) 
            : true;
        } else {
          assemblyData.visible_for_sale = true;
        }

        // Seed data for migration
        if (assemblyMapping.quantity_on_hand && row[assemblyMapping.quantity_on_hand]) {
          assemblyData.quantity_on_hand = toNumber(row[assemblyMapping.quantity_on_hand]) || 0;
        }
        if (assemblyMapping.consumption_last_12_months && row[assemblyMapping.consumption_last_12_months]) {
          assemblyData.consumption_last_12_months = toNumber(row[assemblyMapping.consumption_last_12_months]) || 0;
        }

        // Stacking flags
        if (assemblyMapping.always_ship_stacked && row[assemblyMapping.always_ship_stacked] !== undefined && row[assemblyMapping.always_ship_stacked] !== '') {
          assemblyData.always_ship_stacked = toBoolean(row[assemblyMapping.always_ship_stacked]);
        }
        if (assemblyMapping.max_stack_quantity && row[assemblyMapping.max_stack_quantity] !== undefined && row[assemblyMapping.max_stack_quantity] !== '') {
          const msq = toNumber(row[assemblyMapping.max_stack_quantity]);
          assemblyData.max_stack_quantity = msq != null && msq > 0 ? Math.trunc(msq) : null;
        }

        const { error: assemblyError } = await supabase
          .from('assemblies')
          .upsert(assemblyData, { onConflict: 'sku' });

        if (assemblyError) {
          errors.push(`Assembly ${assemblyData.sku}: ${assemblyError.message}`);
          continue;
        }

        assembliesCreated++;
      } catch (e: unknown) {
        errors.push(`Assembly row error: ${(e as Error).message}`);
      }
    }

    // Process components
    for (const row of componentRows as ComponentRow[]) {
      try {
        const assemblySku = row[componentMapping.assembly_sku];
        const componentSku = row[componentMapping.component_sku];
        const qtyNeeded = row[componentMapping.quantity_needed];
        
        if (!assemblySku || !componentSku || !qtyNeeded) continue;

        const { data: assembly, error: assemblyLookupError } = await supabase
          .from('assemblies')
          .select('id')
          .eq('sku', assemblySku)
          .single();

        if (assemblyLookupError || !assembly) {
          errors.push(`Assembly not found: ${assemblySku}`);
          continue;
        }

        const { data: component, error: componentLookupError } = await supabase
          .from('inventory_items')
          .select('id')
          .eq('sku', componentSku)
          .single();

        if (componentLookupError || !component) {
          errors.push(`Component not found: ${componentSku}`);
          continue;
        }

        const { error: componentError } = await supabase
          .from('assembly_components')
          .upsert({
            assembly_id: assembly.id,
            inventory_item_id: component.id,
            quantity_needed: toNumber(qtyNeeded) || 1,
          }, { onConflict: 'assembly_id,inventory_item_id' });

        if (componentError) {
          errors.push(`Component ${componentSku} for ${assemblySku}: ${componentError.message}`);
          continue;
        }

        componentsCreated++;
      } catch (e: unknown) {
        errors.push(`Component row error: ${(e as Error).message}`);
      }
    }

    // Trigger calculations after import
    let calculationsTriggered = false;
    let calculationResults = null;
    
    if (assembliesCreated > 0 || componentsCreated > 0) {
      try {
        console.log("Triggering post-import calculations...");
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        
        const calcResponse = await fetch(`${supabaseUrl}/functions/v1/manual-calculation-trigger`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ triggerTTM: true, triggerConsumption: true, triggerReorder: true })
        });
        
        if (calcResponse.ok) {
          calculationResults = await calcResponse.json();
          calculationsTriggered = true;
          console.log("Post-import calculations completed:", calculationResults);
        }
      } catch (calcError) {
        console.error("Error triggering calculations:", calcError);
      }
    }

    return new Response(
      JSON.stringify({
        assembliesCreated,
        componentsCreated,
        errorsCount: errors.length,
        errors: errors.slice(0, 10),
        calculationsTriggered,
        calculationResults
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
