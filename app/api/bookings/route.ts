import { NextRequest, NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";
import { verifyLineSession } from "@/lib/line-session";
import { cookies } from "next/headers";
import { pushLineFlex } from "@/lib/line-message";

export async function POST(request: NextRequest) {
  try {
    const lineUid = verifyLineSession(
      (await cookies()).get("line_session")?.value,
    );
    if (!lineUid)
      return NextResponse.json(
        { error: "LINE 登入已失效，請重新登入" },
        { status: 401 },
      );
    const body = await request.json();
    if (
      !body.methodId ||
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      !body.paymentMethod
    ) {
      return NextResponse.json(
        { error: "請完整選擇諮詢項目與付款方式" },
        { status: 400 },
      );
    }
    const { data, error } = await publicSupabase().rpc("create_booking", {
      p_method_id: body.methodId,
      p_customer_name: "",
      p_customer_phone: "",
      p_line_user_id: lineUid,
      p_slot_start: body.slotStart || null,
      p_payment_method: body.paymentMethod,
      p_items: body.items,
    });
    if (error) throw error;
    try {
      const db = publicSupabase(),
        site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      const [{ data: method }, { data: selectedItems }] = await Promise.all([
        db
          .from("consultation_methods")
          .select("code")
          .eq("id", body.methodId)
          .single(),
        db
          .from("booking_items")
          .select("id,title")
          .in(
            "id",
            body.items.map((x: { item_id: string }) => x.item_id),
          ),
      ]);
      const deadline = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
      await pushLineFlex(lineUid, "林阿嫂預約待付款", {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#F7F7F7",
          contents: [
            {
              type: "text",
              text: "待付款",
              color: "#E64B45",
              weight: "bold",
              size: "xl",
              align: "center",
            },
            {
              type: "text",
              text: "林阿嫂",
              color: "#999999",
              align: "center",
              margin: "sm",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: `訂單編號：${data.booking_no}`,
              weight: "bold",
              wrap: true,
            },
            {
              type: "text",
              text: (selectedItems || []).map((x) => x.title).join("、"),
              wrap: true,
            },
            {
              type: "text",
              text: `金額：NT$ ${Number(data.total_price).toLocaleString("zh-TW")}`,
              color: "#E64B45",
              weight: "bold",
            },
            {
              type: "text",
              text: `請於 ${deadline} 前完成付款，超過24小時將自動失效。`,
              wrap: true,
              color: "#555555",
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
                label: "查看訂單狀態",
                uri: `${site}/my-bookings?order=${encodeURIComponent(data.booking_no)}`,
              },
            },
            {
              type: "button",
              style: "link",
                action: { type: "uri", label: "繼續付款", uri: `${site}/pay?order=${encodeURIComponent(data.booking_no)}` },
            },
          ],
        },
      });
    } catch (notificationError) {
      console.error(notificationError);
    }
    return NextResponse.json({ booking: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "預約建立失敗" },
      { status: 500 },
    );
  }
}
