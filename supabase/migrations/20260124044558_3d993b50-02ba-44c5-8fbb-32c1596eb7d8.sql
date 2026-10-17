-- Add MDT morning cron job (7 AM UTC = 1 AM MDT)
SELECT cron.schedule(
  'reorder-calculation-morning-mdt',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-reorder-calculation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{"run": "morning-mdt"}'::jsonb
  ) AS request_id;
  $$
);

-- Add MDT afternoon cron job (7 PM UTC = 1 PM MDT)
SELECT cron.schedule(
  'reorder-calculation-afternoon-mdt',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pnawosyjmvibwjpegnrs.supabase.co/functions/v1/daily-reorder-calculation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYXdvc3lqbXZpYndqcGVnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTIxNjcsImV4cCI6MjA2OTAyODE2N30.cBRANpDw9YREzYLjC49i-Dw8hOERLPdtEtYdLYvkIOA"}'::jsonb,
    body := '{"run": "afternoon-mdt"}'::jsonb
  ) AS request_id;
  $$
);