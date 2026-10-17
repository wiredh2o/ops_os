-- Drop the existing foreign key constraint that points to non-existent repair_orders table
ALTER TABLE public.repair_items 
DROP CONSTRAINT IF EXISTS repair_items_repair_order_fk;

-- Add correct foreign key constraint to link repair items to inbound packages
ALTER TABLE public.repair_items 
ADD CONSTRAINT repair_items_package_fk 
FOREIGN KEY (repair_order_id) REFERENCES public.inbound_packages(id) ON DELETE CASCADE;

-- Also rename the column to be more clear about what it references
ALTER TABLE public.repair_items 
RENAME COLUMN repair_order_id TO package_id;