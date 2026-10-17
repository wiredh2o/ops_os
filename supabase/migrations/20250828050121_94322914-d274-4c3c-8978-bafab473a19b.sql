-- Clear existing inventory and assembly data for fresh start
DELETE FROM assembly_components;
DELETE FROM assembly_demand_events;
DELETE FROM assembly_shipment_history;
DELETE FROM inventory_order_history;
DELETE FROM demand_events;
DELETE FROM assemblies;
DELETE FROM inventory_items;