-- 升級 SQL：已執行過 schema.sql 的專案，請再整份執行本檔一次。
alter table public.customers alter column name drop not null;
alter table public.customers alter column phone drop not null;
alter table public.customers add column if not exists line_display_name text;
alter table public.customers add column if not exists line_picture_url text;

-- 移除初版為文字方式建立的示範重複項目；正式資料不會刪除。
delete from public.booking_items where title='文字諮詢基本項目'
and not exists(select 1 from public.booking_details d where d.item_id=booking_items.id);
alter table public.booking_items drop column if exists consultation_method_id;

create or replace function public.create_booking(p_method_id uuid,p_customer_name text,p_customer_phone text,p_line_user_id text,p_slot_start timestamptz,p_payment_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_method consultation_methods%rowtype; v_customer_id uuid; v_booking_id uuid; v_booking_no text; v_item jsonb; v_db_item booking_items%rowtype;
  v_detail_id uuid; v_sub_id uuid; v_sub sub_items%rowtype; v_qty integer; v_subtotal integer:=0; v_total integer:=0; v_slot_end timestamptz;
begin
  if p_line_user_id is null or length(trim(p_line_user_id))<1 then raise exception '必須先完成 LINE 登入'; end if;
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
  update customers set name=trim(p_customer_name),phone=p_customer_phone,updated_at=now() where line_user_id=p_line_user_id returning id into v_customer_id;
  if v_customer_id is null then raise exception 'LINE 登入資料不存在，請重新登入'; end if;
  v_booking_no:='LAS-'||to_char(now() at time zone 'Asia/Taipei','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into bookings(booking_no,customer_id,consultation_method_id,slot_start,slot_end,subtotal,total_price,payment_method)
    values(v_booking_no,v_customer_id,p_method_id,p_slot_start,v_slot_end,0,0,p_payment_method) returning id into v_booking_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 then raise exception '項目數量不正確'; end if;
    select * into v_db_item from booking_items where id=(v_item->>'item_id')::uuid and is_active;
    if not found then raise exception '選擇的項目不存在或未開放'; end if;
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

update public.consultation_methods set base_price=1200,duration_minutes=25 where code='video';
update public.consultation_methods set base_price=0,reply_days=30 where code='text';
