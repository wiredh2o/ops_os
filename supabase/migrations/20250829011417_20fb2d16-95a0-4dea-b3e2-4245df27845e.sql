-- Set more realistic dummy packed dimension data for all inventory items and assemblies

-- Update inventory items with realistic packed dimensions (varied data)
UPDATE public.inventory_items 
SET 
  packed_dimension_l = CASE 
    WHEN id % 10 = 0 THEN 12.0   -- 10% get 12x8x6
    WHEN id % 10 = 1 THEN 10.0   -- 10% get 10x6x4  
    WHEN id % 10 = 2 THEN 8.0    -- 10% get 8x5x3
    WHEN id % 10 = 3 THEN 15.0   -- 10% get 15x10x8
    WHEN id % 10 = 4 THEN 6.0    -- 10% get 6x4x2
    WHEN id % 10 = 5 THEN 9.0    -- 10% get 9x7x5
    WHEN id % 10 = 6 THEN 14.0   -- 10% get 14x9x7
    WHEN id % 10 = 7 THEN 7.0    -- 10% get 7x5x3
    WHEN id % 10 = 8 THEN 11.0   -- 10% get 11x8x6
    ELSE 5.0                     -- 10% get 5x3x2
  END,
  packed_dimension_w = CASE 
    WHEN id % 10 = 0 THEN 8.0
    WHEN id % 10 = 1 THEN 6.0
    WHEN id % 10 = 2 THEN 5.0
    WHEN id % 10 = 3 THEN 10.0
    WHEN id % 10 = 4 THEN 4.0
    WHEN id % 10 = 5 THEN 7.0
    WHEN id % 10 = 6 THEN 9.0
    WHEN id % 10 = 7 THEN 5.0
    WHEN id % 10 = 8 THEN 8.0
    ELSE 3.0
  END,
  packed_dimension_h = CASE 
    WHEN id % 10 = 0 THEN 6.0
    WHEN id % 10 = 1 THEN 4.0
    WHEN id % 10 = 2 THEN 3.0
    WHEN id % 10 = 3 THEN 8.0
    WHEN id % 10 = 4 THEN 2.0
    WHEN id % 10 = 5 THEN 5.0
    WHEN id % 10 = 6 THEN 7.0
    WHEN id % 10 = 7 THEN 3.0
    WHEN id % 10 = 8 THEN 6.0
    ELSE 2.0
  END;

-- Update assemblies with realistic packed dimensions (generally larger than components)
UPDATE public.assemblies 
SET 
  packed_dimension_l = CASE 
    WHEN id % 8 = 0 THEN 20.0   -- 12.5% get 20x15x10
    WHEN id % 8 = 1 THEN 18.0   -- 12.5% get 18x12x8
    WHEN id % 8 = 2 THEN 16.0   -- 12.5% get 16x10x6
    WHEN id % 8 = 3 THEN 24.0   -- 12.5% get 24x18x12
    WHEN id % 8 = 4 THEN 14.0   -- 12.5% get 14x9x5
    WHEN id % 8 = 5 THEN 22.0   -- 12.5% get 22x16x11
    WHEN id % 8 = 6 THEN 12.0   -- 12.5% get 12x8x4
    ELSE 26.0                   -- 12.5% get 26x20x14
  END,
  packed_dimension_w = CASE 
    WHEN id % 8 = 0 THEN 15.0
    WHEN id % 8 = 1 THEN 12.0
    WHEN id % 8 = 2 THEN 10.0
    WHEN id % 8 = 3 THEN 18.0
    WHEN id % 8 = 4 THEN 9.0
    WHEN id % 8 = 5 THEN 16.0
    WHEN id % 8 = 6 THEN 8.0
    ELSE 20.0
  END,
  packed_dimension_h = CASE 
    WHEN id % 8 = 0 THEN 10.0
    WHEN id % 8 = 1 THEN 8.0
    WHEN id % 8 = 2 THEN 6.0
    WHEN id % 8 = 3 THEN 12.0
    WHEN id % 8 = 4 THEN 5.0
    WHEN id % 8 = 5 THEN 11.0
    WHEN id % 8 = 6 THEN 4.0
    ELSE 14.0
  END;