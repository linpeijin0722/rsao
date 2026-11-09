begin;

alter table public.bookings
  add column if not exists payment_provider text,
  add column if not exists payment_provider_trade_no text,
  add column if not exists payment_provider_type text,
  add column if not exists payment_notification_status text,
  add column if not exists payment_notification_error text,
  add column if not exists payment_notification_attempts integer not null default 0,
  add column if not exists payment_notification_last_attempt_at timestamptz,
  add column if not exists payment_notification_next_retry_at timestamptz;

create index if not exists bookings_payment_notification_retry_idx
  on public.bookings(payment_notification_status,payment_notification_next_retry_at)
  where payment_status='paid' and payment_notification_status in ('pending','failed');

comment on column public.bookings.payment_provider is 'newebpay for gateway payments; manual for fixed-account transfers';
comment on column public.bookings.payment_provider_type is 'Raw payment type returned by the payment provider';
comment on column public.bookings.payment_notification_status is 'pending, sent, failed, skipped';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$ begin
  perform cron.unschedule('retry-paid-booking-line-notifications');
exception when others then null;
end $$;

select cron.schedule(
  'retry-paid-booking-line-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='rsao_site_url' limit 1)
      || '/api/cron/payment-line-retries',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='rsao_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';
commit;
