import { NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = publicSupabase();
    const [{ data: methods, error: methodError }, { data: items, error: itemError }, { data: subItems, error: subError }] = await Promise.all([
      db.from("consultation_methods").select("id,code,title,description,duration_minutes,base_price,monthly_limit,reply_days,sort_order").eq("is_active", true).order("sort_order"),
      db.from("booking_items").select("id,consultation_method_id,title,description,price,allow_quantity,sort_order").eq("is_active", true).order("sort_order"),
      db.from("sub_items").select("id,item_id,title,description,price,sort_order").eq("is_active", true).order("sort_order"),
    ]);
    if (methodError || itemError || subError) throw methodError || itemError || subError;
    const merged = (items ?? []).map((item) => ({ ...item, sub_items: (subItems ?? []).filter((sub) => sub.item_id === item.id) }));
    return NextResponse.json({ methods, items: merged });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法讀取預約資料" }, { status: 500 });
  }
}
