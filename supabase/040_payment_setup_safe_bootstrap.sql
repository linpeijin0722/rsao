begin;

create table if not exists public.booking_system_settings (
  id boolean primary key default true check (id = true),
  video_booking_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.payment_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  bank_name text not null,
  bank_code text not null,
  account_number text not null,
  account_name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_bank_accounts enable row level security;

alter table public.booking_system_settings
  add column if not exists active_bank_account_id uuid references public.payment_bank_accounts(id) on delete set null;

insert into public.booking_system_settings(id,payment_mode,bank_name,bank_code,bank_account)
values(true,'bank_transfer','國泰世華','013','218700524294')
on conflict(id) do nothing;

insert into public.payment_bank_accounts(label,bank_name,bank_code,account_number,account_name,note)
select '常用收款帳號','國泰世華','013','218700524294','林珮均','目前使用帳號'
where not exists (select 1 from public.payment_bank_accounts);

update public.booking_system_settings
set active_bank_account_id=(select id from public.payment_bank_accounts order by created_at limit 1),
    updated_at=now()
where id=true and active_bank_account_id is null;

commit;
