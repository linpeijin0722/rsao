-- 林阿嫂預約系統：請整份貼到「新建立的林阿嫂 Supabase Project」SQL Editor 執行。
-- 請勿貼到台北子龍廟的 Project。
create extension if not exists pgcrypto;

create table if not exists public.consultation_methods (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code in ('video','text')),
  title text not null, description text, duration_minutes integer check (duration_minutes > 0),
  base_price integer not null default 0 check (base_price >= 0), monthly_limit integer check (monthly_limit > 0),
  reply_days integer check (reply_days > 0), is_active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(), consultation_method_id uuid not null references public.consultation_methods(id) on delete cascade,
  title text not null, description text, price integer not null check (price >= 0), allow_quantity boolean not null default false,
  is_active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sub_items (
  id uuid primary key default gen_random_uuid(), item_id uuid not null references public.booking_items(id) on delete cascade,
  title text not null, description text, price integer not null check (price >= 0), is_active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), line_user_id text unique, name text not null, phone text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(), consultation_method_id uuid not null references public.consultation_methods(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), check (ends_at > starts_at), unique (consultation_method_id, starts_at, ends_at)
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(), booking_no text not null unique,
  customer_id uuid not null references public.customers(id), consultation_method_id uuid not null references public.consultation_methods(id),
  slot_start timestamptz, slot_end timestamptz, subtotal integer not null check (subtotal >= 0), total_price integer not null check (total_price >= 0),
  payment_method text not null check (payment_method in ('transfer','credit_card')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  status text not null default 'pending_payment' check (status in ('pending_payment','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists one_live_booking_per_slot on public.bookings(consultation_method_id,slot_start)
  where slot_start is not null and status <> 'cancelled';
create table if not exists public.booking_details (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  item_id uuid not null references public.booking_items(id), item_title text not null, unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0), line_total integer not null check (line_total >= 0), created_at timestamptz not null default now()
);
create table if not exists public.booking_detail_sub_items (
  id uuid primary key default gen_random_uuid(), booking_detail_id uuid not null references public.booking_details(id) on delete cascade,
  sub_item_id uuid not null references public.sub_items(id), sub_item_title text not null, unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0), line_total integer not null check (line_total >= 0), created_at timestamptz not null default now()
);

alter table public.consultation_methods enable row level security; alter table public.booking_items enable row level security;
alter table public.sub_items enable row level security; alter table public.availability enable row level security;
alter table public.customers enable row level security; alter table public.bookings enable row level security;
alter table public.booking_details enable row level security; alter table public.booking_detail_sub_items enable row level security;
drop policy if exists "public read active methods" on public.consultation_methods;
create policy "public read active methods" on public.consultation_methods for select to anon using (is_active);
drop policy if exists "public read active items" on public.booking_items;
create policy "public read active items" on public.booking_items for select to anon using (is_active);
drop policy if exists "public read active sub items" on public.sub_items;
create policy "public read active sub items" on public.sub_items for select to anon using (is_active);
-- 顧客與訂單沒有公開 select/insert policy；只能經由下方受控函式建立，避免前端任意改價或讀取他人資料。

create or replace function public.get_available_slots(p_method_id uuid, p_days integer default 30)
returns table(slot_start timestamptz, slot_end timestamptz) language sql security definer set search_path=public as $$
  with method as (select duration_minutes from consultation_methods where id=p_method_id and code='video' and is_active),
  generated as (
    select s as slot_start, s + make_interval(mins => m.duration_minutes) as slot_end
    from availability a cross join method m
    cross join lateral generate_series(a.starts_at, a.ends_at-make_interval(mins=>m.duration_minutes), make_interval(mins=>m.duration_minutes)) s
    where a.consultation_method_id=p_method_id and a.is_active and s>now() and s<=now()+make_interval(days=>least(greatest(p_days,1),60))
  ) select g.slot_start,g.slot_end from generated g
    where not exists(select 1 from bookings b where b.consultation_method_id=p_method_id and b.slot_start=g.slot_start and b.status<>'cancelled')
    order by g.slot_start;
$$;
grant execute on function public.get_available_slots(uuid,integer) to anon;

create or replace function public.create_booking(p_method_id uuid,p_customer_name text,p_customer_phone text,p_line_user_id text,p_slot_start timestamptz,p_payment_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_method consultation_methods%rowtype; v_customer_id uuid; v_booking_id uuid; v_booking_no text; v_item jsonb; v_db_item booking_items%rowtype;
  v_detail_id uuid; v_sub_id uuid; v_sub sub_items%rowtype; v_qty integer; v_subtotal integer:=0; v_total integer:=0; v_slot_end timestamptz;
begin
  if length(trim(p_customer_name))<1 or p_customer_phone !~ '^09[0-9]{8}$' then raise exception '姓名或手機格式不正確'; end if;
  if p_payment_method not in ('transfer','credit_card') then raise exception '付款方式不正確'; end if;
  select * into v_method from consultation_methods where id=p_method_id and is_active for share;
  if not found then raise exception '諮詢方式不存在或未開放'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '至少選擇一個項目'; end if;
  if v_method.code='video' then
    if p_slot_start is null then raise exception '請選擇視訊時段'; end if;
    select slot_end into v_slot_end from get_available_slots(p_method_id,30) where slot_start=p_slot_start;
    if v_slot_end is null then raise exception '此時段已被預約或未開放'; end if;
  else p_slot_start:=null; v_slot_end:=null; end if;
  if p_line_user_id is not null and length(trim(p_line_user_id))>0 then
    insert into customers(line_user_id,name,phone) values(trim(p_line_user_id),trim(p_customer_name),p_customer_phone)
    on conflict(line_user_id) do update set name=excluded.name,phone=excluded.phone,updated_at=now() returning id into v_customer_id;
  else insert into customers(name,phone) values(trim(p_customer_name),p_customer_phone) returning id into v_customer_id; end if;
  v_booking_no:='LAS-'||to_char(now() at time zone 'Asia/Taipei','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into bookings(booking_no,customer_id,consultation_method_id,slot_start,slot_end,subtotal,total_price,payment_method)
    values(v_booking_no,v_customer_id,p_method_id,p_slot_start,v_slot_end,0,0,p_payment_method) returning id into v_booking_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 then raise exception '項目數量不正確'; end if;
    select * into v_db_item from booking_items where id=(v_item->>'item_id')::uuid and consultation_method_id=p_method_id and is_active;
    if not found then raise exception '選擇的項目不存在或不屬於此諮詢方式'; end if;
    if not v_db_item.allow_quantity and v_qty<>1 then raise exception '此項目只能選擇一份'; end if;
    insert into booking_details(booking_id,item_id,item_title,unit_price,quantity,line_total)
      values(v_booking_id,v_db_item.id,v_db_item.title,v_db_item.price,v_qty,v_db_item.price*v_qty) returning id into v_detail_id;
    v_subtotal:=v_subtotal+v_db_item.price*v_qty;
    for v_sub_id in select value::text::uuid from jsonb_array_elements_text(coalesce(v_item->'sub_item_ids','[]'::jsonb)) loop
      select * into v_sub from sub_items where id=v_sub_id and item_id=v_db_item.id and is_active;
      if not found then raise exception '加購項目不存在或不屬於此主項目'; end if;
      insert into booking_detail_sub_items(booking_detail_id,sub_item_id,sub_item_title,unit_price,quantity,line_total)
        values(v_detail_id,v_sub.id,v_sub.title,v_sub.price,v_qty,v_sub.price*v_qty); v_subtotal:=v_subtotal+v_sub.price*v_qty;
    end loop;
  end loop;
  v_total:=v_subtotal+v_method.base_price; update bookings set subtotal=v_subtotal,total_price=v_total where id=v_booking_id;
  return jsonb_build_object('id',v_booking_id,'booking_no',v_booking_no,'total_price',v_total,'status','pending_payment');
exception when unique_violation then raise exception '此時段剛被其他人預約，請重新選擇'; end;
$$;
grant execute on function public.create_booking(uuid,text,text,text,timestamptz,text,jsonb) to anon;

insert into public.consultation_methods(code,title,description,duration_minutes,base_price,monthly_limit,reply_days,sort_order)
values ('video','視訊諮詢','與老師進行即時視訊諮詢',25,1200,null,null,1),('text','文字諮詢','以文字資料進行諮詢，不需指定時間',null,0,30,30,2)
on conflict(code) do update set title=excluded.title,duration_minutes=excluded.duration_minutes;
insert into public.booking_items(consultation_method_id,title,description,price,allow_quantity,sort_order)
select id,'觀靈基本項目','正式上線前可在 Supabase 修改名稱、說明與價格',1600,false,1 from consultation_methods m
where m.code='video' and not exists(select 1 from booking_items b where b.consultation_method_id=m.id);
insert into public.booking_items(consultation_method_id,title,description,price,allow_quantity,sort_order)
select id,'文字諮詢基本項目','正式上線前可在 Supabase 修改名稱、說明與價格',1600,false,1 from consultation_methods m
where m.code='text' and not exists(select 1 from booking_items b where b.consultation_method_id=m.id);

-- 範例：開放視訊時段（請改成老師實際可預約的台北時間；同一天可新增多段）
-- insert into availability(consultation_method_id,starts_at,ends_at)
-- select id,'2026-09-01 13:00+08','2026-09-01 17:00+08' from consultation_methods where code='video';
