-- 價目表文字與價格更正；已執行 042 的資料庫可直接執行本檔。
begin;

update public.sub_items s set
 title=case s.code
  when 'one-past-life' then '前一世概略說明+今生個性特質'
  when 'two-past-lives' then '前二世概略說明+今生個性特質'
  when 'three-past-lives' then '前三世概略說明+今生個性特質' end,
 price=case s.code when 'one-past-life' then 1500 when 'two-past-lives' then 2100 else 3000 end,
 is_active=true
from public.booking_items i
where s.item_id=i.id and i.code='past-life-personal'
  and s.code in ('one-past-life','two-past-lives','three-past-lives');

update public.booking_items set price=3000,option_mode='single_required',is_active=true
where code='past-life-relationship';
update public.sub_items s set
 title=case s.code
  when 'one-person' then '基本：你與一位對象的前世關係'
  when 'two-people' then '＋加購：你與兩位對象的前世關係'
  when 'three-people' then '＋加購：你與三位對象的前世關係' end,
 description=case s.code
  when 'one-person' then '基本：你與一位對象的前世關係'
  when 'two-people' then '＋加購：你與兩位對象的前世關係'
  when 'three-people' then '＋加購：你與三位對象的前世關係' end,
 price=case s.code when 'one-person' then 3000 when 'two-people' then 4500 else 6000 end,
 is_default=(s.code='one-person'),is_active=true
from public.booking_items i
where s.item_id=i.id and i.code='past-life-relationship'
  and s.code in ('one-person','two-people','three-people');

update public.booking_items set price=1800 where code='overall-fortune';

update public.sub_items s set
 title=case when s.code='one-group' then '一組（提供三個時間）' else '兩組（提供六個時間）' end,
 description=case when s.code='one-group' then '提供一組，共三個時間。' else '提供兩組，共六個時間。' end,
 is_active=true
from public.booking_items i
where s.item_id=i.id and i.code='date-time-selection'
  and s.code in ('one-group','two-groups');

update public.sub_items s set
 title=case when s.code='one' then '一位嬰靈' else '兩位嬰靈（含）以上' end,
 description=case when s.code='one' then '一位嬰靈' else '兩位嬰靈（含）以上' end,
 price=case when s.code='one' then 700 else 1400 end,
 is_active=true
from public.booking_items i
where s.item_id=i.id and i.code='infant-spirit'
  and s.code in ('one','two-or-more');

update public.sub_items s set
 title=case s.code
  when 'personal-romance' then '個人感情運（僅看自己）'
  when 'one-couple' then '雙人關係與緣份（看1位對象）'
  when 'one-extra-person' then '多對象比較緣份（看2位對象）'
  when 'two-extra-people' then '多對象比較緣份（看3位對象）' end,
 is_active=true
from public.booking_items i
where s.item_id=i.id and i.code='marriage-bazi'
  and s.code in ('personal-romance','one-couple','one-extra-person','two-extra-people');

select pg_notify('pgrst','reload schema');
commit;

select i.title,i.price,s.title as option_title,s.price as option_price
from public.booking_items i
left join public.sub_items s on s.item_id=i.id and s.is_active
where i.code in ('past-life-personal','past-life-relationship','overall-fortune',
                 'date-time-selection','infant-spirit','marriage-bazi')
order by i.sort_order,s.sort_order;
