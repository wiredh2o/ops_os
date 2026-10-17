-- Add outsourcing columns to assemblies table
ALTER TABLE public.assemblies
ADD COLUMN is_externally_sourced boolean NOT NULL DEFAULT false,
ADD COLUMN external_supplier_id uuid REFERENCES public.suppliers(id),
ADD COLUMN external_part_number text;

-- Create assembly_purchase_uoms table for outsourced assembly pricing
CREATE TABLE public.assembly_purchase_uoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  purchase_uom text NOT NULL,
  quantity integer NOT NULL,
  unit_cost numeric NOT NULL,
  supplier_name text,
  lead_time_days integer,
  minimum_order_quantity integer DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assembly_purchase_uoms ENABLE ROW LEVEL SECURITY;

-- RLS policies for assembly_purchase_uoms
CREATE POLICY "Assembly purchase UOMs viewable by authenticated users"
ON public.assembly_purchase_uoms
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly purchase UOMs manageable by authenticated users"
ON public.assembly_purchase_uoms
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Trigger to ensure only one default purchase UOM per assembly
CREATE OR REPLACE FUNCTION public.ensure_single_default_assembly_purchase_uom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.assembly_purchase_uoms
    SET is_default = false
    WHERE assembly_id = NEW.assembly_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER ensure_single_default_assembly_purchase_uom_trigger
BEFORE INSERT OR UPDATE ON public.assembly_purchase_uoms
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_assembly_purchase_uom();

-- Index for performance
CREATE INDEX idx_assembly_purchase_uoms_assembly_id ON public.assembly_purchase_uoms(assembly_id);