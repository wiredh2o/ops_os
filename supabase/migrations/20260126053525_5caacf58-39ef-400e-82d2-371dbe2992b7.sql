-- Add vendor API configuration to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS api_integration_type TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS api_customer_id TEXT,
ADD COLUMN IF NOT EXISTS api_config JSONB DEFAULT '{}'::jsonb;

-- Add vendor tracking and shipment token columns to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS shipment_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS shipment_token_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vendor_order_id TEXT,
ADD COLUMN IF NOT EXISTS vendor_order_status TEXT,
ADD COLUMN IF NOT EXISTS vendor_tracking_number TEXT,
ADD COLUMN IF NOT EXISTS vendor_tracking_carrier TEXT,
ADD COLUMN IF NOT EXISTS vendor_shipped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vendor_delivery_status TEXT DEFAULT 'awaiting_shipment',
ADD COLUMN IF NOT EXISTS vendor_delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_drop_ship BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS drop_ship_customer_order_id UUID REFERENCES public.customer_orders(id),
ADD COLUMN IF NOT EXISTS drop_ship_company_id UUID REFERENCES public.companies(id),
ADD COLUMN IF NOT EXISTS drop_ship_address_snapshot JSONB;

-- Add drop-ship tracking to customer_order_items
ALTER TABLE public.customer_order_items
ADD COLUMN IF NOT EXISTS fulfillment_method TEXT DEFAULT 'facility',
ADD COLUMN IF NOT EXISTS quantity_drop_shipped INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS drop_ship_purchase_order_id UUID REFERENCES public.purchase_orders(id);

-- Add source link to purchase_order_items for traceability
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS source_customer_order_item_id UUID REFERENCES public.customer_order_items(id);

-- Add vendor part number columns to inventory_items
ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS mouser_part_number TEXT,
ADD COLUMN IF NOT EXISTS digikey_part_number TEXT;

-- Create index for shipment token lookups (public portal)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_shipment_token ON public.purchase_orders(shipment_token);

-- Create index for vendor tracking status queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_delivery_status ON public.purchase_orders(vendor_delivery_status) 
WHERE vendor_delivery_status NOT IN ('delivered', 'cancelled');

-- Add comment for documentation
COMMENT ON COLUMN public.suppliers.api_integration_type IS 'Vendor API integration type: none, mouser, digikey, or manual (portal only)';
COMMENT ON COLUMN public.purchase_orders.shipment_token IS 'UUID token for vendor shipment portal magic link';
COMMENT ON COLUMN public.purchase_orders.vendor_order_id IS 'Order confirmation number from vendor API (Mouser/DigiKey)';
COMMENT ON COLUMN public.purchase_orders.is_drop_ship IS 'Whether this PO ships directly to customer instead of facility';