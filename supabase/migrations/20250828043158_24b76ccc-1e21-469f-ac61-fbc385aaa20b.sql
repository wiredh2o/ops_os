-- Enable required extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily TTM calculation to run at 2 AM UTC every day
SELECT cron.schedule(
  'daily-ttm-calculation',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-ttm-calculation',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
        body:='{"time": "' || now() || '"}'::jsonb
    ) as request_id;
  $$
);