-- Step 1: Add supplier_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Step 2: Add sales_support role back to app_role enum
ALTER TYPE public.app_role ADD VALUE 'sales_support';