-- Phase 1: Fleet/Gift Card Range Tracking Schema

-- Add range columns to purchase_order_items
ALTER TABLE purchase_order_items 
  ADD COLUMN IF NOT EXISTS serial_range_start BIGINT,
  ADD COLUMN IF NOT EXISTS serial_range_end BIGINT;

-- Add range columns to customer_order_items
ALTER TABLE customer_order_items 
  ADD COLUMN IF NOT EXISTS serial_range_start BIGINT,
  ADD COLUMN IF NOT EXISTS serial_range_end BIGINT;

-- Create card_range_inventory table to track available card ranges
CREATE TABLE IF NOT EXISTS card_range_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  assembly_id UUID REFERENCES assemblies(id) ON DELETE CASCADE,
  range_start BIGINT NOT NULL,
  range_end BIGINT NOT NULL,
  source_po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  source_po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'partial', 'sold')),
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT card_range_inventory_item_check CHECK (
    (inventory_item_id IS NOT NULL AND assembly_id IS NULL) OR
    (inventory_item_id IS NULL AND assembly_id IS NOT NULL)
  ),
  CONSTRAINT card_range_inventory_range_valid CHECK (range_end >= range_start)
);

-- Create card_range_allocations table to track sold portions
CREATE TABLE IF NOT EXISTS card_range_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_range_inventory_id UUID NOT NULL REFERENCES card_range_inventory(id) ON DELETE CASCADE,
  allocation_start BIGINT NOT NULL,
  allocation_end BIGINT NOT NULL,
  customer_order_id UUID REFERENCES customer_orders(id) ON DELETE SET NULL,
  customer_order_item_id UUID REFERENCES customer_order_items(id) ON DELETE SET NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT card_range_allocations_range_valid CHECK (allocation_end >= allocation_start)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_card_range_inventory_item ON card_range_inventory(inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_range_inventory_assembly ON card_range_inventory(assembly_id) WHERE assembly_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_range_inventory_status ON card_range_inventory(status);
CREATE INDEX IF NOT EXISTS idx_card_range_inventory_ranges ON card_range_inventory(range_start, range_end);
CREATE INDEX IF NOT EXISTS idx_card_range_allocations_parent ON card_range_allocations(card_range_inventory_id);
CREATE INDEX IF NOT EXISTS idx_card_range_allocations_order ON card_range_allocations(customer_order_id);

-- Enable RLS on new tables
ALTER TABLE card_range_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_range_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies for card_range_inventory
CREATE POLICY "Card range inventory viewable by authenticated users"
  ON card_range_inventory FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Card range inventory manageable by authenticated users"
  ON card_range_inventory FOR ALL
  USING (auth.uid() IS NOT NULL);

-- RLS policies for card_range_allocations
CREATE POLICY "Card range allocations viewable by authenticated users"
  ON card_range_allocations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Card range allocations manageable by authenticated users"
  ON card_range_allocations FOR ALL
  USING (auth.uid() IS NOT NULL);