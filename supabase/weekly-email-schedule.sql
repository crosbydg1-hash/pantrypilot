-- Schedules the weekly "3 dinners" email for every Sunday at 3pm UTC (10am US Eastern).
-- Run this ONLY after the weekly-email function is deployed and its secrets are set (see SETUP.md).
-- Before running, replace PASTE_YOUR_CRON_SECRET_HERE with the same CRON_SECRET you saved in Edge Functions → Secrets.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('pantrypilot-weekly-email') where exists (select 1 from cron.job where jobname = 'pantrypilot-weekly-email');
select cron.schedule(
  'pantrypilot-weekly-email',
  '0 15 * * 0',
  $$
  select net.http_post(
    url := 'https://lfamdwyzimihuchaojvv.supabase.co/functions/v1/weekly-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_YOUR_CRON_SECRET_HERE'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
