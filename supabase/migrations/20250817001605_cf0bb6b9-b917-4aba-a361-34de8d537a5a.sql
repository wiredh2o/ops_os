-- Add expected_item_count field to track the total quantity indicated when package was unboxed
ALTER TABLE public.inbound_packages 
ADD COLUMN expected_item_count integer DEFAULT NULL;

-- Add a comment to explain the field
COMMENT ON COLUMN public.inbound_packages.expected_item_count IS 'Total number of items expected in this package as indicated during unboxing';