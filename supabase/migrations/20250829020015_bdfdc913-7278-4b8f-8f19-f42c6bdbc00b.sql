-- Also update assemblies with the same fix
UPDATE public.assemblies 
SET volume_cubic_inches = dimension_l * dimension_w * dimension_h,
    packed_volume_cubic_inches = CASE 
      WHEN packed_dimension_l IS NOT NULL AND packed_dimension_w IS NOT NULL AND packed_dimension_h IS NOT NULL
      THEN packed_dimension_l * packed_dimension_w * packed_dimension_h
      ELSE NULL
    END
WHERE dimension_l IS NOT NULL AND dimension_w IS NOT NULL AND dimension_h IS NOT NULL;