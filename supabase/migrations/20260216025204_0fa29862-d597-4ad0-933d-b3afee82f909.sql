
-- Add packing step columns to customer_orders
ALTER TABLE public.customer_orders
  ADD COLUMN packing_mode text,
  ADD COLUMN selected_box_id uuid REFERENCES public.box_sizes(id),
  ADD COLUMN package_weight_oz numeric,
  ADD COLUMN package_length numeric,
  ADD COLUMN package_width numeric,
  ADD COLUMN package_height numeric,
  ADD COLUMN num_packages integer DEFAULT 1;
