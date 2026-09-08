rsao v28.1－Vercel 路徑修正版

Vercel 失敗原因：GitHub 根目錄多出 website 資料夾，造成新舊兩套 TypeScript 同時編譯。

處理方式：
1. 刪除 GitHub 專案根目錄內誤上傳的整個 website 資料夾。
2. 本修正版壓縮檔內的 app、lib 資料夾要直接放在專案根目錄，合併並覆蓋同名檔案。
3. 不要再建立 website 外層資料夾。
4. Google Apps Script 的 Code.gs 不要上傳到 GitHub，請在 Apps Script 網站單獨更新。

修正後本機 npm run build 已通過。
