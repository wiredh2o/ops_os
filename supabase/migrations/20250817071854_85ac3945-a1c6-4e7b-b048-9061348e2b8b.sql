-- Create SHOPHR labor item if it doesn't exist
INSERT INTO public.labor_items (
  item_number,
  name,
  description,
  hourly_rate,
  unit_of_measure,
  is_taxable,
  eligible_for_distributor_discount,
  created_by
) VALUES (
  'SHOPHR',
  'Shop Hours',
  'General shop labor hours for repairs and maintenance',
  50.00,
  'hour',
  false,
  false,
  '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (item_number) DO NOTHING;

-- Create repair time logs table
CREATE TABLE public.repair_time_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_item_id UUID NOT NULL REFERENCES public.repair_items(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  total_hours NUMERIC(10,2),
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.repair_time_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Repair time logs manageable by authenticated users" 
ON public.repair_time_logs 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Repair time logs viewable by authenticated users" 
ON public.repair_time_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create function to calculate total hours for a repair item
CREATE OR REPLACE FUNCTION public.get_repair_item_total_hours(repair_item_id_param UUID)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_hours_result NUMERIC(10,2) := 0.00;
BEGIN
  SELECT COALESCE(SUM(total_hours), 0.00)
  INTO total_hours_result
  FROM public.repair_time_logs
  WHERE repair_item_id = repair_item_id_param
  AND total_hours IS NOT NULL;
  
  RETURN total_hours_result;
END;
$$;

-- Create function to update repair item status when time is logged
CREATE OR REPLACE FUNCTION public.update_repair_status_on_time_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When time log is completed (has end_time and total_hours)
  IF NEW.end_time IS NOT NULL AND NEW.total_hours IS NOT NULL AND NEW.total_hours > 0 THEN
    -- Update repair item status to 'in_repair' if it's currently 'repairable'
    UPDATE public.repair_items
    SET status = 'in_repair',
        updated_at = now()
    WHERE id = NEW.repair_item_id
    AND status = 'repairable';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for automatic status updates
CREATE TRIGGER trigger_update_repair_status_on_time_log
  AFTER INSERT OR UPDATE ON public.repair_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_repair_status_on_time_log();

-- Create indexes for performance
CREATE INDEX idx_repair_time_logs_repair_item_id ON public.repair_time_logs(repair_item_id);
CREATE INDEX idx_repair_time_logs_created_by ON public.repair_time_logs(created_by);