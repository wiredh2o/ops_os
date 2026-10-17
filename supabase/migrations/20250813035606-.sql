-- Create table to link inbound packages to repair items
CREATE TABLE IF NOT EXISTS public.inbound_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL,
  repair_item_id UUID NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_inbound_package_items_package
    FOREIGN KEY (package_id)
    REFERENCES public.inbound_packages (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_inbound_package_items_repair_item
    FOREIGN KEY (repair_item_id)
    REFERENCES public.repair_items (id)
    ON DELETE CASCADE,
  CONSTRAINT uq_inbound_package_items UNIQUE (package_id, repair_item_id)
);

-- Enable RLS
ALTER TABLE public.inbound_package_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Inbound package items manageable by authenticated users" 
ON public.inbound_package_items
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Inbound package items viewable by authenticated users" 
ON public.inbound_package_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inbound_package_items_package_id ON public.inbound_package_items (package_id);
CREATE INDEX IF NOT EXISTS idx_inbound_package_items_repair_item_id ON public.inbound_package_items (repair_item_id);
