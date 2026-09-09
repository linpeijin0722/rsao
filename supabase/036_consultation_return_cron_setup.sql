-- 執行 035_consultation_return_schedules.sql 後，再設定以下兩個 Vault secrets：
-- rsao_site_url：正式網站網址，例如 https://rsao-virid.vercel.app
-- rsao_cron_secret：與 Vercel 環境變數 CRON_SECRET 完全相同
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$ begin
  perform cron.unschedule('send-scheduled-consultation-returns');
exception when others then null;
end $$;

select cron.schedule(
  'send-scheduled-consultation-returns',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rsao_site_url' limit 1)
      || '/api/cron/consultation-returns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rsao_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
