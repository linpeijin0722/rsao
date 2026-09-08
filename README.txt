rsao v25 修正版

修正內容：
1. 個別日期名額讀取／儲存錯誤不再被忽略。
2. 手動退款後顯示灰色「手動取消」，付款狀態改為 refunded。
3. 手動退款後發送「預約已取消」LINE Flex 訊息。

重要：上傳程式後，必須到 Supabase SQL Editor 執行：
supabase/033_fix_text_capacity_date_overrides.sql

否則個別日期名額沒有資料表可儲存，重新整理後仍會消失。

驗證：npm run build 已通過。
