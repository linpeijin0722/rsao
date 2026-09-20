import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { detectExternalConsultationResults, getExternalConsultationReply, listExternalConsultationDocuments, syncExternalQuickWriteButtons, writeExternalConsultationReply } from "@/lib/google-consultation-docs";

async function authorized() {
  return isAdminSession((await cookies()).get("admin_session")?.value);
}

export async function GET(request: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const documentId = request.nextUrl.searchParams.get("documentId") || "";
    if (documentId) return NextResponse.json({ ok: true, answer: await getExternalConsultationReply(documentId), detected: await detectExternalConsultationResults(documentId) });
    return NextResponse.json({ ok: true, documents: await listExternalConsultationDocuments() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法讀取 Google 諮詢單" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.action === "sync_buttons") {
      const site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      return NextResponse.json({ ok: true, ...(await syncExternalQuickWriteButtons(site)) });
    }
    const documentId = String(body.documentId || "").trim();
    const answer = String(body.answer || "").trim();
    if (!answer) return NextResponse.json({ error: "請先輸入阿嫂回答" }, { status: 400 });
    await writeExternalConsultationReply(documentId, answer);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "寫入 Google 諮詢單失敗" }, { status: 400 });
  }
}
