-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule FedEx tracking check every 15 minutes from 7am-8pm Central Time (13:00-01:00 UTC)
SELECT cron.schedule(
  'check-fedex-tracking',
  '0,15,30,45 13-23,0-1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/check-fedex-tracking',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);