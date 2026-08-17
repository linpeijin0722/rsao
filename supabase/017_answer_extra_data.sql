begin;
alter table public.booking_consultation_answers add column if not exists extra_data jsonb not null default '{}'::jsonb;
update public.sub_items s set title=case when s.code='option-1' then '公司命名' else '公司改名' end
from public.booking_items i where s.item_id=i.id and i.code='rename-company' and s.code in ('option-1','option-2');
commit;
