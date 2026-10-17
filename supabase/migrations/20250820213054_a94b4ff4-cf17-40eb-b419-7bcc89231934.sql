-- Rename contact_person to owners_name in companies table for customer portion
ALTER TABLE public.companies RENAME COLUMN contact_person TO owners_name;