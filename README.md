# 林阿嫂預約系統

獨立的 Next.js + Supabase 預約網站，可部署到獨立的 Vercel Project。它不會使用台北子龍廟的資料庫或環境變數。

## 設定

1. 在「林阿嫂」的新 Supabase Project 開啟 SQL Editor，執行 `supabase/schema.sql` 全部內容。
   若已經執行過初版 SQL，接著再執行 `supabase/002_line_login_shared_items.sql`。
2. 複製 `.env.example` 為 `.env.local`，填入該 Project 的 URL 與 anon key。
3. 執行 `npm install`，再執行 `npm run dev`。
4. 到 Supabase 的 `availability` 新增老師開放時間；系統會依 25 分鐘自動切出時段。
5. 推送到獨立 GitHub repository，再於獨立 Vercel Project 匯入。

## Vercel 環境變數

在 Vercel Project Settings → Environment Variables 設定：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_LIFF_ID`
- `LINE_LOGIN_CHANNEL_ID`
- `SUPABASE_SERVICE_ROLE_KEY`（僅伺服器端使用）
- `LINE_SESSION_SECRET`（至少 32 個隨機字元）
請確認兩個值都來自「林阿嫂」Supabase Project。部署指令使用預設值即可：Build Command `npm run build`、Output 為 Next.js 預設。
