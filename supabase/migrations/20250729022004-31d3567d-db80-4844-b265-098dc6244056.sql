-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to check for expiring sales tax licenses daily at 9 AM
SELECT cron.schedule(
  'check-license-expiration-daily',
  '0 9 * * *', -- Daily at 9 AM
  $$
  select
    net.http_post(
        url:='https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/check-license-expiration',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
        body:=concat('{"scheduled": true, "time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);