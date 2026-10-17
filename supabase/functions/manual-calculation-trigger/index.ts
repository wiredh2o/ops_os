import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting manual calculation trigger...");

    const { 
      triggerTTM = true, 
      triggerReorder = true, 
      triggerConsumption = true 
    } = await req.json().catch(() => ({}));

    let ttmResult = null;
    let reorderResult = null;
    let consumptionResult = null;
    const startTime = Date.now();

    // Run consumption rate calculation if requested (independent of TTM)
    if (triggerConsumption && !triggerTTM) {
      console.log("Triggering consumption rate calculation...");
      const { data: consumptionData, error: consumptionError } = await supabase.rpc("update_daily_consumption_rates");
      
      if (consumptionError) {
        console.error("Consumption calculation failed:", consumptionError);
        consumptionResult = { success: false, error: consumptionError.message };
      } else {
        console.log("Consumption calculation completed:", consumptionData);
        consumptionResult = { success: true, result: consumptionData };
      }
    }

    // Run TTM calculation if requested (includes consumption rate update)
    if (triggerTTM) {
      console.log("Triggering TTM calculation (includes consumption rates)...");
      const { data: ttmData, error: ttmError } = await supabase.rpc("update_daily_ttm_values");
      
      if (ttmError) {
        console.error("TTM calculation failed:", ttmError);
        ttmResult = { success: false, error: ttmError.message };
      } else {
        console.log("TTM calculation completed:", ttmData);
        ttmResult = { success: true, result: ttmData };
        // If TTM ran, it already included consumption rates
        if (triggerConsumption) {
          consumptionResult = { success: true, result: "Included in TTM calculation" };
        }
      }
    }

    // Run reorder calculation if requested
    if (triggerReorder) {
      console.log("Triggering reorder calculation...");
      
      // Call the daily reorder calculation function
      const { data: reorderData, error: reorderError } = await supabase.functions.invoke(
        'daily-reorder-calculation',
        { body: { manual: true } }
      );
      
      if (reorderError) {
        console.error("Reorder calculation failed:", reorderError);
        reorderResult = { success: false, error: reorderError.message };
      } else {
        console.log("Reorder calculation completed:", reorderData);
        reorderResult = { success: true, result: reorderData };
      }
    }

    const endTime = Date.now();
    const executionTime = (endTime - startTime) / 1000;

    // Prepare response
    const response = {
      success: true,
      executionTimeSeconds: executionTime,
      timestamp: new Date().toISOString(),
      calculations: {
        ttm: ttmResult,
        reorder: reorderResult,
        consumption: consumptionResult
      }
    };

    console.log("Manual calculation trigger completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Manual calculation trigger error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Unexpected error",
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});