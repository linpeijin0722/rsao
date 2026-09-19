begin;

alter table public.booking_system_settings
  add column if not exists bank_account_key text not null default 'cathay';

alter table public.booking_system_settings
  drop constraint if exists booking_system_settings_bank_account_key_check;

alter table public.booking_system_settings
  add constraint booking_system_settings_bank_account_key_check
  check (bank_account_key in ('cathay','esun'));

update public.booking_system_settings
set bank_account_key='cathay', updated_at=now()
where id=true and bank_account_key not in ('cathay','esun');

commit;
