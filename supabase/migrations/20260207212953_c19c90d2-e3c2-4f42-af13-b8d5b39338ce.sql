-- Migrate packing paper data from system_settings to packing_papers table
INSERT INTO public.packing_papers (
  name,
  width_inches,
  weight_oz_per_foot,
  cost_per_foot,
  shipping_cost_multiplier,
  supplier,
  is_active,
  created_by
) VALUES (
  'Kraft Paper 24"',
  24,
  0.03,
  0.0413,
  1.68,
  NULL,
  true,
  '13a16401-8308-4499-b849-4ce57ee09c1c'
);