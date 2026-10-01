-- Run this whole file in the reservation project's Supabase SQL Editor.
begin;
alter table public.booking_details add column if not exists unit_group_id uuid;
alter table public.booking_details add column if not exists unit_number integer not null default 1;
alter table public.booking_details add column if not exists unit_count integer not null default 1;
create or replace function public.ensure_deceased_relative_units(p_booking_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare d record; sub record; new_id uuid; n integer; qty integer; split_count integer:=0;
begin
 -- One booking lock makes repeated calls and concurrent form opens idempotent.
 perform 1 from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 for d in select bd.* from public.booking_details bd join public.booking_items bi on bi.id=bd.item_id
  where bd.booking_id=p_booking_id and bi.code='deceased-relative' and bd.quantity>1 for update of bd
 loop
  qty:=d.quantity;
  update public.booking_details set quantity=1,line_total=d.line_total/qty+d.line_total%qty,
   unit_group_id=d.id,unit_number=1,unit_count=qty where id=d.id;
  for n in 2..qty loop
   insert into public.booking_details(booking_id,item_id,item_title,unit_price,quantity,line_total,created_at,unit_group_id,unit_number,unit_count)
    values(d.booking_id,d.item_id,d.item_title,d.unit_price,1,d.line_total/qty,d.created_at+n*interval '1 microsecond',d.id,n,qty) returning id into new_id;
   -- Each unit gets its own sub-item references; answers are NOT copied.
   for sub in select * from public.booking_detail_sub_items where booking_detail_id=d.id loop
    insert into public.booking_detail_sub_items(booking_detail_id,sub_item_id,sub_item_title,unit_price,quantity,line_total)
     values(new_id,sub.sub_item_id,sub.sub_item_title,sub.unit_price,1,sub.line_total/qty);
   end loop;
  end loop;
  update public.booking_detail_sub_items set quantity=1,line_total=line_total/qty+line_total%qty where booking_detail_id=d.id;
  split_count:=split_count+qty-1;
 end loop;
 -- The first person's saved answer stays attached to the original detail.
 -- A previously submitted booking must collect the remaining people's data.
 if split_count>0 then update public.bookings set data_submitted_at=null,updated_at=now() where id=p_booking_id; end if;
 return split_count;
end $$;
revoke all on function public.ensure_deceased_relative_units(uuid) from public,anon,authenticated;
grant execute on function public.ensure_deceased_relative_units(uuid) to service_role;
commit;
