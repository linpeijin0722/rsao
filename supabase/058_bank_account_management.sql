begin;
alter table public.booking_system_settings drop constraint if exists booking_system_settings_bank_account_key_check;
insert into public.booking_system_settings(id) values(true) on conflict do nothing;
create table if not exists public.bank_accounts(
 id text primary key,label text not null,bank_name text not null,bank_code text not null,branch_name text not null default '',
 account_number text not null,account_name text not null,note text not null default '',archived boolean not null default false,updated_at timestamptz not null default now()
);
insert into public.bank_accounts(id,label,bank_name,bank_code,branch_name,account_number,account_name) values
 ('cathay','國泰世華常用帳號','國泰世華','013','營業部','218700524294','林珮均'),
 ('esun','玉山銀行公司帳號','玉山銀行','808','林口分行','0886940043636','林阿嫂有限公司') on conflict do nothing;
create table if not exists public.bank_account_audit(id uuid primary key default gen_random_uuid(),action text not null,account_id text,previous_data jsonb,new_data jsonb,created_at timestamptz not null default now());
create table if not exists public.bank_password_guard(id boolean primary key default true check(id),failures integer not null default 0,locked_until timestamptz);
insert into public.bank_password_guard(id) values(true) on conflict do nothing;
alter table public.bookings add column if not exists bank_account_snapshot jsonb;
create or replace function public.capture_booking_bank_account() returns trigger language plpgsql set search_path=public as $$
begin
 if new.bank_account_snapshot is null then
  select to_jsonb(a) into new.bank_account_snapshot from public.bank_accounts a join public.booking_system_settings s on s.id=true and a.id=coalesce(s.bank_account_key,'cathay') where not a.archived;
  if new.bank_account_snapshot is null then raise exception '未設定有效收款帳號';end if;
 end if;
 return new;
end $$;
drop trigger if exists capture_booking_bank_account on public.bookings;
create trigger capture_booking_bank_account before insert on public.bookings for each row execute function public.capture_booking_bank_account();
update public.bookings b set bank_account_snapshot=to_jsonb(a) from public.bank_accounts a,public.booking_system_settings s where s.id=true and a.id=coalesce(s.bank_account_key,'cathay') and b.bank_account_snapshot is null;
create or replace function public.bank_password_attempt(p_correct boolean) returns boolean language plpgsql set search_path=public as $$
declare g public.bank_password_guard%rowtype;
begin
 select * into g from public.bank_password_guard where id=true for update;
 if g.locked_until>now() then return false;end if;
 if p_correct then update public.bank_password_guard set failures=0,locked_until=null where id=true;return true;end if;
 update public.bank_password_guard set failures=case when g.locked_until is not null then 1 else g.failures+1 end,locked_until=case when g.locked_until is null and g.failures+1>=5 then now()+interval '10 minutes' else null end where id=true;
 return false;
end $$;
create or replace function public.mutate_bank_account(p_action text,p_account jsonb) returns jsonb language plpgsql set search_path=public as $$
declare account_id text:=p_account->>'id';previous jsonb;result jsonb;selected text;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank-account-management',0));
 select bank_account_key into selected from public.booking_system_settings where id=true for update;
 select to_jsonb(a) into previous from public.bank_accounts a where id=account_id and not archived;
 if p_action='save' then
  if account_id is not null and previous is null then raise exception '找不到這組帳號';end if;
  account_id:=coalesce(account_id,'manual_'||gen_random_uuid()::text);
  insert into public.bank_accounts(id,label,bank_name,bank_code,branch_name,account_number,account_name,note) values(account_id,p_account->>'label',p_account->>'bank_name',p_account->>'bank_code',coalesce(p_account->>'branch_name',''),p_account->>'account_number',p_account->>'account_name',coalesce(p_account->>'note',''))
  on conflict(id) do update set label=excluded.label,bank_name=excluded.bank_name,bank_code=excluded.bank_code,branch_name=excluded.branch_name,account_number=excluded.account_number,account_name=excluded.account_name,note=excluded.note,updated_at=now();
 elsif p_action='select' then
  if previous is null then raise exception '找不到這組帳號';end if;
  update public.booking_system_settings set bank_account_key=account_id,updated_at=now() where id=true;
 elsif p_action='delete' then
  if previous is null then raise exception '找不到這組帳號';end if;
  if account_id=coalesce(selected,'cathay') then raise exception '請先切換至另一組收款帳號，再刪除此帳號';end if;
  if (select count(*) from public.bank_accounts where not archived)<=1 then raise exception '至少需要保留一組收款帳號';end if;
  if exists(select 1 from public.bookings where bank_account_snapshot->>'id'=account_id) then update public.bank_accounts set archived=true,updated_at=now() where id=account_id;
  else delete from public.bank_accounts where id=account_id;end if;
 else raise exception '不支援的操作';end if;
 select to_jsonb(a) into result from public.bank_accounts a where id=account_id;
 insert into public.bank_account_audit(action,account_id,previous_data,new_data) values(p_action,account_id,previous,result);
 return coalesce(result,'{}'::jsonb);
end $$;
alter table public.bank_accounts enable row level security;
alter table public.bank_account_audit enable row level security;
alter table public.bank_password_guard enable row level security;
revoke all on public.bank_accounts,public.bank_account_audit,public.bank_password_guard from public,anon,authenticated;
grant all on public.bank_accounts,public.bank_account_audit,public.bank_password_guard to service_role;
revoke all on function public.bank_password_attempt(boolean),public.mutate_bank_account(text,jsonb),public.capture_booking_bank_account() from public,anon,authenticated;
grant execute on function public.bank_password_attempt(boolean),public.mutate_bank_account(text,jsonb) to service_role;
commit;
