begin;

alter table public.booking_system_settings
  add column if not exists payment_mode text not null default 'bank_transfer',
  add column if not exists bank_name text not null default '國泰世華',
  add column if not exists bank_code text not null default '013',
  add column if not exists bank_account text not null default '218700524294',
  add column if not exists gateway_disabled_until timestamptz,
  add column if not exists gateway_failure_reason text;

alter table public.booking_system_settings drop constraint if exists booking_system_settings_payment_mode_check;
alter table public.booking_system_settings add constraint booking_system_settings_payment_mode_check
  check (payment_mode in ('auto','newebpay','bank_transfer'));

alter table public.bookings
  add column if not exists transfer_account_last5 text,
  add column if not exists transfer_reported_at timestamptz,
  add column if not exists transfer_time timestamptz,
  add column if not exists transfer_amount integer,
  add column if not exists transfer_status text;

alter table public.bookings drop constraint if exists bookings_transfer_status_check;
alter table public.bookings add constraint bookings_transfer_status_check
  check (transfer_status is null or transfer_status in ('reported','confirmed','rejected'));

insert into public.booking_system_settings(id,payment_mode,bank_name,bank_code,bank_account)
values(true,'bank_transfer','國泰世華','013','218700524294')
on conflict(id) do update set
  payment_mode=coalesce(public.booking_system_settings.payment_mode,'bank_transfer'),
  bank_name='國泰世華',bank_code='013',bank_account='218700524294';

commit;
