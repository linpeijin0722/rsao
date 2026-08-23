import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex } from "@/lib/line-message";
export async function POST(r: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { bookingNo } = await r.json(),
    { data: b } = await adminSupabase()
      .from("bookings")
      .select("booking_no,customers(line_user_id)")
      .eq("booking_no", bookingNo)
      .single();
  if (!b) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  const c = b.customers as unknown as { line_user_id: string },
    site = process.env.NEXT_PUBLIC_SITE_URL || r.nextUrl.origin;
  await pushLineFlex(c.line_user_id, "請填寫諮詢者資料", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "請填寫諮詢者資料", weight: "bold", size: "xl" },
        {
          type: "text",
          text: `訂單編號：${bookingNo}`,
          wrap: true,
          margin: "md",
        },
        {
          type: "text",
          text: "您的預約尚未完成諮詢者資料，請點擊下方按鈕填寫。",
          wrap: true,
          margin: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#8A3045",
          action: {
            type: "uri",
            label: "立即填寫資料",
            uri: `${site}/booking-data?order=${encodeURIComponent(bookingNo)}`,
          },
        },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
