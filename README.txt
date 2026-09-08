rsao v26 修正版（包含 v25 必要檔案）

1. 完成填單的 LINE 順序固定為：
   用戶訊息「我已完成填單，姓名：...」→ 官方帳號「已收到」輪播。
2. 手動退款後，後台顯示灰色「手動退款」。
3. 手動退款完成後，官方帳號傳送「預約已取消」Flex。
4. 包含個別日期名額永久儲存修正。

重要：若尚未執行，請到 Supabase SQL Editor 執行：
supabase/033_fix_text_capacity_date_overrides.sql

驗證：npm run build 已通過。
