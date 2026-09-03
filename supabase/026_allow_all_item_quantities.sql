alter table public.booking_items alter column allow_quantity set default true;
update public.booking_items set allow_quantity = true where allow_quantity is distinct from true;
