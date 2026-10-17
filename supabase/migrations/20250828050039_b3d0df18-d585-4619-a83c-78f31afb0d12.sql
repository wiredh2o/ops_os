-- Create Assembly Components relationships
-- Power Supply Assembly components
INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
((SELECT id FROM assemblies WHERE sku = 'ASSY-PSU-24V'), (SELECT id FROM inventory_items WHERE sku = 'CONN-4PIN'), 2),
((SELECT id FROM assemblies WHERE sku = 'ASSY-PSU-24V'), (SELECT id FROM inventory_items WHERE sku = 'WIRE-16AWG-RED'), 3),
((SELECT id FROM assemblies WHERE sku = 'ASSY-PSU-24V'), (SELECT id FROM inventory_items WHERE sku = 'WIRE-16AWG-BLK'), 3),
((SELECT id FROM assemblies WHERE sku = 'ASSY-PSU-24V'), (SELECT id FROM inventory_items WHERE sku = 'HEAT-SHRINK-6MM'), 2);

-- Control Panel Assembly components  
INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
((SELECT id FROM assemblies WHERE sku = 'ASSY-CTRL-PANEL'), (SELECT id FROM inventory_items WHERE sku = 'SWITCH-MICRO'), 3),
((SELECT id FROM assemblies WHERE sku = 'ASSY-CTRL-PANEL'), (SELECT id FROM inventory_items WHERE sku = 'LED-RED-5MM'), 5),
((SELECT id FROM assemblies WHERE sku = 'ASSY-CTRL-PANEL'), (SELECT id FROM inventory_items WHERE sku = 'RES-10K-1W'), 8),
((SELECT id FROM assemblies WHERE sku = 'ASSY-CTRL-PANEL'), (SELECT id FROM inventory_items WHERE sku = 'BOLT-M8-50'), 4),
((SELECT id FROM assemblies WHERE sku = 'ASSY-CTRL-PANEL'), (SELECT id FROM inventory_items WHERE sku = 'NUT-M8-SS'), 4);

-- Motor Mount Assembly components
INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
((SELECT id FROM assemblies WHERE sku = 'ASSY-MOTOR-MOUNT'), (SELECT id FROM inventory_items WHERE sku = 'BEAR-6204-2RS'), 2),
((SELECT id FROM assemblies WHERE sku = 'ASSY-MOTOR-MOUNT'), (SELECT id FROM inventory_items WHERE sku = 'BOLT-M8-50'), 8),
((SELECT id FROM assemblies WHERE sku = 'ASSY-MOTOR-MOUNT'), (SELECT id FROM inventory_items WHERE sku = 'NUT-M8-SS'), 8),
((SELECT id FROM assemblies WHERE sku = 'ASSY-MOTOR-MOUNT'), (SELECT id FROM inventory_items WHERE sku = 'WASH-M8-SS'), 16),
((SELECT id FROM assemblies WHERE sku = 'ASSY-MOTOR-MOUNT'), (SELECT id FROM inventory_items WHERE sku = 'GREASE-MARINE'), 1);

-- Sensor Package Assembly components
INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
((SELECT id FROM assemblies WHERE sku = 'ASSY-SENSOR-PKG'), (SELECT id FROM inventory_items WHERE sku = 'SENSOR-TEMP-DS18B20'), 2),
((SELECT id FROM assemblies WHERE sku = 'ASSY-SENSOR-PKG'), (SELECT id FROM inventory_items WHERE sku = 'SWITCH-MICRO'), 1),
((SELECT id FROM assemblies WHERE sku = 'ASSY-SENSOR-PKG'), (SELECT id FROM inventory_items WHERE sku = 'WIRE-16AWG-RED'), 5),
((SELECT id FROM assemblies WHERE sku = 'ASSY-SENSOR-PKG'), (SELECT id FROM inventory_items WHERE sku = 'SCREW-M6-25'), 4);

-- Wire Harness Assembly components
INSERT INTO public.assembly_components (assembly_id, inventory_item_id, quantity_needed) VALUES
((SELECT id FROM assemblies WHERE sku = 'ASSY-WIRE-HARNESS'), (SELECT id FROM inventory_items WHERE sku = 'WIRE-16AWG-RED'), 8),
((SELECT id FROM assemblies WHERE sku = 'ASSY-WIRE-HARNESS'), (SELECT id FROM inventory_items WHERE sku = 'WIRE-16AWG-BLK'), 8),
((SELECT id FROM assemblies WHERE sku = 'ASSY-WIRE-HARNESS'), (SELECT id FROM inventory_items WHERE sku = 'CONN-4PIN'), 4),
((SELECT id FROM assemblies WHERE sku = 'ASSY-WIRE-HARNESS'), (SELECT id FROM inventory_items WHERE sku = 'HEAT-SHRINK-6MM'), 6),
((SELECT id FROM assemblies WHERE sku = 'ASSY-WIRE-HARNESS'), (SELECT id FROM inventory_items WHERE sku = 'SILICONE-SEAL'), 1);

-- Insert historical demand events for inventory items (last 90 days)
INSERT INTO public.demand_events (inventory_item_id, quantity_demanded, demand_source, source_order_id, demand_date) 
SELECT 
  ii.id,
  (RANDOM() * 20 + 1)::INTEGER,
  'customer_order',
  gen_random_uuid(),
  CURRENT_DATE - (RANDOM() * 90)::INTEGER
FROM inventory_items ii
CROSS JOIN generate_series(1, 5) -- 5 demand events per item
ORDER BY RANDOM()
LIMIT 100;

-- Insert historical demand events for assemblies (last 90 days)
INSERT INTO public.assembly_demand_events (assembly_id, quantity_demanded, demand_source, source_order_id, demand_date)
SELECT 
  a.id,
  (RANDOM() * 5 + 1)::INTEGER,
  'customer_order', 
  gen_random_uuid(),
  CURRENT_DATE - (RANDOM() * 90)::INTEGER
FROM assemblies a
CROSS JOIN generate_series(1, 3) -- 3 demand events per assembly
ORDER BY RANDOM()
LIMIT 15;

-- Insert inventory order history for TTM calculations
INSERT INTO public.inventory_order_history (inventory_item_id, production_order_id, quantity_ordered, order_date)
SELECT 
  ii.id,
  gen_random_uuid(),
  (RANDOM() * 50 + 10)::INTEGER,
  CURRENT_DATE - (RANDOM() * 365)::INTEGER
FROM inventory_items ii
CROSS JOIN generate_series(1, 8) -- 8 orders per item over the year
ORDER BY RANDOM()
LIMIT 160;

-- Update TTM values based on historical data
UPDATE inventory_items 
SET consumption_last_12_months = (
  SELECT COALESCE(SUM(quantity_ordered), 0)
  FROM inventory_order_history ioh
  WHERE ioh.inventory_item_id = inventory_items.id
  AND ioh.order_date >= CURRENT_DATE - INTERVAL '365 days'
);

-- Update assembly TTM values
UPDATE assemblies
SET consumption_last_12_months = (
  SELECT COALESCE(SUM(quantity_demanded), 0) 
  FROM assembly_demand_events ade
  WHERE ade.assembly_id = assemblies.id
  AND ade.demand_date >= CURRENT_DATE - INTERVAL '365 days'
);

-- Set realistic consumption start dates
UPDATE inventory_items SET consumption_start_date = CURRENT_DATE - INTERVAL '365 days';
UPDATE assemblies SET consumption_start_date = CURRENT_DATE - INTERVAL '365 days';