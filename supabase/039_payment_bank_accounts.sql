begin;

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

alter table public.booking_system_settings
  add column if not exists active_bank_account_id uuid references public.payment_bank_accounts(id) on delete set null;

insert into public.payment_bank_accounts(label,bank_name,bank_code,account_number,account_name,note)
select '常用收款帳號','國泰世華','013','218700524294','林珮均','目前使用帳號'
where not exists (select 1 from public.payment_bank_accounts);

update public.booking_system_settings
set active_bank_account_id=(select id from public.payment_bank_accounts order by created_at limit 1)
where id=true and active_bank_account_id is null;

commit;
