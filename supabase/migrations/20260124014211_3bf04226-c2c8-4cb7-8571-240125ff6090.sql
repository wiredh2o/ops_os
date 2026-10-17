-- =============================================
-- PHASE 1: Update ATS triggers to allow negative values
-- =============================================

-- Update inventory availability trigger to allow negative ATS
CREATE OR REPLACE FUNCTION update_inventory_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow negative ATS to show backorder magnitude
  NEW.quantity_ats := NEW.quantity_on_hand - NEW.quantity_allocated;
  -- Keep ATP clamped to 0 (can't promise negative inventory)
  NEW.quantity_atp := GREATEST(NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update assembly availability trigger to allow negative ATS
CREATE OR REPLACE FUNCTION update_assembly_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow negative ATS to show backorder magnitude
  NEW.quantity_ats := NEW.quantity_on_hand - NEW.quantity_allocated;
  -- Keep ATP clamped to 0
  NEW.quantity_atp := GREATEST(NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- PHASE 2: Create backorder visibility views
-- =============================================

-- View: Backordered inventory items with resolution status
CREATE OR REPLACE VIEW backordered_inventory_items AS
SELECT 
  id,
  sku,
  sales_description,
  quantity_on_hand,
  quantity_allocated,
  quantity_on_order,
  quantity_ats,
  ABS(quantity_ats) as shortage_quantity,
  CASE 
    WHEN quantity_on_order >= ABS(quantity_ats) THEN 'PO_COVERS_SHORTAGE'
    ELSE 'NEEDS_ORDER'
  END as resolution_status
FROM inventory_items
WHERE quantity_ats < 0
ORDER BY quantity_ats ASC;

-- View: Backordered assemblies
CREATE OR REPLACE VIEW backordered_assemblies AS
SELECT 
  id,
  sku,
  sales_description,
  quantity_on_hand,
  quantity_allocated,
  quantity_on_order,
  quantity_ats,
  ABS(quantity_ats) as shortage_quantity,
  CASE 
    WHEN quantity_on_order >= ABS(quantity_ats) THEN 'PROD_ORDER_COVERS_SHORTAGE'
    ELSE 'NEEDS_ORDER'
  END as resolution_status
FROM assemblies
WHERE quantity_ats < 0
ORDER BY quantity_ats ASC;

-- View: Orders waiting on stock (blocked by inventory shortages)
CREATE OR REPLACE VIEW orders_awaiting_stock AS
SELECT DISTINCT
  po.id,
  po.order_number,
  po.customer_name,
  po.created_at,
  po.status,
  (CURRENT_DATE - po.created_at::date) as days_waiting,
  (
    SELECT COUNT(*)
    FROM production_order_items poi2
    LEFT JOIN inventory_items ii2 ON poi2.inventory_item_id = ii2.id
    LEFT JOIN assemblies a2 ON poi2.assembly_id = a2.id
    WHERE poi2.production_order_id = po.id
      AND (COALESCE(ii2.quantity_ats, 0) < 0 OR COALESCE(a2.quantity_ats, 0) < 0)
  ) as blocked_item_count
FROM production_orders po
JOIN production_order_items poi ON poi.production_order_id = po.id
LEFT JOIN inventory_items ii ON poi.inventory_item_id = ii.id
LEFT JOIN assemblies a ON poi.assembly_id = a.id
WHERE po.status NOT IN ('shipped', 'cancelled', 'completed')
  AND (COALESCE(ii.quantity_ats, 0) < 0 OR COALESCE(a.quantity_ats, 0) < 0)
ORDER BY po.created_at ASC;

-- =============================================
-- PHASE 3: Update cron schedule to twice daily
-- =============================================

-- Remove existing daily-reorder-calculation job if it exists
SELECT cron.unschedule('daily-reorder-calculation');

-- Add morning run: 1:00 AM Mountain Time = 8:00 AM UTC
SELECT cron.schedule(
  'reorder-calculation-morning',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-reorder-calculation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{"scheduled": true, "run": "morning"}'::jsonb
  ) as request_id;
  $$
);

-- Add afternoon run: 1:00 PM Mountain Time = 8:00 PM UTC
SELECT cron.schedule(
  'reorder-calculation-afternoon',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-reorder-calculation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{"scheduled": true, "run": "afternoon"}'::jsonb
  ) as request_id;
  $$
);