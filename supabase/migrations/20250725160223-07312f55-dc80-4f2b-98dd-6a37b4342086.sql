-- Create inventory_items table
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create assemblies table
CREATE TABLE public.assemblies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  markup_percentage NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create assembly_components table (junction table)
CREATE TABLE public.assembly_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id UUID NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assembly_id, inventory_item_id)
);

-- Add columns to production_order_items to support assemblies
ALTER TABLE public.production_order_items 
ADD COLUMN item_type TEXT NOT NULL DEFAULT 'custom',
ADD COLUMN assembly_id UUID REFERENCES public.assemblies(id),
ADD COLUMN inventory_item_id UUID REFERENCES public.inventory_items(id);

-- Enable RLS on new tables
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_components ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for inventory_items
CREATE POLICY "Inventory items viewable by authenticated users" 
ON public.inventory_items 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory items manageable by authenticated users" 
ON public.inventory_items 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create RLS policies for assemblies
CREATE POLICY "Assemblies viewable by authenticated users" 
ON public.assemblies 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assemblies manageable by authenticated users" 
ON public.assemblies 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create RLS policies for assembly_components
CREATE POLICY "Assembly components viewable by authenticated users" 
ON public.assembly_components 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly components manageable by authenticated users" 
ON public.assembly_components 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assemblies_updated_at
BEFORE UPDATE ON public.assemblies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assembly_components_updated_at
BEFORE UPDATE ON public.assembly_components
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to process inventory deduction for orders
CREATE OR REPLACE FUNCTION public.process_inventory_deduction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a new order item or quantity changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.quantity != NEW.quantity) THEN
    -- Calculate quantity difference for updates
    DECLARE
      qty_diff INTEGER := NEW.quantity;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        qty_diff := NEW.quantity - OLD.quantity;
      END IF;

      -- Process based on item type
      IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
        -- Direct inventory item deduction
        UPDATE public.inventory_items 
        SET quantity_on_hand = quantity_on_hand - qty_diff
        WHERE id = NEW.inventory_item_id;
      
      ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
        -- Assembly deduction - reduce all component items
        UPDATE public.inventory_items 
        SET quantity_on_hand = quantity_on_hand - (ac.quantity_needed * qty_diff)
        FROM public.assembly_components ac
        WHERE ac.assembly_id = NEW.assembly_id 
        AND public.inventory_items.id = ac.inventory_item_id;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate assembly cost based on components
CREATE OR REPLACE FUNCTION public.calculate_assembly_cost(assembly_id_param UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(ii.unit_price * ac.quantity_needed), 0)
  INTO total_cost
  FROM public.assembly_components ac
  JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
  WHERE ac.assembly_id = assembly_id_param;
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically deduct inventory when order items are added/updated
CREATE TRIGGER process_order_inventory_deduction
AFTER INSERT OR UPDATE ON public.production_order_items
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_deduction();

-- Create indexes for better performance
CREATE INDEX idx_inventory_items_sku ON public.inventory_items(sku);
CREATE INDEX idx_assemblies_sku ON public.assemblies(sku);
CREATE INDEX idx_assembly_components_assembly_id ON public.assembly_components(assembly_id);
CREATE INDEX idx_assembly_components_inventory_item_id ON public.assembly_components(inventory_item_id);
CREATE INDEX idx_production_order_items_assembly_id ON public.production_order_items(assembly_id);
CREATE INDEX idx_production_order_items_inventory_item_id ON public.production_order_items(inventory_item_id);