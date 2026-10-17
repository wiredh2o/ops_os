-- Add supplier_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;