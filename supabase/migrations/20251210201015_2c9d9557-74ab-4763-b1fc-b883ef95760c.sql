-- Add is_active column to inventory_items table
ALTER TABLE public.inventory_items 
ADD COLUMN is_active boolean NOT NULL DEFAULT true;