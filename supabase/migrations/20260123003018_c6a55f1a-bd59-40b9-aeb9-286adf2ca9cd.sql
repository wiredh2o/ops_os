-- =====================================================
-- ORDER-TO-INVOICE DATABASE RESTRUCTURING
-- Phase 1-4: Create new tables and modify existing ones
-- =====================================================

-- =====================================================
-- PHASE 1: Create customer_orders table
-- Master orders from customers (what they requested)
-- =====================================================
CREATE TABLE public.customer_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    shipping_address_id TEXT, -- ID within customer's shipping_addresses JSONB
    
    -- Shipping preferences (set at order time)
    carrier_preference TEXT CHECK (carrier_preference IN ('fedex', 'ups', 'usps', 'cheapest')),
    signature_option TEXT DEFAULT 'none' CHECK (signature_option IN ('none', 'indirect', 'direct')),
    shipping_preference TEXT DEFAULT 'ship_complete' CHECK (shipping_preference IN ('ship_complete', 'ship_as_available')),
    estimated_shipping NUMERIC(10, 2) DEFAULT 0,
    
    -- Payment tracking for prepayment/e-commerce
    deposit_amount NUMERIC(10, 2) DEFAULT 0,
    deposit_paid BOOLEAN DEFAULT false,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'deposit_paid', 'paid', 'invoiced', 'refunded')),
    
    -- Stripe fields for prepayment
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    
    -- Order status
    order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled')),
    
    -- Source tracking for e-commerce
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ecommerce', 'phone', 'email')),
    
    -- Priority and scheduling
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    due_date DATE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- PHASE 2: Create customer_order_items table
-- Track what was ordered vs what has been invoiced
-- =====================================================
CREATE TABLE public.customer_order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_order_id UUID NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
    
    -- Item reference (one of these will be set)
    item_type TEXT NOT NULL CHECK (item_type IN ('inventory_item', 'assembly', 'labor')),
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    assembly_id UUID REFERENCES public.assemblies(id) ON DELETE RESTRICT,
    labor_item_id UUID REFERENCES public.labor_items(id) ON DELETE RESTRICT,
    
    -- Quantity tracking
    quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_invoiced INTEGER NOT NULL DEFAULT 0 CHECK (quantity_invoiced >= 0),
    
    -- Pricing locked at order time
    unit_price NUMERIC(10, 2) NOT NULL,
    
    -- UOM reference - can be either inventory or assembly sales UOM
    inventory_sales_uom_id UUID REFERENCES public.inventory_sales_uoms(id),
    assembly_sales_uom_id UUID REFERENCES public.assembly_sales_uoms(id),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraint: quantity_invoiced cannot exceed quantity_ordered
    CONSTRAINT quantity_invoiced_check CHECK (quantity_invoiced <= quantity_ordered),
    
    -- Constraint: exactly one item type must be set
    CONSTRAINT item_reference_check CHECK (
        (item_type = 'inventory_item' AND inventory_item_id IS NOT NULL AND assembly_id IS NULL AND labor_item_id IS NULL) OR
        (item_type = 'assembly' AND assembly_id IS NOT NULL AND inventory_item_id IS NULL AND labor_item_id IS NULL) OR
        (item_type = 'labor' AND labor_item_id IS NOT NULL AND inventory_item_id IS NULL AND assembly_id IS NULL)
    )
);

-- =====================================================
-- PHASE 3: Modify production_orders table
-- Add columns for invoice functionality
-- =====================================================
ALTER TABLE public.production_orders 
    ADD COLUMN IF NOT EXISTS parent_customer_order_id UUID REFERENCES public.customer_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS parent_repair_request_id UUID REFERENCES public.inbound_packages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS signature_option TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS carrier_preference TEXT;

-- Add check constraints separately to handle existing data
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_signature_option_check'
    ) THEN
        ALTER TABLE public.production_orders 
            ADD CONSTRAINT production_orders_signature_option_check 
            CHECK (signature_option IN ('none', 'indirect', 'direct'));
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_carrier_preference_check'
    ) THEN
        ALTER TABLE public.production_orders 
            ADD CONSTRAINT production_orders_carrier_preference_check 
            CHECK (carrier_preference IN ('fedex', 'ups', 'usps', 'cheapest'));
    END IF;
END $$;

-- =====================================================
-- PHASE 4: Modify production_order_items table
-- Add link to source order items for traceability
-- =====================================================
ALTER TABLE public.production_order_items 
    ADD COLUMN IF NOT EXISTS source_order_item_id UUID REFERENCES public.customer_order_items(id) ON DELETE SET NULL;

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX idx_customer_orders_customer ON public.customer_orders(customer_company_id);
CREATE INDEX idx_customer_orders_status ON public.customer_orders(order_status);
CREATE INDEX idx_customer_orders_payment_status ON public.customer_orders(payment_status);
CREATE INDEX idx_customer_orders_created_at ON public.customer_orders(created_at DESC);
CREATE INDEX idx_customer_order_items_order ON public.customer_order_items(customer_order_id);
CREATE INDEX idx_customer_order_items_inventory ON public.customer_order_items(inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX idx_customer_order_items_assembly ON public.customer_order_items(assembly_id) WHERE assembly_id IS NOT NULL;
CREATE INDEX idx_production_orders_parent_customer ON public.production_orders(parent_customer_order_id) WHERE parent_customer_order_id IS NOT NULL;
CREATE INDEX idx_production_orders_parent_repair ON public.production_orders(parent_repair_request_id) WHERE parent_repair_request_id IS NOT NULL;

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================
CREATE TRIGGER update_customer_orders_updated_at
    BEFORE UPDATE ON public.customer_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_order_items_updated_at
    BEFORE UPDATE ON public.customer_order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_order_items ENABLE ROW LEVEL SECURITY;

-- Customer orders policies
CREATE POLICY "Users can view customer orders"
    ON public.customer_orders FOR SELECT
    USING (true);

CREATE POLICY "Users can create customer orders"
    ON public.customer_orders FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update customer orders"
    ON public.customer_orders FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete customer orders"
    ON public.customer_orders FOR DELETE
    USING (true);

-- Customer order items policies
CREATE POLICY "Users can view customer order items"
    ON public.customer_order_items FOR SELECT
    USING (true);

CREATE POLICY "Users can create customer order items"
    ON public.customer_order_items FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update customer order items"
    ON public.customer_order_items FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete customer order items"
    ON public.customer_order_items FOR DELETE
    USING (true);

-- =====================================================
-- HELPER FUNCTION: Get remaining quantity for order item
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_order_item_remaining_quantity(order_item_id UUID)
RETURNS INTEGER AS $$
    SELECT quantity_ordered - quantity_invoiced
    FROM public.customer_order_items
    WHERE id = order_item_id;
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- HELPER FUNCTION: Update order status based on fulfillment
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_customer_order_fulfillment_status()
RETURNS TRIGGER AS $$
DECLARE
    total_ordered INTEGER;
    total_invoiced INTEGER;
    new_status TEXT;
BEGIN
    -- Calculate totals for the order
    SELECT 
        COALESCE(SUM(quantity_ordered), 0),
        COALESCE(SUM(quantity_invoiced), 0)
    INTO total_ordered, total_invoiced
    FROM public.customer_order_items
    WHERE customer_order_id = NEW.customer_order_id;
    
    -- Determine new status
    IF total_invoiced = 0 THEN
        new_status := 'processing';
    ELSIF total_invoiced < total_ordered THEN
        new_status := 'partially_fulfilled';
    ELSE
        new_status := 'fulfilled';
    END IF;
    
    -- Update the order status if it's not cancelled
    UPDATE public.customer_orders
    SET order_status = new_status, updated_at = now()
    WHERE id = NEW.customer_order_id
    AND order_status NOT IN ('cancelled', 'pending');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-update order status when items are invoiced
CREATE TRIGGER update_order_status_on_item_change
    AFTER UPDATE OF quantity_invoiced ON public.customer_order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_order_fulfillment_status();