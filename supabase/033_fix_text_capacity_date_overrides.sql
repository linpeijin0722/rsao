begin;

create table if not exists public.text_capacity_date_overrides (
  release_date date primary key,
  release_count integer not null check (release_count >= 0),
  note text,
  updated_at timestamptz not null default now()
);

alter table public.text_capacity_date_overrides enable row level security;

-- 後台使用 service role 存取；函式用 security definer 讓前台只取得是否仍可預約。
create or replace function public.text_booking_available()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s text_capacity_settings%rowtype;
  used_count integer;
  allowed_count integer := 0;
  local_now timestamp;
  month_start date;
  days_in_month integer;
begin
  perform expire_unpaid_bookings();
  select * into s from text_capacity_settings where id = true;
  if not found or not s.enabled then return false; end if;
  local_now := now() at time zone 'Asia/Taipei';
  month_start := date_trunc('month', local_now)::date;
  select count(*) into used_count from bookings b join consultation_methods m on m.id=b.consultation_method_id
    where m.code='text' and b.status<>'cancelled'
      and b.created_at>=month_start at time zone 'Asia/Taipei'
      and b.created_at<(month_start+interval '1 month') at time zone 'Asia/Taipei';
  if s.mode='monthly' then
    if s.monthly_limit is null and not exists(select 1 from text_capacity_date_overrides where release_date between month_start and local_now::date) then return true; end if;
    days_in_month:=extract(day from (month_start+interval '1 month - 1 day'))::integer;
    select coalesce(sum(coalesce(o.release_count,case when s.monthly_limit is null then 0 else ceil(s.monthly_limit*extract(day from d)::numeric/days_in_month)-ceil(s.monthly_limit*(extract(day from d)::integer-1)::numeric/days_in_month) end)),0)::integer into allowed_count
      from generate_series(month_start,local_now::date,interval '1 day') d left join text_capacity_date_overrides o on o.release_date=d::date
      where d::date<local_now::date or local_now::time>=s.release_time;
  else
    select coalesce(sum(coalesce(o.release_count,r.release_count)),0)::integer into allowed_count
      from generate_series(month_start,local_now::date,interval '1 day') d
      left join text_capacity_date_overrides o on o.release_date=d::date
      left join text_weekly_release_rules r on r.weekday=extract(isodow from d)::integer and r.enabled
      where (o.release_date is not null or r.weekday is not null) and (d::date<local_now::date or local_now::time>=s.release_time);
  end if;
  return used_count<allowed_count;
end
$$;

grant execute on function public.text_booking_available() to anon;
commit;
