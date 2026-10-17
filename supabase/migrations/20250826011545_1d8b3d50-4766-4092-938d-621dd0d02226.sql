-- Create system_settings table for global configuration
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for system_settings (admin-only management)
CREATE POLICY "System settings manageable by admins" 
ON public.system_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

CREATE POLICY "System settings viewable by authenticated users" 
ON public.system_settings 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert default sales tax setting
INSERT INTO public.system_settings (setting_key, setting_value, description) 
VALUES ('sales_tax_percentage', '8.25', 'Default sales tax percentage applied to taxable items');

-- Rename companies.discount_taxable to companies.is_taxable
ALTER TABLE public.companies 
RENAME COLUMN discount_taxable TO is_taxable;

-- Add tax fields to production_order_items
ALTER TABLE public.production_order_items 
ADD COLUMN tax_rate NUMERIC(5,4) DEFAULT 0,
ADD COLUMN tax_amount NUMERIC(10,2) DEFAULT 0;

-- Add tax fields to repair_item_estimates
ALTER TABLE public.repair_item_estimates 
ADD COLUMN is_taxable BOOLEAN DEFAULT true,
ADD COLUMN tax_rate NUMERIC(5,4) DEFAULT 0,
ADD COLUMN tax_amount NUMERIC(10,2) DEFAULT 0;