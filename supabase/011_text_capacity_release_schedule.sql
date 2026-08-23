begin;
alter table public.text_capacity_settings add column if not exists mode text not null default 'monthly';
alter table public.text_capacity_settings add column if not exists release_time time not null default '15:00';
alter table public.text_capacity_settings drop constraint if exists text_capacity_settings_mode_check;
alter table public.text_capacity_settings add constraint text_capacity_settings_mode_check check(mode in ('monthly','weekly'));

create table if not exists public.text_weekly_release_rules(
 weekday integer primary key check(weekday between 1 and 7), enabled boolean not null default false,
 release_count integer not null default 0 check(release_count>=0), updated_at timestamptz not null default now()
);
insert into public.text_weekly_release_rules(weekday) select generate_series(1,7) on conflict(weekday) do nothing;
alter table public.text_weekly_release_rules enable row level security;

create or replace function public.text_booking_available() returns boolean language plpgsql security definer set search_path=public as $$
declare s text_capacity_settings%rowtype; used_count integer; allowed_count integer:=0; local_now timestamp; month_start date; days_in_month integer; released_days integer;
begin
 perform expire_unpaid_bookings(); select * into s from text_capacity_settings where id=true;
 if not found or not s.enabled then return false; end if;
 local_now:=now() at time zone 'Asia/Taipei'; month_start:=date_trunc('month',local_now)::date;
 select count(*) into used_count from bookings b join consultation_methods m on m.id=b.consultation_method_id
 where m.code='text' and b.status<>'cancelled' and b.created_at>=month_start at time zone 'Asia/Taipei'
 and b.created_at<(month_start+interval '1 month') at time zone 'Asia/Taipei';
 if s.mode='monthly' then
   if s.monthly_limit is null then return true; end if;
   days_in_month:=extract(day from (month_start+interval '1 month - 1 day'))::integer;
   released_days:=extract(day from local_now)::integer-case when local_now::time<s.release_time then 1 else 0 end;
   allowed_count:=least(s.monthly_limit,ceil(s.monthly_limit*greatest(released_days,0)::numeric/days_in_month));
 else
   select coalesce(sum(r.release_count),0)::integer into allowed_count
   from generate_series(month_start,local_now::date,interval '1 day') d
   join text_weekly_release_rules r on r.weekday=extract(isodow from d)::integer and r.enabled
   where d::date<local_now::date or local_now::time>=s.release_time;
 end if;
 return used_count<allowed_count;
end$$;
commit;
