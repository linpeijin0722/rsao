import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { deliverPreparedConsultationReturn, type PreparedConsultationReturn } from "@/lib/consultation-return-delivery";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  const db = adminSupabase();
  const { data: jobs, error } = await db.from("consultation_return_schedules")
    .select("id,payload,attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  let sent = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const job of jobs || []) {
    const { data: claimed } = await db.from("consultation_return_schedules")
      .update({ status: "sending", attempts: Number(job.attempts || 0) + 1, last_error: null })
      .eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const result = await deliverPreparedConsultationReturn(job.payload as PreparedConsultationReturn, site);
      await db.from("consultation_return_schedules").update({ status: "sent", sent_at: result.returnedAt }).eq("id", job.id);
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "排程傳送失敗";
      const attempts = Number(job.attempts || 0) + 1;
      await db.from("consultation_return_schedules").update({ status: attempts >= 3 ? "failed" : "pending", last_error: message }).eq("id", job.id);
      failed.push({ id: job.id, error: message });
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
