-- 阿嫂 Supabase SQL Editor 完整執行。須已執行 044、045。
-- 不取消或修改既有重複預約；從此阻擋新的重疊預約。
begin;
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
 -- 行鎖持有至交易結束；較高隔離層級的競爭交易會失敗，不會沿用舊快照。
 update public.video_booking_mutex set revision=revision+1 where method_id=p_method_id;
end;
$$;
revoke all on function public.lock_video_booking_method(uuid) from public,anon,authenticated;

create or replace function public.guard_video_booking_interval()
returns trigger language plpgsql volatile security definer set search_path=public as $$
declare occupied_end timestamptz;
begin
 if new.slot_start is null or new.status in ('cancelled','expired') or not exists(select 1 from public.consultation_methods where id=new.consultation_method_id and code='video') then return new; end if;
 perform public.lock_video_booking_method(new.consultation_method_id);
 new.slot_end:=new.slot_start+make_interval(mins=>public.video_consultation_minutes(new.total_price));
 occupied_end:=new.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(new.total_price)+10));
 if exists(select 1 from public.bookings b where b.id is distinct from new.id and b.consultation_method_id=new.consultation_method_id and b.status not in ('cancelled','expired') and b.slot_start<occupied_end and b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))>new.slot_start) then
   raise exception using errcode='23P01',message='此時段已被預約或與諮詢／緩衝時間重疊，請重新選擇';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_video_booking_interval on public.bookings;
create trigger guard_video_booking_interval before insert or update of slot_start,total_price,status,consultation_method_id on public.bookings for each row execute function public.guard_video_booking_interval();

create or replace function public.create_booking(p_method_id uuid,p_customer_name text,p_customer_phone text,p_line_user_id text,p_slot_start timestamptz,p_payment_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_method consultation_methods%rowtype; v_customer_id uuid; v_booking_id uuid; v_booking_no text; v_item jsonb; v_db_item booking_items%rowtype;
  v_detail_id uuid; v_sub_id uuid; v_sub sub_items%rowtype; v_qty integer; v_subtotal integer:=0; v_total integer:=0; v_slot_end timestamptz; v_unit_price integer; v_selected_sub_count integer;
begin
  if p_line_user_id is null or length(trim(p_line_user_id))<1 then raise exception '必須先完成 LINE 登入'; end if;
  if p_payment_method not in ('transfer','credit_card','line_pay') then raise exception '付款方式不正確'; end if;
  select * into v_method from consultation_methods where id=p_method_id and is_active;
  if not found then raise exception '諮詢方式不存在或未開放'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '至少選擇一個項目'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x join booking_items i on i.id=(x->>'item_id')::uuid where i.code='overall-fortune')
     and exists(select 1 from jsonb_array_elements(p_items) x join booking_items i on i.id=(x->>'item_id')::uuid where i.code='health')
  then raise exception '「整體運勢」已包含身體健康，請勿重複選購'; end if;
  if v_method.code='video' then
    if p_slot_start is null then raise exception '請選擇視訊時段'; end if;
    perform public.lock_video_booking_method(p_method_id);
    update public.bookings set status='cancelled',payment_status='failed',cancellation_reason='超過繳費期限',updated_at=now()
      where consultation_method_id=p_method_id and payment_status='pending' and status='pending_payment' and expires_at<=now();
    if p_slot_start < (((now() at time zone 'Asia/Taipei')::date+4)::timestamp at time zone 'Asia/Taipei') then raise exception '視訊諮詢最早只能預約4天後的日期'; end if;
    if exists(select 1 from public.booking_system_settings where id=true and not video_booking_enabled) then raise exception '目前視訊諮詢暫不開放預約'; end if;
    select slot_end into v_slot_end from get_available_slots(p_method_id,63) where slot_start=p_slot_start;
    if v_slot_end is null then raise exception '此時段已被預約或未開放'; end if;
  else p_slot_start:=null; v_slot_end:=null; end if;
  select id into v_customer_id from customers where line_user_id=p_line_user_id;
  if v_customer_id is null then raise exception 'LINE 登入資料不存在，請重新登入'; end if;
  v_booking_no:='LAS-'||to_char(now() at time zone 'Asia/Taipei','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into bookings(booking_no,customer_id,consultation_method_id,slot_start,slot_end,subtotal,total_price,payment_method)
    values(v_booking_no,v_customer_id,p_method_id,p_slot_start,v_slot_end,0,0,p_payment_method) returning id into v_booking_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 then raise exception '項目數量不正確'; end if;
    select * into v_db_item from booking_items where id=(v_item->>'item_id')::uuid and is_active;
    if not found then raise exception '選擇的項目不存在或未開放'; end if;
    if not v_db_item.allow_quantity and v_qty<>1 then raise exception '此項目只能選擇一份'; end if;
    v_selected_sub_count:=jsonb_array_length(coalesce(v_item->'sub_item_ids','[]'::jsonb));
    if v_db_item.option_mode='single_required' and v_selected_sub_count<>1 then raise exception '此項目必須選擇一個子項目'; end if;
    v_unit_price:=v_db_item.price;
    if v_selected_sub_count=1 then
      select * into v_sub from sub_items where id=((v_item->'sub_item_ids'->>0)::uuid) and item_id=v_db_item.id and is_active;
      if not found then raise exception '子項目不存在或不屬於此主項目'; end if;
      v_unit_price:=v_sub.price;
    end if;
    insert into booking_details(booking_id,item_id,item_title,unit_price,quantity,line_total)
      values(v_booking_id,v_db_item.id,v_db_item.title,v_unit_price,v_qty,v_unit_price*v_qty) returning id into v_detail_id;
    v_subtotal:=v_subtotal+v_unit_price*v_qty;
    for v_sub_id in select value::text::uuid from jsonb_array_elements_text(coalesce(v_item->'sub_item_ids','[]'::jsonb)) loop
      select * into v_sub from sub_items where id=v_sub_id and item_id=v_db_item.id and is_active;
      if not found then raise exception '子項目不存在或不屬於此主項目'; end if;
      insert into booking_detail_sub_items(booking_detail_id,sub_item_id,sub_item_title,unit_price,quantity,line_total)
        values(v_detail_id,v_sub.id,v_sub.title,v_sub.price,v_qty,v_sub.price*v_qty);
    end loop;
  end loop;
  v_total:=v_subtotal+v_method.base_price; update bookings set subtotal=v_subtotal,total_price=v_total where id=v_booking_id;
  return jsonb_build_object('id',v_booking_id,'booking_no',v_booking_no,'total_price',v_total,'status','pending_payment');
exception when unique_violation then raise exception '此時段剛被其他人預約，請重新選擇'; end;
$$;
grant execute on function public.create_booking(uuid,text,text,text,timestamptz,text,jsonb) to anon,authenticated,service_role;
commit;
-- 只列出已有重疊，方便人工確認／改期，不會變更訂單。
select a.booking_no as booking_a,b.booking_no as booking_b,
 a.slot_start at time zone 'Asia/Taipei' as taiwan_start_a,
 b.slot_start at time zone 'Asia/Taipei' as taiwan_start_b
from public.bookings a join public.bookings b on a.id<b.id and a.consultation_method_id=b.consultation_method_id
join public.consultation_methods m on m.id=a.consultation_method_id and m.code='video'
where a.status not in ('cancelled','expired') and b.status not in ('cancelled','expired')
 and a.slot_start<b.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(b.total_price)+10))
 and b.slot_start<a.slot_start+make_interval(mins=>greatest(50,public.video_consultation_minutes(a.total_price)+10));
