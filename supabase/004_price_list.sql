-- 林阿嫂價目表（依 2026-08-15 Excel 整理）
-- 可重複執行；會停用舊項目，再啟用本價目表項目。
-- 價格假設：
-- 1.「前世因果（個人）」三種深度皆為 1,500 元。
-- 2.「前世因果（與他人前世關係）」每人 1,500 元：1人 1,500、2人 3,000、3人 4,500。

begin;

alter table public.booking_items add column if not exists code text;
alter table public.booking_items add column if not exists option_mode text not null default 'none';
alter table public.booking_items drop constraint if exists booking_items_option_mode_check;
alter table public.booking_items add constraint booking_items_option_mode_check
  check (option_mode in ('none','single_required','multiple_optional'));
create unique index if not exists booking_items_code_unique on public.booking_items(code) where code is not null;

alter table public.sub_items add column if not exists code text;
alter table public.sub_items add column if not exists is_default boolean not null default false;
create unique index if not exists sub_items_item_code_unique on public.sub_items(item_id,code) where code is not null;

update public.booking_items set is_active=false;

insert into public.booking_items(code,title,description,price,allow_quantity,option_mode,is_active,sort_order)
values
('past-life-personal','前世因果（個人）','了解業因與果報、個人特質、累世福德與本命走向。請於下方選擇要查看的前世範圍。',1500,false,'single_required',true,10),
('past-life-relationship','前世因果（與他人前世關係）','查看自己與指定對象的前世關係。請依要查看的人數選擇方案。',1500,false,'single_required',true,20),
('naming','命名','依照命格分析；姓名提供六個，公司名稱提供三個。每增加一組加收1,200元。',1200,true,'none',true,30),
('date-time-selection','擇日／擇時','選擇良辰吉日，可用於剖腹時辰、結婚、房屋買賣、開張、搬家、入厝或下葬，提供三個日期。',1200,false,'none',true,40),
('overall-fortune','整體運勢','可詢問學業、官司、財運、事業與流年運勢，以及本命特質、行運、貴人、關卡等。',700,false,'none',true,50),
('lawsuit-benefactor','官司／是否有貴人','了解可如何尋求協助、是否有貴人及過關機會。',700,false,'none',true,60),
('marriage-bazi','合婚、合八字','查看與特定對象是否為正緣、是否適合結婚；基本方案包含兩位。',1200,false,'multiple_optional',true,70),
('personal-romance','個人感情運','查看正緣、紅鸞星何時出現，以及子嗣相關問題。',800,false,'none',true,80),
('health','身體健康','了解身體有哪些地方需要注意。',700,false,'none',true,90),
('spiritual-interference','外靈干擾','查看是否有沖煞或外靈干擾，並提供尋求協助的建議。',800,false,'none',true,100),
('deceased-relative','過世親人','了解親人目前情況、是否投胎，以及是否需要為親人做些什麼。',700,false,'none',true,110),
('home-energy','陽宅','查看住宅整體氣場、與諮詢者是否適合及注意事項；不包含住宅風水改造指引。',800,false,'none',true,120),
('infant-spirit','嬰靈','了解無緣孩子目前情況、是否投胎，以及依個案提供需求建議。',700,false,'single_required',true,130)
on conflict(code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 allow_quantity=excluded.allow_quantity,option_mode=excluded.option_mode,is_active=true,sort_order=excluded.sort_order;

-- 重新整理本價目表管理的規格選項。
delete from public.sub_items s using public.booking_items i
where s.item_id=i.id and i.code in ('past-life-personal','past-life-relationship','marriage-bazi','infant-spirit')
and not exists(select 1 from public.booking_detail_sub_items d where d.sub_item_id=s.id);

insert into public.sub_items(item_id,code,title,description,price,is_default,is_active,sort_order)
select i.id,v.code,v.title,v.description,v.price,v.is_default,true,v.sort_order
from public.booking_items i
join (values
 ('past-life-personal','one-past-life','今生＋前一世','查看今生與前一世',0,true,10),
 ('past-life-personal','two-past-lives','今生＋前二世','查看今生與前一、前二世',0,false,20),
 ('past-life-personal','three-past-lives','今生＋前三世','查看今生與前一、前二、前三世',0,false,30),
 ('past-life-relationship','one-person','1人','查看與1位指定對象的前世關係',0,true,10),
 ('past-life-relationship','two-people','2人','查看與2位指定對象的前世關係',1500,false,20),
 ('past-life-relationship','three-people','3人','查看與3位指定對象的前世關係',3000,false,30),
 ('marriage-bazi','one-extra-person','增加1人','基本方案兩位，再增加一位',600,false,10),
 ('infant-spirit','one','一位','查看一位，總價700元',0,true,10),
 ('infant-spirit','two-or-more','兩位以上','查看兩位以上，總價1,400元',700,false,20)
) as v(item_code,code,title,description,price,is_default,sort_order) on i.code=v.item_code
on conflict(item_id,code) where code is not null do update set
 title=excluded.title,description=excluded.description,price=excluded.price,
 is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;

commit;

-- 檢查結果
select i.sort_order,i.title,i.price,i.option_mode,
       s.title as option_title,s.price as option_extra_price,s.is_default
from public.booking_items i
left join public.sub_items s on s.item_id=i.id and s.is_active
where i.is_active
order by i.sort_order,s.sort_order;
