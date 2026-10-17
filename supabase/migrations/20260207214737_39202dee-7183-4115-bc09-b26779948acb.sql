-- Create packing_bags table
CREATE TABLE IF NOT EXISTS public.packing_bags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  length_inches numeric NOT NULL,
  width_inches numeric NOT NULL,
  cost_per_bag numeric NOT NULL DEFAULT 0,
  shipping_cost_multiplier numeric NOT NULL DEFAULT 1,
  supplier text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.packing_bags ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view packing_bags"
  ON public.packing_bags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert packing_bags"
  ON public.packing_bags FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update packing_bags"
  ON public.packing_bags FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete packing_bags"
  ON public.packing_bags FOR DELETE
  TO authenticated
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_packing_bags_updated_at
  BEFORE UPDATE ON public.packing_bags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();