-- Phase 1: Database Schema Enhancements
-- Add TTM fields and packed dimensions to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS consumption_last_12_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS consumption_start_date DATE,
ADD COLUMN IF NOT EXISTS daily_consumption_rate NUMERIC(10,3) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS packed_dimension_l NUMERIC,
ADD COLUMN IF NOT EXISTS packed_dimension_w NUMERIC,
ADD COLUMN IF NOT EXISTS packed_dimension_h NUMERIC,
ADD COLUMN IF NOT EXISTS packed_volume_cubic_inches NUMERIC;

-- Add TTM fields and packed dimensions to assemblies
ALTER TABLE public.assemblies 
ADD COLUMN IF NOT EXISTS consumption_last_12_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS consumption_start_date DATE,
ADD COLUMN IF NOT EXISTS daily_consumption_rate NUMERIC(10,3) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS packed_dimension_l NUMERIC,
ADD COLUMN IF NOT EXISTS packed_dimension_w NUMERIC,
ADD COLUMN IF NOT EXISTS packed_dimension_h NUMERIC,
ADD COLUMN IF NOT EXISTS packed_volume_cubic_inches NUMERIC;

-- Create daily demand cache for rolling TTM calculations
CREATE TABLE IF NOT EXISTS public.daily_demand_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('inventory_item', 'assembly')),
  calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ttm_value INTEGER NOT NULL DEFAULT 0,
  historical_days_remaining INTEGER NOT NULL DEFAULT 365,
  real_events_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, item_type, calculation_date)
);

-- Enable RLS on daily_demand_cache
ALTER TABLE public.daily_demand_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for daily_demand_cache
CREATE POLICY "Daily demand cache manageable by authenticated users" 
ON public.daily_demand_cache 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Daily demand cache viewable by authenticated users" 
ON public.daily_demand_cache 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create function to update TTM values daily
CREATE OR REPLACE FUNCTION public.update_daily_ttm_values()
RETURNS TEXT AS $$
DECLARE
  item_record RECORD;
  days_since_import INTEGER;
  historical_contribution NUMERIC;
  real_events_sum INTEGER;
  new_ttm INTEGER;
  processed_count INTEGER := 0;
BEGIN
  -- Process all items with TTM data
  FOR item_record IN 
    SELECT id, 'inventory_item' as item_type, consumption_start_date, 
           daily_consumption_rate, consumption_last_12_months
    FROM public.inventory_items 
    WHERE consumption_start_date IS NOT NULL
    UNION ALL
    SELECT id, 'assembly' as item_type, consumption_start_date,
           daily_consumption_rate, consumption_last_12_months  
    FROM public.assemblies
    WHERE consumption_start_date IS NOT NULL
  LOOP
    days_since_import := CURRENT_DATE - item_record.consumption_start_date;
    
    IF days_since_import <= 365 THEN
      -- Still in transition period
      historical_contribution := (365 - days_since_import) * item_record.daily_consumption_rate;
      
      -- Get real events for this item
      IF item_record.item_type = 'inventory_item' THEN
        SELECT COALESCE(SUM(quantity_demanded), 0) INTO real_events_sum
        FROM public.demand_events 
        WHERE inventory_item_id = item_record.id
        AND demand_date >= item_record.consumption_start_date;
      ELSE
        SELECT COALESCE(SUM(quantity_demanded), 0) INTO real_events_sum
        FROM public.assembly_demand_events
        WHERE assembly_id = item_record.id  
        AND demand_date >= item_record.consumption_start_date;
      END IF;
      
      new_ttm := ROUND(historical_contribution + real_events_sum);
      
      -- Update cache
      INSERT INTO public.daily_demand_cache (
        item_id, item_type, calculation_date, ttm_value,
        historical_days_remaining, real_events_days
      ) VALUES (
        item_record.id, item_record.item_type, CURRENT_DATE, new_ttm,
        365 - days_since_import, days_since_import
      ) ON CONFLICT (item_id, item_type, calculation_date) 
      DO UPDATE SET ttm_value = new_ttm,
                    historical_days_remaining = 365 - days_since_import,
                    real_events_days = days_since_import;
                    
      processed_count := processed_count + 1;
    END IF;
  END LOOP;
  
  RETURN FORMAT('TTM values updated successfully for %s items', processed_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;