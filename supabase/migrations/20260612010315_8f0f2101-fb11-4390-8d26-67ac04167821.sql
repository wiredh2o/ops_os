-- 1. Backfill any NULL unboxing_order values
-- For each package, assign sequential numbers to NULL rows starting after the current MAX
WITH numbered AS (
  SELECT
    id,
    package_id,
    COALESCE(
      (SELECT MAX(unboxing_order) FROM public.inbound_package_items ipi2 WHERE ipi2.package_id = ipi.package_id),
      0
    ) + ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at, id) AS new_order
  FROM public.inbound_package_items ipi
  WHERE unboxing_order IS NULL
)
UPDATE public.inbound_package_items target
SET unboxing_order = numbered.new_order
FROM numbered
WHERE target.id = numbered.id;

-- 2. Create the trigger function to auto-assign unboxing_order
CREATE OR REPLACE FUNCTION public.assign_inbound_package_item_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.unboxing_order IS NULL THEN
    SELECT COALESCE(MAX(unboxing_order), 0) + 1
    INTO NEW.unboxing_order
    FROM public.inbound_package_items
    WHERE package_id = NEW.package_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach the trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_assign_inbound_package_item_order ON public.inbound_package_items;
CREATE TRIGGER trg_assign_inbound_package_item_order
BEFORE INSERT ON public.inbound_package_items
FOR EACH ROW
EXECUTE FUNCTION public.assign_inbound_package_item_order();

-- 4. Make unboxing_order NOT NULL now that all rows have values and trigger guarantees future inserts
ALTER TABLE public.inbound_package_items
  ALTER COLUMN unboxing_order SET NOT NULL;