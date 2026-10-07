-- Run after 049 and 052, BEFORE deploying the website.
begin;
-- 兼容尚未安裝 046 的正式資料庫；此函式是預約鎖與休假異動共用的必要依賴。
create table if not exists public.video_booking_mutex (
  method_id uuid primary key references public.consultation_methods(id) on delete cascade,
  revision bigint not null default 0
);
alter table public.video_booking_mutex enable row level security;
revoke all on public.video_booking_mutex from anon,authenticated;
grant all on public.video_booking_mutex to service_role;
create or replace function public.lock_video_booking_method(p_method_id uuid)
returns void language plpgsql volatile security definer set search_path=public as $$
begin
  insert into public.video_booking_mutex(method_id) values(p_method_id) on conflict(method_id) do nothing;
  update public.video_booking_mutex set revision=revision+1 where method_id=p_method_id;
end $$;
revoke all on function public.lock_video_booking_method(uuid) from public,anon,authenticated;
grant execute on function public.lock_video_booking_method(uuid) to service_role;
alter table public.bookings add column if not exists consultation_result_manual_at timestamptz;
comment on column public.bookings.consultation_result_manual_at is 'Time staff confirmed consultation results were manually returned; not a system LINE delivery timestamp.';
create table if not exists public.video_time_off (
  id uuid primary key default gen_random_uuid(),
  off_date date not null,
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz not null default now(),
  constraint video_time_off_range check (start_time < end_time)
);
create index if not exists video_time_off_date_idx on public.video_time_off(off_date);
alter table public.video_time_off enable row level security;
revoke all on public.video_time_off from anon,authenticated;
grant all on public.video_time_off to service_role;

create or replace function public.video_time_off_overlaps(p_start timestamptz,p_end timestamptz)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.video_time_off t
  where p_start < ((t.off_date+t.end_time) at time zone 'Asia/Taipei')+interval '1 hour'
    and p_end > ((t.off_date+t.start_time) at time zone 'Asia/Taipei')-interval '1 hour');
$$;
revoke all on function public.video_time_off_overlaps(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.video_time_off_overlaps(timestamptz,timestamptz) to service_role;

-- Use the same mutex as reservations to serialize saves against a new booking.
create or replace function public.lock_video_time_off_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare method record;
begin
  for method in select id from public.consultation_methods where code='video' order by id loop
    perform public.lock_video_booking_method(method.id);
  end loop;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists lock_video_time_off_change on public.video_time_off;
create trigger lock_video_time_off_change before insert or update or delete on public.video_time_off
for each row execute function public.lock_video_time_off_change();

create or replace function public.guard_video_time_off()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.slot_start is null or new.status in ('cancelled','expired') or not exists(
    select 1 from public.consultation_methods where id=new.consultation_method_id and code='video'
  ) then return new; end if;
  -- Existing appointments are retained: payment/status updates must still work.
  if TG_OP='UPDATE' then
    if old.status not in ('cancelled','expired') and old.slot_start=new.slot_start
      and old.consultation_method_id=new.consultation_method_id
      and public.video_consultation_minutes(new.total_price)<=public.video_consultation_minutes(old.total_price)
    then return new; end if;
  end if;
  perform public.lock_video_booking_method(new.consultation_method_id);
  if public.video_time_off_overlaps(new.slot_start,new.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(new.total_price)+10))) then
    raise exception using errcode='23P01',message='此時段與休假或休假前後一小時重疊，請重新選擇';
  end if;
  return new;
end $$;
drop trigger if exists guard_video_time_off on public.bookings;
create trigger guard_video_time_off before insert or update of slot_start,total_price,status,consultation_method_id
on public.bookings for each row execute function public.guard_video_time_off();
revoke all on function public.lock_video_time_off_change() from public,anon,authenticated;
revoke all on function public.guard_video_time_off() from public,anon,authenticated;

create or replace function public.get_available_slots(p_method_id uuid,p_days integer default 30)
returns table(slot_start timestamptz,slot_end timestamptz)
language sql stable security definer set search_path=public as $$
select o.slot_start,o.slot_start+interval '50 minutes' as slot_end
from public.slot_overrides o
where o.consultation_method_id=p_method_id
  and o.is_open
  and (o.slot_start at time zone 'Asia/Taipei')::date > (now() at time zone 'Asia/Taipei')::date + coalesce((select video_booking_lead_days from public.booking_system_settings where id=true),3)
  and not public.video_time_off_overlaps(o.slot_start,o.slot_start+interval '50 minutes')
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


notify pgrst, 'reload schema';
commit;
