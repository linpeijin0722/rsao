-- 子項目改為「該方案的完整售價」，不再與主項目價格相加。
begin;

-- 既有子項目價格改成完整售價。
update public.sub_items s set price = v.price
from public.booking_items i,
(values
 ('past-life-personal','one-past-life',1500),
 ('past-life-personal','two-past-lives',1500),
 ('past-life-personal','three-past-lives',1500),
 ('past-life-relationship','one-person',1500),
 ('past-life-relationship','two-people',3000),
 ('past-life-relationship','three-people',4500),
 ('marriage-bazi','one-extra-person',1800),
 ('infant-spirit','one',700),
 ('infant-spirit','two-or-more',1400)
) as v(item_code,sub_code,price)
where s.item_id=i.id and i.code=v.item_code and s.code=v.sub_code;

-- 需要新增選項的主項目。若「改名／公司改名」尚不存在，先建立一筆供後台修改。
insert into public.booking_items(code,title,description,price,allow_quantity,option_mode,is_active,sort_order)
values ('rename-company','改名／公司改名','內容請至 Supabase 後台修改。',1200,false,'single_required',true,35)
on conflict(code) where code is not null do update set option_mode='single_required',is_active=true;

update public.booking_items set option_mode='single_required'
where code in ('naming','date-time-selection','marriage-bazi','rename-company');

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.sub_code,v.title,'內容請至 Supabase 後台修改。',i.price,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('naming','option-1','選項一',true,10),('naming','option-2','選項二',false,20),
 ('date-time-selection','option-1','選項一',true,10),('date-time-selection','option-2','選項二',false,20),
 ('marriage-bazi','option-1','選項一',true,20),('marriage-bazi','option-2','選項二',false,30),
 ('rename-company','option-1','選項一',true,10),('rename-company','option-2','選項二',false,20)
) as v(item_code,sub_code,title,is_default,sort_order) on i.code=v.item_code
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

create or replace function public.create_booking(p_method_id uuid,p_customer_name text,p_customer_phone text,p_line_user_id text,p_slot_start timestamptz,p_payment_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_method consultation_methods%rowtype; v_customer_id uuid; v_booking_id uuid; v_booking_no text; v_item jsonb; v_db_item booking_items%rowtype;
  v_detail_id uuid; v_sub_id uuid; v_sub sub_items%rowtype; v_qty integer; v_subtotal integer:=0; v_total integer:=0; v_slot_end timestamptz; v_unit_price integer; v_selected_sub_count integer;
begin
  if p_line_user_id is null or length(trim(p_line_user_id))<1 then raise exception '必須先完成 LINE 登入'; end if;
  if p_payment_method not in ('transfer','credit_card','line_pay') then raise exception '付款方式不正確'; end if;
  select * into v_method from consultation_methods where id=p_method_id and is_active for share;
  if not found then raise exception '諮詢方式不存在或未開放'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '至少選擇一個項目'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x join booking_items i on i.id=(x->>'item_id')::uuid where i.code='overall-fortune')
     and exists(select 1 from jsonb_array_elements(p_items) x join booking_items i on i.id=(x->>'item_id')::uuid where i.code='health')
  then raise exception '「整體運勢」已包含身體健康，請勿重複選購'; end if;
  if v_method.code='video' then
    if p_slot_start is null then raise exception '請選擇視訊時段'; end if;
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
grant execute on function public.create_booking(uuid,text,text,text,timestamptz,text,jsonb) to anon;

commit;
