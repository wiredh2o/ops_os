-- Update the existing repair package to have expected_item_count = 3
UPDATE public.inbound_packages 
SET expected_item_count = 3 
WHERE id = '10ce21dd-003e-4a59-b60d-bc0445767caa' 
  AND initiated_via = 'repair';