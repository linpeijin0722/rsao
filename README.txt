本次修正內容

1.「確認傳送」後可選擇「立即傳送」或「排程傳送」。
2. 排程日期與時間分開選擇，時間僅接受 00／30 分。
3. 排程每 30 分鐘執行一次，不使用 Vercel 的每分鐘排程。
4. 立即傳送與排程傳送都會顯示完整的最後確認內容。
5. 上午 7:00 前或晚上 9:00 後會顯示醒目的非服務時段提醒。
6. 單純開啟回傳頁面不會修改諮詢單，也不會新增「上次回傳時間」。
7. 只有訊息實際送出後，才會更新紅色按鈕及唯一一行上次回傳時間。

上傳方式

請將本資料夾內的 app、lib、supabase 依照相同路徑覆蓋到網站專案，不需要上傳本 README.txt。

Supabase 設定順序

1. 在 Supabase 的 SQL Editor 執行 supabase/035_consultation_return_schedules.sql。
2. 在 Supabase Vault 建立兩個秘密值：
   rsao_site_url = https://rsao-virid.vercel.app
   rsao_cron_secret = 與 Vercel 環境變數 CRON_SECRET 完全相同的值
3. 再執行 supabase/036_consultation_return_cron_setup.sql。

注意：若沒有完成 Supabase 的三個設定步驟，排程資料會保存，但到時間不會自動發送。
