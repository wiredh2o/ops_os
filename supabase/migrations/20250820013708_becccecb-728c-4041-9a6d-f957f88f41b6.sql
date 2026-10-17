-- Update existing package statuses from 'unboxed' to 'opened'
UPDATE public.inbound_packages 
SET status = 'opened' 
WHERE status = 'unboxed';