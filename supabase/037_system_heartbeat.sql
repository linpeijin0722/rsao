-- 獨立系統保活紀錄：不讀寫任何訂單、客戶、付款或諮詢內容。
create table if not exists public.system_heartbeat (
  id boolean primary key default true check (id = true),
  last_ping_at timestamptz not null default now(),
  ping_count bigint not null default 1
);

alter table public.system_heartbeat enable row level security;

create or replace function public.record_system_heartbeat()
returns table(last_ping_at timestamptz, ping_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_heartbeat (id, last_ping_at, ping_count)
  values (true, now(), 1)
  on conflict (id) do update
    set last_ping_at = excluded.last_ping_at,
        ping_count = public.system_heartbeat.ping_count + 1;

  return query
  select heartbeat.last_ping_at, heartbeat.ping_count
  from public.system_heartbeat as heartbeat
  where heartbeat.id = true;
end;
$$;

revoke all on function public.record_system_heartbeat() from public, anon, authenticated;
grant execute on function public.record_system_heartbeat() to service_role;
