-- Add shipping preference to inbound_packages
ALTER TABLE public.inbound_packages 
ADD COLUMN IF NOT EXISTS shipping_preference text NOT NULL DEFAULT 'ship_complete';

-- Add customer_initiated flag for future customer portal
ALTER TABLE public.inbound_packages 
ADD COLUMN IF NOT EXISTS customer_initiated boolean NOT NULL DEFAULT false;

-- Add priority_order to repair_items for drag-and-drop ordering
ALTER TABLE public.repair_items 
ADD COLUMN IF NOT EXISTS priority_order integer;

-- Add comment explaining the fields
COMMENT ON COLUMN public.inbound_packages.shipping_preference IS 'ship_complete = wait for all items, ship_as_available = ship items individually';
COMMENT ON COLUMN public.inbound_packages.customer_initiated IS 'True if package was created via customer self-service portal';
COMMENT ON COLUMN public.repair_items.priority_order IS 'Priority order for ship_as_available packages. Lower = higher priority. NULL = FIFO by created_at';