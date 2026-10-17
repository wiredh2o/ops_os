-- Insert 20 Inventory Items
INSERT INTO public.inventory_items (
  id, sku, sales_description, purchase_description, unit_price, unit_cost, 
  quantity_on_hand, reorder_point, lead_time_days, minimum_order_quantity,
  dimension_l, dimension_w, dimension_h, weight_oz, volume_cubic_inches,
  eligible_for_distributor_discount, is_taxable, vendor, manufacturer_part_number,
  created_by
) VALUES
-- Fasteners & Hardware
(gen_random_uuid(), 'BOLT-M8-50', 'M8x50mm Hex Bolt - Stainless Steel', 'Metric hex bolt M8x50 316SS', 2.50, 1.25, 500, 100, 14, 100, 2.0, 0.5, 0.5, 0.8, 0.5, true, true, 'Fastenal', 'M8X50-316SS', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'NUT-M8-SS', 'M8 Hex Nut - Stainless Steel', 'Metric hex nut M8 316SS', 1.25, 0.65, 800, 200, 14, 200, 0.6, 0.6, 0.4, 0.3, 0.15, true, true, 'Fastenal', 'M8NUT-316SS', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'WASH-M8-SS', 'M8 Flat Washer - Stainless Steel', 'Metric flat washer M8 316SS', 0.75, 0.35, 1000, 250, 14, 500, 0.8, 0.8, 0.1, 0.1, 0.05, true, true, 'Fastenal', 'M8WASH-316SS', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'SCREW-M6-25', 'M6x25mm Socket Head Cap Screw', 'Metric SHCS M6x25 black oxide', 1.85, 0.92, 300, 75, 21, 50, 1.0, 0.4, 0.4, 0.4, 0.16, true, true, 'McMaster-Carr', 'M6X25-SHCS', (SELECT id FROM auth.users LIMIT 1)),

-- Electronic Components
(gen_random_uuid(), 'RES-10K-1W', '10kΩ 1W Metal Film Resistor', '10K ohm 1 watt metal film resistor 1%', 0.45, 0.18, 250, 50, 7, 100, 0.4, 0.1, 0.1, 0.02, 0.004, true, true, 'Digi-Key', 'MFR-25FRF52-10K', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'CAP-100UF-25V', '100µF 25V Electrolytic Capacitor', '100uF 25V electrolytic capacitor radial', 0.85, 0.42, 150, 30, 10, 50, 0.5, 0.3, 0.3, 0.05, 0.045, true, true, 'Digi-Key', 'ECA-1EM101', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'LED-RED-5MM', '5mm Red LED - High Brightness', '5mm red LED 2000mcd clear lens', 0.35, 0.15, 500, 100, 7, 250, 0.2, 0.2, 0.3, 0.01, 0.012, true, true, 'Digi-Key', 'C503B-RAN', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'CONN-4PIN', '4-Pin Terminal Block Connector', '4 position terminal block 5mm pitch', 2.25, 1.12, 75, 20, 14, 25, 0.8, 0.6, 0.4, 0.3, 0.19, true, true, 'Phoenix Contact', 'MKDS-1,5/4', (SELECT id FROM auth.users LIMIT 1)),

-- Mechanical Parts
(gen_random_uuid(), 'BEAR-6204-2RS', '6204-2RS Deep Groove Ball Bearing', '6204 sealed ball bearing 20x47x14mm', 8.50, 4.25, 50, 10, 21, 10, 1.85, 1.85, 0.55, 2.8, 1.48, true, true, 'SKF', '6204-2RS1', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'SPRING-COMP-12', 'Compression Spring 12mm OD x 25mm', 'Compression spring 12mm OD x 25mm L', 1.75, 0.87, 100, 25, 14, 50, 1.0, 0.5, 0.5, 0.4, 0.25, true, true, 'Century Spring', 'C-684', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'SHAFT-8MM-100', '8mm Stainless Steel Rod - 100mm', '8mm diameter 316SS rod 100mm length', 4.50, 2.25, 80, 20, 7, 20, 3.94, 0.31, 0.31, 3.2, 0.76, true, true, 'Online Metals', '316SS-8MM-ROD', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'GEAR-20T-M1', '20 Tooth Gear Module 1.0', '20T spur gear module 1.0 bore 8mm', 12.50, 6.25, 25, 5, 28, 5, 0.87, 0.87, 0.4, 1.5, 0.24, true, true, 'Boston Gear', 'G20-M1-8', (SELECT id FROM auth.users LIMIT 1)),

-- Consumables & Chemicals
(gen_random_uuid(), 'GREASE-MARINE', 'Marine Grade Bearing Grease - 400g', 'Marine grade lithium complex grease tube', 15.50, 7.75, 40, 10, 14, 12, 6.0, 1.5, 1.5, 14.1, 13.5, true, true, 'Mobil', 'MOBIL-SHC100', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'THREAD-LOCK-MED', 'Medium Strength Threadlocker - 10ml', 'Blue threadlocker medium strength 10ml', 8.25, 4.12, 60, 15, 7, 20, 4.0, 0.8, 0.8, 0.7, 2.56, true, true, 'Loctite', 'LOCTITE-243', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'SILICONE-SEAL', 'RTV Silicone Sealant - Clear 85g', 'Clear RTV silicone sealant food grade', 6.75, 3.37, 35, 10, 10, 15, 6.5, 1.2, 1.2, 3.0, 9.36, true, true, '3M', '3M-732-CLEAR', (SELECT id FROM auth.users LIMIT 1)),

-- Electrical/Wire
(gen_random_uuid(), 'WIRE-16AWG-RED', '16 AWG Stranded Wire - Red (per foot)', '16 AWG stranded copper wire red THHN', 0.85, 0.42, 1000, 200, 7, 100, 12.0, 0.2, 0.2, 0.3, 0.48, true, true, 'Southwire', '16AWG-RED-THHN', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'WIRE-16AWG-BLK', '16 AWG Stranded Wire - Black (per foot)', '16 AWG stranded copper wire black THHN', 0.85, 0.42, 1000, 200, 7, 100, 12.0, 0.2, 0.2, 0.3, 0.48, true, true, 'Southwire', '16AWG-BLK-THHN', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'HEAT-SHRINK-6MM', '6mm Heat Shrink Tubing - Black (per foot)', '6mm diameter heat shrink 3:1 ratio black', 1.25, 0.62, 250, 50, 7, 50, 12.0, 0.24, 0.24, 0.1, 0.68, true, true, '3M', 'MDT-A-6-BLACK', (SELECT id FROM auth.users LIMIT 1)),

-- Sensors & Controls
(gen_random_uuid(), 'SENSOR-TEMP-DS18B20', 'DS18B20 Digital Temperature Sensor', 'DS18B20 1-wire digital temp sensor TO-92', 3.75, 1.87, 30, 10, 14, 10, 0.5, 0.2, 0.2, 0.02, 0.02, true, true, 'Maxim', 'DS18B20+', (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'SWITCH-MICRO', 'Micro Limit Switch - SPDT', 'Micro switch SPDT 15A 250VAC lever', 4.25, 2.12, 45, 15, 14, 20, 1.0, 0.6, 0.4, 0.5, 0.24, true, true, 'Honeywell', 'V15T16-CZ200A03', (SELECT id FROM auth.users LIMIT 1));

-- Insert 5 Assemblies
INSERT INTO public.assemblies (
  id, sku, sales_description, purchase_description, selling_price, unit_cost,
  quantity_on_hand, reorder_point, lead_time_days, dimension_l, dimension_w, dimension_h,
  weight_oz, volume_cubic_inches, eligible_for_distributor_discount, created_by
) VALUES
(gen_random_uuid(), 'ASSY-PSU-24V', '24V Power Supply Assembly - 5A Output', 'Complete 24VDC 5A power supply with connectors', 125.00, 75.00, 15, 5, 21, 6.0, 4.0, 2.5, 32.0, 60.0, true, (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'ASSY-CTRL-PANEL', 'Control Panel Assembly - HMI Interface', 'Complete control panel with display and switches', 285.00, 170.00, 8, 3, 28, 8.0, 6.0, 3.0, 48.0, 144.0, true, (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'ASSY-MOTOR-MOUNT', 'Motor Mount Assembly - Heavy Duty', 'Complete motor mounting bracket with bearings', 95.00, 57.00, 12, 4, 14, 5.0, 4.0, 3.0, 28.0, 60.0, true, (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'ASSY-SENSOR-PKG', 'Sensor Package Assembly - Environmental', 'Temperature and limit switch sensor package', 65.00, 39.00, 20, 6, 17, 3.0, 2.5, 1.5, 8.0, 11.25, true, (SELECT id FROM auth.users LIMIT 1)),
(gen_random_uuid(), 'ASSY-WIRE-HARNESS', 'Wire Harness Assembly - Main Power', 'Complete wire harness with connectors sealed', 45.00, 27.00, 25, 8, 10, 24.0, 2.0, 1.0, 12.0, 48.0, true, (SELECT id FROM auth.users LIMIT 1));

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