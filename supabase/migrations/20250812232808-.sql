-- Add is_subassembly flag to assemblies
ALTER TABLE public.assemblies
  ADD COLUMN IF NOT EXISTS is_subassembly boolean NOT NULL DEFAULT false;

-- Create assembly_subassemblies table to model parent assembly -> subassembly relationships
CREATE TABLE IF NOT EXISTS public.assembly_subassemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  subassembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE RESTRICT,
  quantity_needed integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_subassemblies_unique UNIQUE (parent_assembly_id, subassembly_id),
  CONSTRAINT assembly_subassemblies_no_self CHECK (parent_assembly_id <> subassembly_id)
);

-- RLS for assembly_subassemblies
ALTER TABLE public.assembly_subassemblies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assembly_subassemblies' AND policyname = 'Assembly subassemblies manageable by authenticated users'
  ) THEN
    CREATE POLICY "Assembly subassemblies manageable by authenticated users"
    ON public.assembly_subassemblies
    FOR ALL
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assembly_subassemblies_updated_at ON public.assembly_subassemblies;
CREATE TRIGGER trg_assembly_subassemblies_updated_at
BEFORE UPDATE ON public.assembly_subassemblies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add subassembly-related flags to production_orders
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS is_subassembly_build boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_at_point_of_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_order_id uuid NULL REFERENCES public.production_orders(id) ON DELETE SET NULL;

-- Update existing RPC to exclude subassembly builds
CREATE OR REPLACE FUNCTION public.get_ready_to_build_production_orders()
RETURNS TABLE(id uuid, order_number text, customer_name text, created_at timestamptz, priority text, status text, notes text, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.notes,
    po.total_amount
  FROM public.production_orders po
  WHERE po.order_type = 'assembly_build'
    AND COALESCE(po.is_subassembly_build, false) = false
    AND po.status IN ('pending', 'approved')
    AND NOT EXISTS (
      -- Check if any required component lacks sufficient inventory
      SELECT 1
      FROM public.production_order_items poi
      JOIN public.assembly_components ac ON poi.assembly_id = ac.assembly_id
      JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
      WHERE poi.production_order_id = po.id
        AND poi.item_type = 'assembly'
        AND ii.quantity_on_hand < (ac.quantity_needed * poi.quantity)
    )
  ORDER BY po.created_at ASC;
END;
$$;

-- New RPC: ready-to-build Subassembly orders only
CREATE OR REPLACE FUNCTION public.get_ready_to_build_subassembly_orders()
RETURNS TABLE(id uuid, order_number text, customer_name text, created_at timestamptz, priority text, status text, notes text, total_amount numeric, store_at_point_of_use boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.notes,
    po.total_amount,
    po.store_at_point_of_use
  FROM public.production_orders po
  WHERE po.order_type = 'assembly_build'
    AND COALESCE(po.is_subassembly_build, false) = true
    AND po.status IN ('pending', 'approved')
    AND NOT EXISTS (
      -- Check if any required component lacks sufficient inventory
      SELECT 1
      FROM public.production_order_items poi
      JOIN public.assembly_components ac ON poi.assembly_id = ac.assembly_id
      JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
      WHERE poi.production_order_id = po.id
        AND poi.item_type = 'assembly'
        AND ii.quantity_on_hand < (ac.quantity_needed * poi.quantity)
    )
  ORDER BY po.created_at ASC;
END;
$$;

-- Recompute subassembly needs for a given parent order
CREATE OR REPLACE FUNCTION public.recompute_subassembly_requirements(target_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  parent_rec record;
  sa_rec record;
  child_order_id uuid;
  needed integer;
  available integer;
  shortage integer;
  unit_price numeric;
  child_item_id uuid;
BEGIN
  -- For each assembly item in the parent order
  FOR parent_rec IN
    SELECT poi.assembly_id, SUM(poi.quantity) AS qty
    FROM public.production_order_items poi
    JOIN public.production_orders po ON po.id = poi.production_order_id
    WHERE poi.production_order_id = target_order_id
      AND poi.item_type = 'assembly'
      AND po.order_type = 'assembly_build'
      AND COALESCE(po.is_subassembly_build, false) = false
    GROUP BY poi.assembly_id
  LOOP
    -- For each subassembly requirement
    FOR sa_rec IN
      SELECT s.subassembly_id, s.quantity_needed
      FROM public.assembly_subassemblies s
      WHERE s.parent_assembly_id = parent_rec.assembly_id
    LOOP
      needed := parent_rec.qty * sa_rec.quantity_needed;
      SELECT GREATEST(a.quantity_on_hand - a.quantity_allocated, 0), a.selling_price
      INTO available, unit_price
      FROM public.assemblies a
      WHERE a.id = sa_rec.subassembly_id;

      shortage := needed - COALESCE(available, 0);

      -- If shortage <= 0, cancel existing child order if any
      IF shortage <= 0 THEN
        SELECT po.id INTO child_order_id
        FROM public.production_orders po
        JOIN public.production_order_items poi ON poi.production_order_id = po.id
        WHERE po.parent_order_id = target_order_id
          AND po.is_subassembly_build = true
          AND poi.item_type = 'assembly'
          AND poi.assembly_id = sa_rec.subassembly_id
          AND po.status IN ('pending','approved','in_progress')
        LIMIT 1;

        IF child_order_id IS NOT NULL THEN
          UPDATE public.production_orders
          SET status = 'cancelled',
              notes = COALESCE(notes,'') || ' [Auto-cancelled: no shortage]'
          WHERE id = child_order_id;
        END IF;

      ELSE
        -- Upsert a child subassembly production order
        SELECT po.id INTO child_order_id
        FROM public.production_orders po
        JOIN public.production_order_items poi ON poi.production_order_id = po.id
        WHERE po.parent_order_id = target_order_id
          AND po.is_subassembly_build = true
          AND poi.item_type = 'assembly'
          AND poi.assembly_id = sa_rec.subassembly_id
          AND po.status IN ('pending','approved','in_progress')
        LIMIT 1;

        IF child_order_id IS NULL THEN
          -- Create new child order
          INSERT INTO public.production_orders (
            order_number, customer_name, order_type, order_subtype, priority, status,
            auto_generated, source_reason, notes, created_by, is_subassembly_build,
            store_at_point_of_use, parent_order_id, total_amount
          ) VALUES (
            'AUTO-SA-' || to_char(now(), 'YYYYMMDD') || '-' || EXTRACT(EPOCH FROM now())::text,
            'Subassembly for Parent ' || (SELECT order_number FROM public.production_orders WHERE id = target_order_id),
            'assembly_build', 'internal', 'high', 'pending',
            true, 'Cascade from parent assembly', 'Auto-generated subassembly build',
            COALESCE(auth.uid(), (SELECT created_by FROM public.production_orders WHERE id = target_order_id)),
            true, true, target_order_id, 0
          ) RETURNING id INTO child_order_id;

          -- Add the subassembly item
          INSERT INTO public.production_order_items (
            production_order_id, item_type, assembly_id, item_name, item_sku,
            quantity, unit_price, total_price, is_taxable, status
          )
          SELECT 
            child_order_id, 'assembly', a.id, 'Assembly: ' || a.sku, a.sku,
            shortage, unit_price, unit_price * shortage, true, 'pending'
          FROM public.assemblies a
          WHERE a.id = sa_rec.subassembly_id;

        ELSE
          -- Update existing child order item quantity and totals
          SELECT id INTO child_item_id
          FROM public.production_order_items
          WHERE production_order_id = child_order_id
            AND item_type = 'assembly'
            AND assembly_id = sa_rec.subassembly_id
          LIMIT 1;

          IF child_item_id IS NOT NULL THEN
            UPDATE public.production_order_items
            SET quantity = shortage,
                unit_price = unit_price,
                total_price = unit_price * shortage,
                updated_at = now()
            WHERE id = child_item_id;
          END IF;

          UPDATE public.production_orders
          SET updated_at = now(),
              status = CASE WHEN status = 'cancelled' THEN 'pending' ELSE status END
          WHERE id = child_order_id;
        END IF;

        -- Sync child order total
        UPDATE public.production_orders po
        SET total_amount = subq.sum_total
        FROM (
          SELECT production_order_id, COALESCE(SUM(total_price),0) AS sum_total
          FROM public.production_order_items
          WHERE production_order_id = child_order_id
          GROUP BY production_order_id
        ) subq
        WHERE po.id = child_order_id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Trigger on production_order_items to trigger recomputation automatically
CREATE OR REPLACE FUNCTION public.tg_on_poi_recompute_subassemblies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.recompute_subassembly_requirements(NEW.production_order_id);
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.recompute_subassembly_requirements(NEW.production_order_id);
    IF (OLD.production_order_id IS DISTINCT FROM NEW.production_order_id) THEN
      PERFORM public.recompute_subassembly_requirements(OLD.production_order_id);
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.recompute_subassembly_requirements(OLD.production_order_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_subassemblies ON public.production_order_items;
CREATE TRIGGER trg_recompute_subassemblies
AFTER INSERT OR UPDATE OR DELETE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_on_poi_recompute_subassemblies();