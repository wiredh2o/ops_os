-- Create dummy inventory items
INSERT INTO public.inventory_items (
  sku, description, unit_cost, selling_price, quantity_on_hand, 
  reorder_point, lead_time_days, minimum_order_quantity, 
  category, length_inches, width_inches, height_inches, weight_pounds,
  created_by
) VALUES 
-- Raw materials
('STEEL-001', 'Steel Sheet 4x8ft 16ga', 125.50, 187.75, 250, 50, 21, 10, 'raw_materials', 96, 48, 0.0625, 85.2, (SELECT id FROM auth.users LIMIT 1)),
('ALUM-002', 'Aluminum Extrusion 2x2x1/8', 8.75, 13.15, 400, 100, 14, 50, 'raw_materials', 144, 2, 2, 3.2, (SELECT id FROM auth.users LIMIT 1)),
('BOLT-003', 'Hex Bolt 1/4-20 x 1"', 0.25, 0.45, 2000, 500, 7, 100, 'fasteners', 1, 0.25, 0.25, 0.02, (SELECT id FROM auth.users LIMIT 1)),
('WASHER-004', 'Flat Washer 1/4" SS', 0.05, 0.12, 5000, 1000, 7, 500, 'fasteners', 0.625, 0.625, 0.063, 0.005, (SELECT id FROM auth.users LIMIT 1)),
('PAINT-005', 'Powder Coat Black RAL9005', 3.25, 6.50, 80, 20, 10, 5, 'finishing', 12, 6, 8, 2.5, (SELECT id FROM auth.users LIMIT 1)),

-- Electronics
('LED-006', 'LED Strip 5050 RGB 60/m', 12.50, 25.00, 150, 30, 28, 10, 'electronics', 196, 0.4, 0.1, 0.8, (SELECT id FROM auth.users LIMIT 1)),
('CTRL-007', 'RGB Controller WiFi', 35.00, 70.00, 75, 15, 21, 5, 'electronics', 4.5, 3.2, 1.1, 0.3, (SELECT id FROM auth.users LIMIT 1)),
('WIRE-008', '18AWG Stranded Wire Black', 0.85, 1.70, 1000, 200, 14, 100, 'electronics', 12, 0.125, 0.125, 0.008, (SELECT id FROM auth.users LIMIT 1)),

-- Packaging
('BOX-009', 'Shipping Box 12x8x6', 2.15, 4.30, 300, 75, 5, 25, 'packaging', 12, 8, 6, 0.4, (SELECT id FROM auth.users LIMIT 1)),
('FOAM-010', 'Protective Foam Insert', 1.25, 2.50, 200, 50, 7, 20, 'packaging', 11.5, 7.5, 2, 0.1, (SELECT id FROM auth.users LIMIT 1));

-- Create base assembly (no subassemblies)
INSERT INTO public.assemblies (
  sku, description, selling_price, markup_percentage, 
  lead_time_days, quantity_on_hand, reorder_point,
  length_inches, width_inches, height_inches, weight_pounds,
  volume_cubic_inches, created_by
) VALUES 
('FRAME-ASM-001', 'Basic Steel Frame Assembly', 450.00, 35.5, 14, 25, 10, 48, 24, 8, 12.5, 9216, (SELECT id FROM auth.users LIMIT 1)),
('LED-STRIP-ASM', 'Complete LED Strip Kit', 125.00, 42.8, 10, 40, 15, 16.5, 4, 2, 1.2, 132, (SELECT id FROM auth.users LIMIT 1));

-- Get assembly IDs for components
DO $$
DECLARE
  frame_id UUID;
  led_id UUID;
BEGIN
  SELECT id INTO frame_id FROM public.assemblies WHERE sku = 'FRAME-ASM-001';
  SELECT id INTO led_id FROM public.assemblies WHERE sku = 'LED-STRIP-ASM';
  
  -- Components for Basic Steel Frame Assembly
  INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
  (frame_id, (SELECT id FROM public.inventory_items WHERE sku = 'STEEL-001'), 2),
  (frame_id, (SELECT id FROM public.inventory_items WHERE sku = 'BOLT-003'), 16),
  (frame_id, (SELECT id FROM public.inventory_items WHERE sku = 'WASHER-004'), 32),
  (frame_id, (SELECT id FROM public.inventory_items WHERE sku = 'PAINT-005'), 0.5);
  
  -- Components for LED Strip Kit
  INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
  (led_id, (SELECT id FROM public.inventory_items WHERE sku = 'LED-006'), 1),
  (led_id, (SELECT id FROM public.inventory_items WHERE sku = 'CTRL-007'), 1),
  (led_id, (SELECT id FROM public.inventory_items WHERE sku = 'WIRE-008'), 5),
  (led_id, (SELECT id FROM public.inventory_items WHERE sku = 'BOX-009'), 1),
  (led_id, (SELECT id FROM public.inventory_items WHERE sku = 'FOAM-010'), 1);
END $$;

-- Create complex assembly with subassemblies
INSERT INTO public.assemblies (
  sku, description, selling_price, markup_percentage, 
  lead_time_days, quantity_on_hand, reorder_point,
  length_inches, width_inches, height_inches, weight_pounds,
  volume_cubic_inches, created_by
) VALUES 
('COMPLETE-UNIT-001', 'Complete Illuminated Frame Unit', 750.00, 31.6, 21, 8, 5, 50, 26, 10, 15.8, 13000, (SELECT id FROM auth.users LIMIT 1));

-- Add subassembly relationships and additional components
DO $$
DECLARE
  complete_id UUID;
  frame_id UUID;
  led_id UUID;
BEGIN
  SELECT id INTO complete_id FROM public.assemblies WHERE sku = 'COMPLETE-UNIT-001';
  SELECT id INTO frame_id FROM public.assemblies WHERE sku = 'FRAME-ASM-001';
  SELECT id INTO led_id FROM public.assemblies WHERE sku = 'LED-STRIP-ASM';
  
  -- Add subassemblies to complete unit
  INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
  (complete_id, (SELECT id FROM public.inventory_items WHERE sku = 'ALUM-002'), 4),
  (complete_id, (SELECT id FROM public.inventory_items WHERE sku = 'BOLT-003'), 8),
  (complete_id, (SELECT id FROM public.inventory_items WHERE sku = 'BOX-009'), 1);
  
  -- Add subassemblies (using assembly_subassemblies table if it exists, or we'll add them as special components)
  -- For now, we'll add them as references in assembly_components with a note
END $$;

-- Update some TTM values for demonstration
UPDATE public.inventory_items 
SET ttm_weeks = 12.5 
WHERE sku IN ('STEEL-001', 'ALUM-002');

UPDATE public.inventory_items 
SET ttm_weeks = 4.2 
WHERE sku IN ('LED-006', 'CTRL-007');

UPDATE public.inventory_items 
SET ttm_weeks = 2.1 
WHERE sku IN ('BOLT-003', 'WASHER-004', 'WIRE-008');

UPDATE public.assemblies 
SET ttm_weeks = 8.3 
WHERE sku IN ('FRAME-ASM-001', 'LED-STRIP-ASM');

UPDATE public.assemblies 
SET ttm_weeks = 10.7 
WHERE sku = 'COMPLETE-UNIT-001';

-- Add some demand history for TTM calculations
INSERT INTO public.demand_events (inventory_item_id, quantity_demanded, demand_source, demand_date) 
SELECT 
  ii.id,
  CASE 
    WHEN ii.sku LIKE 'STEEL%' THEN floor(random() * 5 + 1)::integer
    WHEN ii.sku LIKE 'BOLT%' OR ii.sku LIKE 'WASHER%' THEN floor(random() * 50 + 10)::integer
    ELSE floor(random() * 10 + 2)::integer
  END,
  'customer_order',
  CURRENT_DATE - (random() * 90)::integer
FROM public.inventory_items ii
CROSS JOIN generate_series(1, 15) -- Generate multiple demand events per item
WHERE random() < 0.7; -- Add some randomness

INSERT INTO public.assembly_demand_events (assembly_id, quantity_demanded, demand_source, demand_date)
SELECT 
  a.id,
  floor(random() * 3 + 1)::integer,
  'customer_order',
  CURRENT_DATE - (random() * 60)::integer
FROM public.assemblies a
CROSS JOIN generate_series(1, 8) -- Generate demand events for assemblies
WHERE random() < 0.8;