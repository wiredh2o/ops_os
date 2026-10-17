-- =============================================
-- SERIAL NUMBER TRACKING & DROP-SHIP SYSTEM
-- Phase 1: Database Foundation
-- =============================================

-- 1. Add structured shipping address columns to suppliers for rate calculation
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_state TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US';

-- 2. Add serial tracking columns to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS serial_tracking_type TEXT DEFAULT 'none';
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_serial_tracking_type_check 
  CHECK (serial_tracking_type IN ('none', 'manual', 'auto_date'));
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS serial_prefix TEXT;

-- 3. Add serial tracking columns to assemblies
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS serial_tracking_type TEXT DEFAULT 'none';
ALTER TABLE assemblies ADD CONSTRAINT assemblies_serial_tracking_type_check 
  CHECK (serial_tracking_type IN ('none', 'manual', 'auto_date'));
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS serial_prefix TEXT;

-- 4. Add serial columns to customer_order_items
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS requested_serial TEXT;
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS serial_pending BOOLEAN DEFAULT FALSE;
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS actual_serial TEXT;

-- 5. Create serialized_inventory table
CREATE TABLE IF NOT EXISTS serialized_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  assembly_id UUID REFERENCES assemblies(id) ON DELETE SET NULL,
  serial_number TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'allocated', 'sold')),
  source_po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  allocated_to_order_id UUID REFERENCES customer_orders(id) ON DELETE SET NULL,
  allocated_to_order_item_id UUID REFERENCES customer_order_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for serial number lookups
CREATE INDEX IF NOT EXISTS idx_serialized_inventory_serial_number ON serialized_inventory(serial_number);
CREATE INDEX IF NOT EXISTS idx_serialized_inventory_status ON serialized_inventory(status);
CREATE INDEX IF NOT EXISTS idx_serialized_inventory_inventory_item ON serialized_inventory(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_serialized_inventory_assembly ON serialized_inventory(assembly_id);

-- Enable RLS on serialized_inventory
ALTER TABLE serialized_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view serialized_inventory"
  ON serialized_inventory FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert serialized_inventory"
  ON serialized_inventory FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update serialized_inventory"
  ON serialized_inventory FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete serialized_inventory"
  ON serialized_inventory FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 6. Create order_item_serials table
CREATE TABLE IF NOT EXISTS order_item_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_item_id UUID REFERENCES production_order_items(id) ON DELETE SET NULL,
  customer_order_item_id UUID REFERENCES customer_order_items(id) ON DELETE SET NULL,
  serial_number TEXT NOT NULL,
  serial_type TEXT NOT NULL CHECK (serial_type IN ('manual', 'auto_date')),
  serialized_inventory_id UUID REFERENCES serialized_inventory(id) ON DELETE SET NULL,
  assigned_by UUID,
  initials TEXT,
  label_printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for order_item_serials
CREATE INDEX IF NOT EXISTS idx_order_item_serials_serial_number ON order_item_serials(serial_number);
CREATE INDEX IF NOT EXISTS idx_order_item_serials_production_order_item ON order_item_serials(production_order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_serials_customer_order_item ON order_item_serials(customer_order_item_id);

-- Enable RLS on order_item_serials
ALTER TABLE order_item_serials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order_item_serials"
  ON order_item_serials FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert order_item_serials"
  ON order_item_serials FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update order_item_serials"
  ON order_item_serials FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete order_item_serials"
  ON order_item_serials FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 7. Create serial_sequence_daily table for atomic sequence generation
CREATE TABLE IF NOT EXISTS serial_sequence_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix TEXT NOT NULL,
  date DATE NOT NULL,
  last_sequence INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prefix, date)
);

-- Enable RLS on serial_sequence_daily
ALTER TABLE serial_sequence_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view serial_sequence_daily"
  ON serial_sequence_daily FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert serial_sequence_daily"
  ON serial_sequence_daily FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update serial_sequence_daily"
  ON serial_sequence_daily FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 8. Create atomic sequence function
CREATE OR REPLACE FUNCTION get_next_serial_sequence(p_prefix TEXT, p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  INSERT INTO serial_sequence_daily (prefix, date, last_sequence)
  VALUES (p_prefix, p_date, 1)
  ON CONFLICT (prefix, date) 
  DO UPDATE SET last_sequence = serial_sequence_daily.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;
  
  RETURN v_sequence;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Add default_initials to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_initials TEXT;

-- 10. Create updated_at trigger for serialized_inventory
CREATE OR REPLACE FUNCTION update_serialized_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_serialized_inventory_updated_at ON serialized_inventory;
CREATE TRIGGER update_serialized_inventory_updated_at
  BEFORE UPDATE ON serialized_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_serialized_inventory_updated_at();