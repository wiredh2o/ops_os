import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ExportOptions = {
  includeCosts: boolean;
  includeTTM: boolean;
  includePackedDimensions: boolean;
  includeMedia: boolean;
  includeBusinessRules: boolean;
  includeQuantities: boolean;
  includeVisibility: boolean;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { options } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Authentication required");
    }

    // Build column list based on options
    const columns = [
      'sku',
      'sales_description',
      'purchase_description',
      'unit_price',
      'manufacturer_part_number',
      'vendor'
    ];

    if (options.includeCosts) {
      columns.push('unit_cost');
    }

    if (options.includeQuantities) {
      columns.push(
        'quantity_on_hand',
        'quantity_allocated', 
        'quantity_on_order',
        'quantity_atp',
        'quantity_ats'
      );
    }

    if (options.includeBusinessRules) {
      columns.push(
        'lead_time_days',
        'minimum_order_quantity',
        'reorder_point',
        'is_taxable'
      );
    }

    columns.push(
      'weight_oz',
      'volume_cubic_inches',
      'dimension_l',
      'dimension_w', 
      'dimension_h'
    );

    if (options.includePackedDimensions) {
      columns.push(
        'packed_dimension_l',
        'packed_dimension_w',
        'packed_dimension_h',
        'packed_volume_cubic_inches',
        'packed_shape',
        'packed_diameter',
        'actual_packed_volume_cubic_inches',
        'paper_thickness_top',
        'paper_thickness_bottom',
        'paper_thickness_left',
        'paper_thickness_right',
        'paper_thickness_front',
        'paper_thickness_back',
        'paper_thickness_side',
        'paper_thickness_uniform',
        'always_ship_stacked',
        'max_stack_quantity'
      );
    }

    if (options.includeTTM) {
      columns.push(
        'consumption_last_12_months',
        'daily_consumption_rate',
        'consumption_start_date'
      );
    }

    if (options.includeMedia) {
      columns.push('image_urls', 'video_url');
    }

    if (options.includeVisibility) {
      columns.push('visible_for_sale');
    }

    // Fetch inventory items
    const { data: items, error } = await supabase
      .from('inventory_items')
      .select(columns.join(','))
      .order('sku');

    if (error) {
      throw new Error(`Failed to fetch inventory items: ${error.message}`);
    }

    // Generate CSV content
    const csvRows = [];
    
    // Header row
    csvRows.push(columns.join(','));
    
    // Data rows
    for (const item of items) {
      const row = columns.map(col => {
        let value = item[col];
        
        // Handle arrays (image_urls)
        if (Array.isArray(value)) {
          value = value.join(';');
        }
        
        // Handle null/undefined
        if (value === null || value === undefined) {
          value = '';
        }
        
        // Escape CSV values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value;
      });
      
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');

    return new Response(
      JSON.stringify({
        csvContent,
        itemCount: items.length,
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