-- 感情運勢與關係合盤：固定前台子項目顯示順序
update public.sub_items s
set sort_order = case
  when s.title = '只看一對' then 1
  when s.title like '加看一位對象%' then 2
  when s.title like '加看兩位對象%' then 3
  else s.sort_order
end
from public.booking_items i
where s.item_id = i.id
  and (i.code in ('marriage', 'marriage-bazi', 'relationship')
       or i.title = '感情運勢與關係合盤')
  and (s.title = '只看一對'
       or s.title like '加看一位對象%'
       or s.title like '加看兩位對象%');
