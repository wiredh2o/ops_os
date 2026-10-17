-- Repair Items feature: tables and RLS policies (fixed policy creation)

-- 1) Create repair_items table
CREATE TABLE IF NOT EXISTS public.repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id uuid NOT NULL,
  item_name text NOT NULL,
  serial_number text NULL,
  mac_address text NULL,
  problem_reported text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'logged',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK to repair_orders (cascade delete so items are removed with the order)
DO $$ BEGIN
  ALTER TABLE public.repair_items
    ADD CONSTRAINT repair_items_repair_order_fk
    FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists
  NULL;
END $$;

-- Enable RLS and recreate policies safely
ALTER TABLE public.repair_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Repair items manageable by authenticated users" ON public.repair_items;
CREATE POLICY "Repair items manageable by authenticated users"
  ON public.repair_items FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Repair items viewable by authenticated users" ON public.repair_items;
CREATE POLICY "Repair items viewable by authenticated users"
  ON public.repair_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2) Create repair_item_photos table
CREATE TABLE IF NOT EXISTS public.repair_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL,
  file_path text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK and index
DO $$ BEGIN
  ALTER TABLE public.repair_item_photos
    ADD CONSTRAINT repair_item_photos_item_fk
    FOREIGN KEY (repair_item_id) REFERENCES public.repair_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_repair_item_photos_item ON public.repair_item_photos (repair_item_id);

-- Enable RLS and recreate policies safely
ALTER TABLE public.repair_item_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Repair item photos manageable by authenticated users" ON public.repair_item_photos;
CREATE POLICY "Repair item photos manageable by authenticated users"
  ON public.repair_item_photos FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Repair item photos viewable by authenticated users" ON public.repair_item_photos;
CREATE POLICY "Repair item photos viewable by authenticated users"
  ON public.repair_item_photos FOR SELECT
  USING (auth.uid() IS NOT NULL);
