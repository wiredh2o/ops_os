-- Add ships_in_own_packaging flag to assemblies
ALTER TABLE public.assemblies
ADD COLUMN ships_in_own_packaging BOOLEAN NOT NULL DEFAULT false;

-- Add ships_in_own_packaging flag to inventory_items
ALTER TABLE public.inventory_items
ADD COLUMN ships_in_own_packaging BOOLEAN NOT NULL DEFAULT false;

-- Add comments for clarity
COMMENT ON COLUMN public.assemblies.ships_in_own_packaging IS 'When true, single units ship without outer box. Multiples may be consolidated.';
COMMENT ON COLUMN public.inventory_items.ships_in_own_packaging IS 'When true, single units ship without outer box. Multiples may be consolidated.';