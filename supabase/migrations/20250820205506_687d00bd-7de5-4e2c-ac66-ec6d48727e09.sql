-- Fix company data: separate name and address properly
UPDATE public.companies 
SET 
  name = 'Ramon Flores',
  address = '1501 Oakwood Drive, Elko, NV 89801',
  billing_address = '1501 Oakwood Drive, Elko, NV 89801'
WHERE name LIKE '%Ramon Flore%' AND name LIKE '%1501 Oakwood Drive%';