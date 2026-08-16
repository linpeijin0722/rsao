import type { Metadata } from "next";
import "./globals.css";
import "./admin/admin.css";
import "./admin/v17.css";
import "./v18.css";
import "./v19.css";
import "./admin/v20.css";
import "./booking-data/style.css";
import "./staff/style.css";
import "./shop.css";

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
