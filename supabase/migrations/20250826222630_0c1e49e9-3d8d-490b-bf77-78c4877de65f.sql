-- Standardize dimensions for inventory optimization
-- Add standardized dimension columns to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN IF NOT EXISTS dimension_l NUMERIC,  -- Longest dimension
ADD COLUMN IF NOT EXISTS dimension_w NUMERIC,  -- Middle dimension  
ADD COLUMN IF NOT EXISTS dimension_h NUMERIC,  -- Smallest dimension
ADD COLUMN IF NOT EXISTS weight_oz NUMERIC,
ADD COLUMN IF NOT EXISTS volume_cubic_inches NUMERIC;

-- Rename existing dimension columns in inventory_items table
DO $$ 
BEGIN
    -- Check if old columns exist before renaming
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'width') THEN
        -- Create new columns
        ALTER TABLE public.inventory_items 
        ADD COLUMN IF NOT EXISTS dimension_l NUMERIC,
        ADD COLUMN IF NOT EXISTS dimension_w NUMERIC, 
        ADD COLUMN IF NOT EXISTS dimension_h NUMERIC;
        
        -- Migrate existing data by sorting dimensions (largest to smallest)
        UPDATE public.inventory_items 
        SET 
            dimension_l = GREATEST(COALESCE(width, 0), COALESCE(length, 0), COALESCE(depth, 0)),
            dimension_w = (
                SELECT val FROM (
                    SELECT COALESCE(width, 0) as val
                    UNION ALL SELECT COALESCE(length, 0)  
                    UNION ALL SELECT COALESCE(depth, 0)
                    ORDER BY val DESC
                    LIMIT 1 OFFSET 1
                ) subq
            ),
            dimension_h = LEAST(COALESCE(width, 0), COALESCE(length, 0), COALESCE(depth, 0))
        WHERE width IS NOT NULL OR length IS NOT NULL OR depth IS NOT NULL;
        
        -- Drop old columns after migration
        ALTER TABLE public.inventory_items 
        DROP COLUMN IF EXISTS width,
        DROP COLUMN IF EXISTS length, 
        DROP COLUMN IF EXISTS depth;
    END IF;
END $$;

-- Create box_sizes table for future optimization features
CREATE TABLE IF NOT EXISTS public.box_sizes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    dimension_l NUMERIC NOT NULL,  -- Internal longest dimension
    dimension_w NUMERIC NOT NULL,  -- Internal middle dimension
    dimension_h NUMERIC NOT NULL,  -- Internal smallest dimension
    max_weight_oz NUMERIC,         -- Maximum weight capacity
    cost_per_box NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    supplier TEXT,
    lead_time_days INTEGER DEFAULT 7,
    minimum_order_quantity INTEGER DEFAULT 1,
    created_by UUID NOT NULL DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT box_sizes_dimensions_positive CHECK (
        dimension_l > 0 AND dimension_w > 0 AND dimension_h > 0
    ),
    CONSTRAINT box_sizes_dimensions_ordered CHECK (
        dimension_l >= dimension_w AND dimension_w >= dimension_h
    )
);

-- Enable RLS on box_sizes
ALTER TABLE public.box_sizes ENABLE ROW LEVEL SECURITY;

-- Create policies for box_sizes
CREATE POLICY "Box sizes viewable by authenticated users" 
ON public.box_sizes FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Box sizes manageable by authenticated users" 
ON public.box_sizes FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);