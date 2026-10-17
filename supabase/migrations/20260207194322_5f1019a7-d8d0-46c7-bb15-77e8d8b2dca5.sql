-- Add shipping cost multiplier to box_sizes table
-- This allows accounting for the cost of shipping boxes to the facility
ALTER TABLE public.box_sizes 
ADD COLUMN shipping_cost_multiplier numeric DEFAULT 1.0 NOT NULL;