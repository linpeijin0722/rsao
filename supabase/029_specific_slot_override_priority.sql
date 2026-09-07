-- 單一日期／時段的人工設定應具有最高優先權。
-- 修正「關閉所有時段」後，再點單一時段開啟卻仍被 availability_rules / weekly_slot_overrides 擋住的問題。
create or replace function public.get_available_slots(p_method_id uuid, p_days integer default 30)
returns table(slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = public
as $$
with dates as (
  select d::date local_date
  from generate_series(
    (now() at time zone 'Asia/Taipei')::date,
    (now() at time zone 'Asia/Taipei')::date + least(greatest(p_days, 1), 180),
    interval '1 day'
  ) d
),
opened as (
  select gs slot_start, gs + interval '30 minutes' slot_end, d.local_date
  from dates d
  join availability_rules r
    on r.is_active
   and r.is_open
   and extract(isodow from d.local_date) = r.weekday
   and (r.valid_from is null or d.local_date >= r.valid_from)
   and (r.valid_until is null or d.local_date <= r.valid_until)
  cross join lateral generate_series(
    (d.local_date + r.start_time) at time zone 'Asia/Taipei',
    ((d.local_date + r.end_time) at time zone 'Asia/Taipei') - interval '30 minutes',
    interval '30 minutes'
  ) gs
),
weekly_forced as (
  select
    (d.local_date + w.start_time) at time zone 'Asia/Taipei' slot_start,
    ((d.local_date + w.start_time) at time zone 'Asia/Taipei') + interval '30 minutes' slot_end,
    d.local_date
  from dates d
  join weekly_slot_overrides w
    on w.is_open
   and extract(isodow from d.local_date) = w.weekday
),
specific_forced as (
  select
    o.slot_start,
    o.slot_start + interval '30 minutes' slot_end,
    (o.slot_start at time zone 'Asia/Taipei')::date local_date
  from slot_overrides o
  where o.consultation_method_id = p_method_id
    and o.is_open
),
combined as (
  select * from opened
  union
  select * from weekly_forced
  union
  select * from specific_forced
)
select c.slot_start, c.slot_end
from combined c
where c.slot_start > now()
  and (c.slot_start at time zone 'Asia/Taipei')::time >= time '07:00'
  and (c.slot_start at time zone 'Asia/Taipei')::time < time '23:00'
  and not exists (
    select 1 from holidays h where h.holiday_date = c.local_date
  )
  -- 單一時段明確設為開啟時，不再被週設定的關閉覆蓋。
  and not exists (
    select 1
    from weekly_slot_overrides w
    where not w.is_open
      and w.weekday = extract(isodow from c.local_date)
      and w.start_time = (c.slot_start at time zone 'Asia/Taipei')::time
      and not exists (
        select 1 from slot_overrides o
        where o.consultation_method_id = p_method_id
          and o.slot_start = c.slot_start
          and o.is_open
      )
  )
  -- 單一時段明確設為開啟時，也不再被「關閉所有時段」等關閉規則覆蓋。
  and not exists (
    select 1
    from availability_rules r
    where r.is_active
      and not r.is_open
      and r.weekday = extract(isodow from c.local_date)
      and (r.valid_from is null or c.local_date >= r.valid_from)
      and (r.valid_until is null or c.local_date <= r.valid_until)
      and (c.slot_start at time zone 'Asia/Taipei')::time >= r.start_time
      and (c.slot_start at time zone 'Asia/Taipei')::time < r.end_time
      and not exists (
        select 1 from weekly_slot_overrides w
        where w.is_open
          and w.weekday = r.weekday
          and w.start_time = (c.slot_start at time zone 'Asia/Taipei')::time
      )
      and not exists (
        select 1 from slot_overrides o
        where o.consultation_method_id = p_method_id
          and o.slot_start = c.slot_start
          and o.is_open
      )
  )
  and not exists (
    select 1
    from slot_overrides o
    where o.consultation_method_id = p_method_id
      and o.slot_start = c.slot_start
      and not o.is_open
  )
  and not exists (
    select 1
    from bookings b
    where b.consultation_method_id = p_method_id
      and b.slot_start = c.slot_start
      and b.status <> 'cancelled'
  )
order by c.slot_start;
$$;
