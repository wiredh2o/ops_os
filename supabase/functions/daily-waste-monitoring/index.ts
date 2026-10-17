import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Functions: {
      calculate_assembly_waste_metrics: {
        Args: { target_date?: string }
        Returns: string
      }
      check_waste_threshold_alerts: {
        Args: { threshold_pct?: number }
        Returns: string
      }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { target_date, threshold_percentage } = await req.json().catch(() => ({}))
    
    console.log('Starting daily waste monitoring...', { target_date, threshold_percentage })
    
    // Calculate assembly waste metrics for the target date (defaults to today)
    const { data: metricsResult, error: metricsError } = await supabaseClient.rpc(
      'calculate_assembly_waste_metrics',
      target_date ? { target_date } : {}
    )
    
    if (metricsError) {
      console.error('Error calculating waste metrics:', metricsError)
      return new Response(
        JSON.stringify({ error: metricsError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Waste metrics calculation completed:', metricsResult)
    
    // Check for waste threshold alerts
    const { data: alertsResult, error: alertsError } = await supabaseClient.rpc(
      'check_waste_threshold_alerts',
      threshold_percentage ? { threshold_pct: threshold_percentage } : {}
    )
    
    if (alertsError) {
      console.error('Error checking waste alerts:', alertsError)
      return new Response(
        JSON.stringify({ error: alertsError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Waste alerts check completed:', alertsResult)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        metricsResult,
        alertsResult,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})