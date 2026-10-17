-- Update existing TTM calculation cron job to 12:05 AM Mountain Time (7:05 AM UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'daily-ttm-calculation'),
  schedule => '5 7 * * *'
);

-- Add new cron job for daily reorder calculation at 12:15 AM Mountain Time (7:15 AM UTC)
SELECT cron.schedule(
  'daily-reorder-calculation',
  '15 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-reorder-calculation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  ) as request_id;
  $$
);