-- Update inventory reorder point calculation to include current inventory levels
-- Add functions to calculate net available inventory considering:
-- 1. Quantity on hand
-- 2. Quantity on order from suppliers (incoming)
-- 3. Quantity committed to customers (outgoing)

-- First, let's update the dynamic reorder point function to consider current inventory
CREATE OR REPLACE FUNCTION calculate_dynamic_reorder_point(
    item_id UUID,
    lead_time_days INTEGER,
    avg_daily_usage DECIMAL DEFAULT 0,
    usage_variance DECIMAL DEFAULT 0
) RETURNS DECIMAL AS $$
DECLARE
    safety_stock DECIMAL;
    base_reorder_point DECIMAL;
    current_on_hand DECIMAL;
    quantity_on_order DECIMAL;
    quantity_committed DECIMAL;
    net_available DECIMAL;
    adjusted_reorder_point DECIMAL;
BEGIN
    -- Get current inventory levels
    SELECT COALESCE(quantity_on_hand, 0), 
           COALESCE(quantity_on_order, 0),
           COALESCE(quantity_committed, 0)
    INTO current_on_hand, quantity_on_order, quantity_committed
    FROM inventory_items 
    WHERE id = item_id;
    
    -- Calculate net available inventory
    net_available := current_on_hand + quantity_on_order - quantity_committed;
    
    -- Calculate safety stock (using standard deviation approach)
    safety_stock := CASE 
        WHEN usage_variance > 0 THEN 
            1.65 * SQRT(lead_time_days) * SQRT(usage_variance)
        ELSE 
            avg_daily_usage * 0.2 * lead_time_days -- 20% buffer if no variance data
    END;
    
    -- Base reorder point = (average daily usage × lead time) + safety stock
    base_reorder_point := (avg_daily_usage * lead_time_days) + safety_stock;
    
    -- Adjust reorder point based on current inventory position
    -- If net available is negative, we need more inventory urgently
    adjusted_reorder_point := GREATEST(base_reorder_point - net_available, avg_daily_usage);
    
    RETURN adjusted_reorder_point;
END;
$$ LANGUAGE plpgsql;

-- Update assembly reorder point function similarly
CREATE OR REPLACE FUNCTION calculate_assembly_dynamic_reorder_point(
    assembly_id UUID,
    lead_time_days INTEGER,
    avg_daily_usage DECIMAL DEFAULT 0,
    usage_variance DECIMAL DEFAULT 0
) RETURNS DECIMAL AS $$
DECLARE
    safety_stock DECIMAL;
    base_reorder_point DECIMAL;
    current_on_hand DECIMAL;
    quantity_on_order DECIMAL;
    quantity_committed DECIMAL;
    net_available DECIMAL;
    adjusted_reorder_point DECIMAL;
BEGIN
    -- Get current assembly levels
    SELECT COALESCE(quantity_on_hand, 0), 
           COALESCE(quantity_on_order, 0),
           COALESCE(quantity_committed, 0)
    INTO current_on_hand, quantity_on_order, quantity_committed
    FROM assemblies 
    WHERE id = assembly_id;
    
    -- Calculate net available inventory
    net_available := current_on_hand + quantity_on_order - quantity_committed;
    
    -- Calculate safety stock
    safety_stock := CASE 
        WHEN usage_variance > 0 THEN 
            1.65 * SQRT(lead_time_days) * SQRT(usage_variance)
        ELSE 
            avg_daily_usage * 0.2 * lead_time_days
    END;
    
    -- Base reorder point calculation
    base_reorder_point := (avg_daily_usage * lead_time_days) + safety_stock;
    
    -- Adjust for current inventory position
    adjusted_reorder_point := GREATEST(base_reorder_point - net_available, avg_daily_usage);
    
    RETURN adjusted_reorder_point;
END;
$$ LANGUAGE plpgsql;

-- Add function to update committed quantities based on production orders
CREATE OR REPLACE FUNCTION update_committed_inventory() RETURNS void AS $$
BEGIN
    -- Update inventory items committed quantities
    UPDATE inventory_items 
    SET quantity_committed = COALESCE(committed.total_committed, 0)
    FROM (
        SELECT 
            pom.inventory_item_id,
            SUM(pom.quantity_required - COALESCE(pom.quantity_allocated, 0)) as total_committed
        FROM production_order_materials pom
        JOIN production_orders po ON pom.production_order_id = po.id
        WHERE po.status IN ('pending', 'in_progress', 'approved')
        GROUP BY pom.inventory_item_id
    ) as committed
    WHERE inventory_items.id = committed.inventory_item_id;
    
    -- Update assemblies committed quantities
    UPDATE assemblies 
    SET quantity_committed = COALESCE(committed.total_committed, 0)
    FROM (
        SELECT 
            po.assembly_id,
            SUM(po.quantity_to_produce - COALESCE(po.quantity_produced, 0)) as total_committed
        FROM production_orders po
        WHERE po.status IN ('pending', 'in_progress', 'approved')
        AND po.assembly_id IS NOT NULL
        GROUP BY po.assembly_id
    ) as committed
    WHERE assemblies.id = committed.assembly_id;
END;
$$ LANGUAGE plpgsql;