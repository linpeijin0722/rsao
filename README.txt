功能：每天台灣時間上午 9 點，更新一筆獨立的系統保活紀錄。

不會修改訂單、付款、客戶或諮詢內容，也不會傳送任何 LINE 訊息。

安裝順序：

1. 將 app、supabase、vercel.json 依相同路徑覆蓋到林阿嫂網站專案。
2. 到林阿嫂 Supabase 的 SQL Editor 執行：
   supabase/037_system_heartbeat.sql
3. 確認 Vercel 已設定 CRON_SECRET。
4. 提交並部署網站。
5. 部署後可在 Vercel → Settings → Cron Jobs 看到 /api/cron/keep-alive。

檢查是否成功：

在 Supabase Table Editor 打開 system_heartbeat，last_ping_at 每天會更新，ping_count 每天加 1。
