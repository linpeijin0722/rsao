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
    (((d.local_date + t.local_time) at time zone 'Asia/Taipei') + interval '30 minutes') as slot_end,
    d.local_date,
    t.local_time,
    extract(isodow from d.local_date)::smallint as weekday
  from dates d
  cross join lateral (
    select gs::time as local_time
    from generate_series(
      timestamp '2000-01-01 07:00:00',
      timestamp '2000-01-01 22:30:00',
      interval '30 minutes'
    ) as gs
  ) t
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
        and c.local_time < r.end_time
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
        and b.slot_start = c.slot_start
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
