import type { Metadata } from "next";
import "./globals.css";
import "./admin/admin.css";
import "./admin/v17.css";
import "./v18.css";
import "./v19.css";
import "./admin/v20.css";
import "./booking-data/style.css";
import "./staff/style.css";
import "./v25.css";
import "./v26.css";
import "./v27.css";
import "./v28.css";
import "./v29.css";
import "./v30.css";
import "./v31.css";
import "./shop.css";
import "./v32.css";
import "./v33.css";
import "./v34.css";
import "./v35.css";
import "./v36.css";

export const metadata: Metadata = {
  title: "林阿嫂線上諮詢預約",
  description: "文字與視訊諮詢預約系統",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
