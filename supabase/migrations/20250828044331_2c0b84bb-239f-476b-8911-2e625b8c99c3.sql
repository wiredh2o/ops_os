-- Add sales_description and purchase_description columns to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN sales_description text,
ADD COLUMN purchase_description text;

-- Update existing assemblies to populate the new fields from the old description field
UPDATE public.assemblies 
SET sales_description = description,
    purchase_description = description
WHERE description IS NOT NULL;

-- Update dummy data with more specific descriptions
UPDATE public.assemblies 
SET 
  sales_description = CASE 
    WHEN sku = 'ASM-PUMP-001' THEN 'High-Performance Water Pump Assembly - Complete unit ready for installation'
    WHEN sku = 'ASM-MOTOR-001' THEN 'Premium Electric Motor Assembly - Industrial grade with extended warranty'
    WHEN sku = 'ASM-VALVE-001' THEN 'Professional Control Valve Assembly - Precision engineered for optimal flow control'
    WHEN sku = 'ASM-FILTER-001' THEN 'Advanced Filtration Assembly - Multi-stage filtration for maximum efficiency'
    WHEN sku = 'ASM-BRACKET-001' THEN 'Universal Mounting Bracket Assembly - Heavy-duty steel construction'
    WHEN sku = 'ASM-SENSOR-001' THEN 'Smart Sensor Assembly - Real-time monitoring with digital display'
    WHEN sku = 'ASM-CONTROLLER-001' THEN 'Intelligent Control Assembly - Programmable automation system'
    WHEN sku = 'ASM-HOUSING-001' THEN 'Protective Housing Assembly - Weather-resistant enclosure system'
    WHEN sku = 'SUB-GEAR-001' THEN 'Precision Gear Subassembly - High-torque transmission component'
    WHEN sku = 'SUB-BEARING-001' THEN 'Premium Bearing Subassembly - Long-life sealed bearing unit'
    ELSE sales_description
  END,
  purchase_description = CASE 
    WHEN sku = 'ASM-PUMP-001' THEN 'Water pump assembly kit with impeller, housing, and mounting hardware'
    WHEN sku = 'ASM-MOTOR-001' THEN 'Electric motor assembly - 3HP, 240V, includes starter and wiring harness'
    WHEN sku = 'ASM-VALVE-001' THEN 'Control valve assembly with actuator, position feedback, and control module'
    WHEN sku = 'ASM-FILTER-001' THEN 'Multi-stage filter assembly with replaceable cartridges and bypass valve'
    WHEN sku = 'ASM-BRACKET-001' THEN 'Steel mounting bracket assembly with hardware and installation template'
    WHEN sku = 'ASM-SENSOR-001' THEN 'Digital sensor assembly with display unit, cables, and calibration kit'
    WHEN sku = 'ASM-CONTROLLER-001' THEN 'PLC controller assembly with I/O modules and programming cable'
    WHEN sku = 'ASM-HOUSING-001' THEN 'Weather-resistant housing assembly with gaskets and mounting plate'
    WHEN sku = 'SUB-GEAR-001' THEN 'Gear reduction subassembly - 10:1 ratio with input/output shafts'
    WHEN sku = 'SUB-BEARING-001' THEN 'Sealed bearing subassembly with mounting collar and retention ring'
    ELSE purchase_description
  END
WHERE sku IN ('ASM-PUMP-001', 'ASM-MOTOR-001', 'ASM-VALVE-001', 'ASM-FILTER-001', 'ASM-BRACKET-001', 'ASM-SENSOR-001', 'ASM-CONTROLLER-001', 'ASM-HOUSING-001', 'SUB-GEAR-001', 'SUB-BEARING-001');