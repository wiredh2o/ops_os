-- Phase 1: Enhanced Database Schema for Purchase Order System

-- Add order_type enum
CREATE TYPE order_type AS ENUM ('customer', 'assembly_build');

-- Add quantity tracking fields to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN quantity_allocated integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_available integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_on_order integer DEFAULT 0 NOT NULL;

-- Add quantity tracking and reorder point to assemblies
ALTER TABLE public.assemblies 
ADD COLUMN quantity_on_hand integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_allocated integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_on_order integer DEFAULT 0 NOT NULL,
ADD COLUMN reorder_point integer DEFAULT 0 NOT NULL;

-- Add order_type to production_orders
ALTER TABLE public.production_orders 
ADD COLUMN order_type order_type DEFAULT 'customer' NOT NULL;

-- Create suppliers table
CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  tax_id text,
  payment_terms text,
  lead_time_days integer DEFAULT 14,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create purchase_orders table
CREATE TABLE public.purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  order_date date DEFAULT CURRENT_DATE NOT NULL,
  expected_delivery_date date,
  actual_delivery_date date,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_amount numeric DEFAULT 0 NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);

-- Create purchase_order_items table (can reference both inventory_items AND assemblies)
CREATE TABLE public.purchase_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id uuid NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('inventory_item', 'assembly')),
  inventory_item_id uuid,
  assembly_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  quantity_received integer DEFAULT 0 NOT NULL,
  quantity_remaining integer NOT NULL DEFAULT 0,
  status text DEFAULT 'pending' NOT NULL,
  expected_date date,
  actual_received_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT purchase_order_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id),
  CONSTRAINT purchase_order_items_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES public.assemblies(id),
  CONSTRAINT purchase_order_items_item_reference_check CHECK (
    (item_type = 'inventory_item' AND inventory_item_id IS NOT NULL AND assembly_id IS NULL) OR
    (item_type = 'assembly' AND assembly_id IS NOT NULL AND inventory_item_id IS NULL)
  )
);

-- Enable RLS on new tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for suppliers
CREATE POLICY "Suppliers viewable by authenticated users" 
ON public.suppliers FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Suppliers manageable by authenticated users" 
ON public.suppliers FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create RLS policies for purchase_orders
CREATE POLICY "Purchase orders viewable by authenticated users" 
ON public.purchase_orders FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Purchase orders manageable by authenticated users" 
ON public.purchase_orders FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create RLS policies for purchase_order_items
CREATE POLICY "Purchase order items viewable by authenticated users" 
ON public.purchase_order_items FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Purchase order items manageable by authenticated users" 
ON public.purchase_order_items FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create function to update quantity_available for inventory_items
CREATE OR REPLACE FUNCTION public.update_inventory_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated
  NEW.quantity_available := NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated;
  RETURN NEW;
END;
$function$;

-- Create function to update quantity_available for assemblies
CREATE OR REPLACE FUNCTION public.update_assembly_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated
  NEW.quantity_available := NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated;
  RETURN NEW;
END;
$function$;

-- Create function to update purchase order totals
CREATE OR REPLACE FUNCTION public.update_purchase_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  po_subtotal numeric := 0;
BEGIN
  -- Calculate subtotal from all items
  SELECT COALESCE(SUM(total_cost), 0)
  INTO po_subtotal
  FROM public.purchase_order_items
  WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  -- Update purchase order with new subtotal and total
  UPDATE public.purchase_orders
  SET 
    subtotal = po_subtotal,
    total_amount = po_subtotal + tax_amount,
    updated_at = now()
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Create function to handle purchase order item quantity calculations
CREATE OR REPLACE FUNCTION public.handle_purchase_order_item_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Calculate total_cost
    NEW.total_cost := NEW.quantity * NEW.unit_cost;
    
    -- Calculate quantity_remaining
    NEW.quantity_remaining := NEW.quantity - NEW.quantity_received;
    
    -- Update quantity_on_order for the referenced item
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      -- Calculate difference for updates
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.inventory_items
        SET quantity_on_order = quantity_on_order - OLD.quantity + NEW.quantity
        WHERE id = NEW.inventory_item_id;
      ELSE
        UPDATE public.inventory_items
        SET quantity_on_order = quantity_on_order + NEW.quantity
        WHERE id = NEW.inventory_item_id;
      END IF;
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Calculate difference for updates
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.assemblies
        SET quantity_on_order = quantity_on_order - OLD.quantity + NEW.quantity
        WHERE id = NEW.assembly_id;
      ELSE
        UPDATE public.assemblies
        SET quantity_on_order = quantity_on_order + NEW.quantity
        WHERE id = NEW.assembly_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reduce quantity_on_order
    IF OLD.item_type = 'inventory_item' AND OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items
      SET quantity_on_order = quantity_on_order - OLD.quantity
      WHERE id = OLD.inventory_item_id;
    ELSIF OLD.item_type = 'assembly' AND OLD.assembly_id IS NOT NULL THEN
      UPDATE public.assemblies
      SET quantity_on_order = quantity_on_order - OLD.quantity
      WHERE id = OLD.assembly_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- Create triggers for inventory_items availability calculation
CREATE TRIGGER update_inventory_availability_trigger
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_availability();

-- Create triggers for assemblies availability calculation
CREATE TRIGGER update_assembly_availability_trigger
  BEFORE INSERT OR UPDATE ON public.assemblies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_assembly_availability();

-- Create triggers for purchase order items
CREATE TRIGGER handle_purchase_order_item_changes_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_order_item_changes();

-- Create triggers for purchase order totals
CREATE TRIGGER update_purchase_order_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_purchase_order_totals();

-- Create trigger for updated_at on suppliers
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on purchase_orders  
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on purchase_order_items
CREATE TRIGGER update_purchase_order_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update existing inventory_items to set initial quantity_available
UPDATE public.inventory_items 
SET quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated;

-- Update existing assemblies to set initial quantity_available (they don't have quantity_on_hand yet, so it will be 0)
UPDATE public.assemblies 
SET quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated;