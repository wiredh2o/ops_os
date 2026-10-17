-- Insert Drop Ship Freight labor item for invoice line items
-- This is used when drop-shipping items from vendors to customers
-- IMPORTANT: Freight is NEVER taxable (23+ year business rule)

INSERT INTO public.labor_items (item_number, name, description, is_taxable, hourly_rate, unit_of_measure, created_by)
SELECT 
  'FREIGHT-DS',
  'Drop Ship Freight',
  'Freight charges for drop-shipped items - automatically calculated from vendor to customer address',
  false,
  0,
  'flat',
  (SELECT id FROM public.profiles LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.labor_items WHERE item_number = 'FREIGHT-DS'
);