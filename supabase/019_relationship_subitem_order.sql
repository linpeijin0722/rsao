-- 感情運勢與關係合盤：固定前台子項目顯示順序
update public.sub_items s
set sort_order = case
  when s.code = 'personal-romance' then 10
  when s.code = 'one-couple' then 20
  when s.code = 'one-extra-person' then 30
  when s.code = 'two-extra-people' then 40
  else s.sort_order
end
from public.booking_items i
where s.item_id = i.id
  and (i.code in ('marriage', 'marriage-bazi', 'relationship')
       or i.title = '感情運勢與關係合盤')
  and s.code in ('personal-romance','one-couple','one-extra-person','two-extra-people');
