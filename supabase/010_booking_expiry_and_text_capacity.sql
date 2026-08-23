begin;
alter table public.bookings add column if not exists expires_at timestamptz;
alter table public.bookings add column if not exists cancellation_reason text;
update public.bookings set expires_at=created_at+interval '24 hours' where expires_at is null;
alter table public.bookings alter column expires_at set default (now()+interval '24 hours');

create table if not exists public.text_capacity_settings(
 id boolean primary key default true check(id), enabled boolean not null default true,
 monthly_limit integer check(monthly_limit is null or monthly_limit>=0),
 weekly_release_day integer check(weekly_release_day between 1 and 7),
 weekly_release_count integer check(weekly_release_count is null or weekly_release_count>=0),
 updated_at timestamptz not null default now()
);
insert into public.text_capacity_settings(id,enabled,monthly_limit) values(true,true,null) on conflict(id) do nothing;
alter table public.text_capacity_settings enable row level security;

create or replace function public.expire_unpaid_bookings() returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
 update bookings set status='cancelled',payment_status='failed',cancellation_reason='超過繳費期限',updated_at=now()
 where payment_status='pending' and status='pending_payment' and expires_at<=now();
 get diagnostics affected=row_count; return affected;
end$$;

create or replace function public.text_booking_available() returns boolean language plpgsql security definer set search_path=public as $$
declare s text_capacity_settings%rowtype; used_count integer; release_times integer; allowed_count integer:=2147483647;
begin
 perform expire_unpaid_bookings(); select * into s from text_capacity_settings where id=true;
 if not found or not s.enabled then return false; end if;
 select count(*) into used_count from bookings b join consultation_methods m on m.id=b.consultation_method_id
 where m.code='text' and b.status<>'cancelled' and b.created_at>=date_trunc('month',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'
 and b.created_at<(date_trunc('month',now() at time zone 'Asia/Taipei')+interval '1 month') at time zone 'Asia/Taipei';
 if s.monthly_limit is not null then allowed_count:=least(allowed_count,s.monthly_limit); end if;
 if s.weekly_release_day is not null and s.weekly_release_count is not null then
   select count(*) into release_times from generate_series(date_trunc('month',current_date)::date,current_date,interval '1 day') d where extract(isodow from d)=s.weekly_release_day;
   allowed_count:=least(allowed_count,release_times*s.weekly_release_count);
 end if;
 return used_count<allowed_count;
end$$;

create or replace function public.enforce_text_capacity() returns trigger language plpgsql security definer set search_path=public as $$
declare method_code text;
begin
 select code into method_code from consultation_methods where id=new.consultation_method_id;
 if method_code='text' then
   perform pg_advisory_xact_lock(hashtext('lin-a-sao-text-capacity'));
   if not text_booking_available() then raise exception '文字諮詢目前已額滿'; end if;
 end if; return new;
end$$;
drop trigger if exists enforce_text_capacity_trigger on public.bookings;
create trigger enforce_text_capacity_trigger before insert on public.bookings for each row execute function public.enforce_text_capacity();
grant execute on function public.expire_unpaid_bookings() to anon;
grant execute on function public.text_booking_available() to anon;

create extension if not exists pg_cron with schema extensions;
do $$ begin
 perform cron.unschedule('expire-unpaid-lin-a-sao');
exception when others then null; end $$;
select cron.schedule('expire-unpaid-lin-a-sao','*/15 * * * *',$$select public.expire_unpaid_bookings();$$);
commit;
