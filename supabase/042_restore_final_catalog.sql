-- 復原正式價目表：可重複執行，不破壞既有訂單。
begin;

-- 個人前世因果：三種正式方案與完整售價。
update public.booking_items
set title='前世因果（個人）',
    description='依查看範圍了解前世概況與今生個性特質。',
    price=1500, option_mode='single_required', is_active=true, sort_order=10
where code='past-life-personal';

update public.sub_items s set is_active=false
from public.booking_items i
where s.item_id=i.id and i.code='past-life-personal';

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.code,v.title,v.description,v.price,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('one-past-life','前世因果（個人）｜前一世概略說明+今生個性特質','前一世概略說明＋今生個性特質',1500,true,10),
 ('two-past-lives','前世因果（個人）｜前二世概略說明+今生個性特質','前二世概略說明＋今生個性特質',2100,false,20),
 ('three-past-lives','前世因果（個人）｜前三世概略說明+今生個性特質','前三世概略說明＋今生個性特質',3000,false,30)
) as v(code,title,description,price,is_default,sort_order) on true
where i.code='past-life-personal'
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

-- 命名：合併新生兒、個人及公司命名／改名，四種皆為 1,200 元。
update public.booking_items
set title='命名',
    description='提供新生兒、個人及公司的命名或改名服務。',
    price=1200, option_mode='single_required', is_active=true, sort_order=30
where code='naming';

update public.booking_items set is_active=false where code='rename-company';

update public.sub_items s set is_active=false
from public.booking_items i
where s.item_id=i.id and i.code in ('naming','rename-company');

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.code,v.title,v.description,1200,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('newborn-naming','新生兒命名','依生辰命格提供適合的新生兒名字。',true,10),
 ('personal-rename','個人改名','依個人命格提供合適的改名建議。',false,20),
 ('company-naming','公司命名','依經營方向提供合適的公司名稱。',false,30),
 ('company-rename','公司改名','依公司命格與經營方向提供改名建議。',false,40)
) as v(code,title,description,is_default,sort_order) on true
where i.code='naming'
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

-- 擇日／擇時：一組三個日期、兩組六個日期。
update public.booking_items
set title='擇日／擇時',
    description='選擇良辰吉日，可選一組三個日期或兩組六個日期。',
    price=1200, option_mode='single_required', is_active=true, sort_order=40
where code='date-time-selection';

update public.sub_items s set is_active=false
from public.booking_items i
where s.item_id=i.id and i.code='date-time-selection';

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.code,v.title,v.description,v.price,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('one-group','一組（三個日期）','提供一組，共三個日期。',1200,true,10),
 ('two-groups','兩組（六個日期）','提供兩組，共六個日期。',2400,false,20)
) as v(code,title,description,price,is_default,sort_order) on true
where i.code='date-time-selection'
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

-- 感情運勢與關係合盤：合併舊的兩個主項目。
update public.booking_items
set title='感情運勢與關係合盤',
    description='查看個人桃花正緣，或分析雙方感情與婚姻緣分。',
    price=800, option_mode='single_required', is_active=true, sort_order=70
where code='marriage-bazi';
update public.booking_items set is_active=false where code='personal-romance';

update public.sub_items s set is_active=false
from public.booking_items i
where s.item_id=i.id and i.code='marriage-bazi';

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.code,v.title,v.description,v.price,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('personal-romance','個人感情運','查看個人桃花、正緣時機及感情發展。',800,true,10),
 ('one-couple','只看一對','分析自己與一位對象的感情及婚姻緣分。',1200,false,20),
 ('one-extra-person','加看一位對象','比較自己與兩位對象的感情緣分。',1800,false,30),
 ('two-extra-people','加看兩位對象','比較自己與三位對象的感情緣分。',2400,false,40)
) as v(code,title,description,price,is_default,sort_order) on true
where i.code='marriage-bazi'
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

-- 補回過世寵物。
insert into public.booking_items
 (code,title,description,price,allow_quantity,option_mode,is_active,sort_order)
values
 ('deceased-pet','過世寵物','了解過世寵物目前情況，以及是否有想傳達的訊息。',700,true,'none',true,115)
on conflict(code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 allow_quantity=excluded.allow_quantity,option_mode=excluded.option_mode,
 is_active=true,sort_order=excluded.sort_order;

select pg_notify('pgrst','reload schema');
commit;

-- 執行完成後顯示正式價目表與啟用中的子項目。
select i.sort_order,i.code,i.title,i.description,i.price,
       s.sort_order as option_order,s.title as option_title,s.price as option_price
from public.booking_items i
left join public.sub_items s on s.item_id=i.id and s.is_active
where i.is_active
order by i.sort_order,s.sort_order;
