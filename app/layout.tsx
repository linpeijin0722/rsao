import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "林阿嫂線上諮詢預約",
  description: "文字與視訊諮詢預約系統",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
