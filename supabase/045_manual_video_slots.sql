-- 在阿嫂預約系統的 Supabase SQL Editor 完整執行。
-- 須已執行 044。保留所有既有預約與手動時段；每週規則停止影響可約時間。
begin;
create or replace function public.get_available_slots(p_method_id uuid,p_days integer default 30)
returns table(slot_start timestamptz,slot_end timestamptz)
language sql stable security definer set search_path=public as $$
select o.slot_start,o.slot_start+interval '50 minutes' as slot_end
from public.slot_overrides o
where o.consultation_method_id=p_method_id
  and o.is_open
  and o.slot_start>now()
  and (o.slot_start at time zone 'Asia/Taipei')::date <= (now() at time zone 'Asia/Taipei')::date+least(greatest(p_days,1),180)
  and (o.slot_start at time zone 'Asia/Taipei')::time between time '07:00' and time '22:00'
  and not exists(select 1 from public.holidays h where h.holiday_date=(o.slot_start at time zone 'Asia/Taipei')::date)
  and not exists(
    select 1 from public.bookings b
    where b.consultation_method_id=p_method_id and b.status<>'cancelled'
      and b.slot_start<o.slot_start+interval '50 minutes'
      and b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))>o.slot_start
  )
order by o.slot_start;
$$;
grant execute on function public.get_available_slots(uuid,integer) to anon,authenticated,service_role;
commit;
