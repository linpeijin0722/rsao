-- Run once in Supabase SQL Editor, before deploying the website.
begin;
create or replace function public.video_consultation_minutes(amount integer)
returns integer language sql immutable set search_path=public as $$
select case when coalesce(amount,0)<=5700 then 30 when amount<=7900 then 35 else 40+floor((amount-7900)::numeric/1200)::integer*5 end;
$$;
create table if not exists public.consultation_document_history(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 document_id text not null unique,document_url text not null,
 created_at timestamptz not null default now()
);
alter table public.consultation_document_history enable row level security;
revoke all on public.consultation_document_history from anon,authenticated;
grant all on public.consultation_document_history to service_role;
insert into public.consultation_document_history(booking_id,document_id,document_url,created_at)
select booking_id,google_document_id,coalesce(google_document_url,'https://docs.google.com/document/d/'||google_document_id||'/edit'),coalesce(google_document_created_at,now()) from public.booking_details where google_document_id is not null
on conflict(document_id) do nothing;
-- Normalize actual end time; preserve existing start times.
update public.bookings b set slot_end=slot_start+make_interval(mins=>public.video_consultation_minutes(total_price))
from public.consultation_methods m where m.id=b.consultation_method_id and m.code='video' and b.slot_start is not null;
-- 重新建立視訊可預約時段判斷。
-- 優先順序：單一日期時段 > 每週時段 > 一般開放/關閉規則。
-- 「特定休假日」與「已有未取消預約」仍維持不可預約。
-- 這版直接從每天 07:00~22:30 的候選時段判斷最終狀態，
-- 避免先 UNION 開放時段、再用多層 NOT EXISTS 排除時互相覆蓋。

create or replace function public.get_available_slots(
  p_method_id uuid,
  p_days integer default 30
)
returns table(
  slot_start timestamptz,
  slot_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
with dates as (
  select d::date as local_date
  from generate_series(
    (now() at time zone 'Asia/Taipei')::date,
    (now() at time zone 'Asia/Taipei')::date + least(greatest(p_days, 1), 180),
    interval '1 day'
  ) as d
),
candidates as (
  select
    ((d.local_date + t.local_time) at time zone 'Asia/Taipei') as slot_start,
    (((d.local_date + t.local_time) at time zone 'Asia/Taipei') + interval '50 minutes') as slot_end,
    d.local_date,
    t.local_time,
    extract(isodow from d.local_date)::smallint as weekday
  from dates d
  cross join lateral (
    select gs::time as local_time
    from generate_series(
      timestamp '2000-01-01 07:00:00',
      timestamp '2000-01-01 22:00:00',
      interval '10 minutes'
    ) as gs
  ) t
  where exists(select 1 from public.availability_rules ar where ar.is_active and ar.is_open and ar.weekday=extract(isodow from d.local_date) and (ar.valid_from is null or d.local_date>=ar.valid_from) and (ar.valid_until is null or d.local_date<=ar.valid_until) and t.local_time>=ar.start_time and t.local_time<ar.end_time and mod(extract(epoch from (t.local_time-ar.start_time))::integer/60,50)=0)
    or exists(select 1 from public.slot_overrides o where o.consultation_method_id=p_method_id and o.slot_start=((d.local_date+t.local_time) at time zone 'Asia/Taipei') and o.is_open)
    or exists(select 1 from public.weekly_slot_overrides w where w.weekday=extract(isodow from d.local_date) and w.start_time=t.local_time and w.is_open)
    or exists(select 1 from public.bookings b where b.consultation_method_id=p_method_id and b.status<>'cancelled' and (to_timestamp(ceil(extract(epoch from (b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))))/600)*600) at time zone 'Asia/Taipei')::date=d.local_date and (to_timestamp(ceil(extract(epoch from (b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))))/600)*600) at time zone 'Asia/Taipei')::time=t.local_time)
),
resolved as (
  select
    c.slot_start,
    c.slot_end,
    c.local_date,
    c.local_time,
    c.weekday,
    o.is_open as specific_open,
    (o.slot_start is not null) as has_specific_override,
    w.is_open as weekly_open,
    (w.start_time is not null) as has_weekly_override,
    exists (
      select 1
      from public.availability_rules r
      where r.is_active
        and r.is_open
        and r.weekday = c.weekday
        and (r.valid_from is null or c.local_date >= r.valid_from)
        and (r.valid_until is null or c.local_date <= r.valid_until)
        and c.local_time >= r.start_time
        and (c.slot_end at time zone 'Asia/Taipei')::time <= r.end_time
    ) as has_general_open,
    exists (
      select 1
      from public.availability_rules r
      where r.is_active
        and not r.is_open
        and r.weekday = c.weekday
        and (r.valid_from is null or c.local_date >= r.valid_from)
        and (r.valid_until is null or c.local_date <= r.valid_until)
        and c.local_time >= r.start_time
        and c.local_time < r.end_time
    ) as has_general_close,
    exists (
      select 1
      from public.holidays h
      where h.holiday_date = c.local_date
    ) as is_holiday,
    exists (
      select 1
      from public.bookings b
      where b.consultation_method_id = p_method_id
        and b.slot_start < c.slot_end
        and b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10)) > c.slot_start
        and b.status <> 'cancelled'
    ) as is_booked
  from candidates c
  left join public.slot_overrides o
    on o.consultation_method_id = p_method_id
   and o.slot_start = c.slot_start
  left join public.weekly_slot_overrides w
    on w.weekday = c.weekday
   and w.start_time = c.local_time
)
select
  r.slot_start,
  r.slot_end
from resolved r
where r.slot_start > now()
  and not r.is_holiday
  and not r.is_booked
  and case
    when r.has_specific_override then r.specific_open
    when r.has_weekly_override then r.weekly_open
    else r.has_general_open and not r.has_general_close
  end
order by r.slot_start;
$$;

grant execute on function public.get_available_slots(uuid, integer) to anon, authenticated, service_role;

-- Database guard covers checkout, manual bookings, time and price edits.
create or replace function public.guard_video_booking_interval()
returns trigger language plpgsql security definer set search_path=public as $$
declare occupied_end timestamptz;
begin
 if new.slot_start is null or new.status='cancelled' or not exists(select 1 from consultation_methods where id=new.consultation_method_id and code='video') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.consultation_method_id::text,0));
 new.slot_end:=new.slot_start+make_interval(mins=>public.video_consultation_minutes(new.total_price));
 occupied_end:=new.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(new.total_price)+10));
 if exists(select 1 from bookings b where b.id<>new.id and b.consultation_method_id=new.consultation_method_id and b.status<>'cancelled' and b.slot_start<occupied_end and b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))>new.slot_start) then
 raise exception '此時段與其他視訊預約或10分鐘緩衝重疊，請重新選擇';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_video_booking_interval on public.bookings;
create trigger guard_video_booking_interval before insert or update of slot_start,total_price,status,consultation_method_id on public.bookings for each row execute function public.guard_video_booking_interval();
commit;
