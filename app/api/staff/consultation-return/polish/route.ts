import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";

const styles: Record<string, string> = {
  auto: "依照諮詢項目自動選擇最合適的語氣",
  warm: "溫和親切，像老師親自向客人說明",
  direct: "清楚直接、肯定明確，但不恐嚇或誇大",
  folk: "保留傳統民俗與命理語感，表達自然、不故弄玄虛",
  concise: "精簡重點，刪除重複語句，但不得遺漏任何結論",
  caring: "安撫關懷，語氣柔和，適合感情、健康、生死相關內容",
};

function itemGuidance(title: string) {
  if (/擇日|擇時/.test(title)) return "此為擇日／擇時內容：日期、時辰、吉凶與禁忌必須原樣保留，語氣可明確有民俗感。";
  if (/前世|嬰靈|過世|往生|寵物/.test(title)) return "此為前世或逝者相關內容：語氣莊重、體貼，不渲染恐懼。";
  if (/感情|合婚|八字|婚姻/.test(title)) return "此為感情內容：語氣溫和清楚，不替當事人做絕對承諾。";
  if (/健康|身體/.test(title)) return "此為健康內容：保留原判斷，但不得新增診斷、治療或取代專業醫療的說法。";
  if (/運勢|流年/.test(title)) return "此為運勢內容：保留命理語感與時間點，整理成清楚易讀的段落。";
  if (/命名|改名/.test(title)) return "此為命名內容：保留姓名、用字、五行與所有理由，不可自行新增名字。";
  return "依照原項目內容整理語句，維持老師原本的判斷與口吻。";
}

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY" }, { status: 500 });
  try {
    const body = await request.json();
    const content = String(body.content || "").trim();
    const itemTitle = String(body.itemTitle || "諮詢結果").trim();
    const style = styles[String(body.style || "auto")] || styles.auto;
    if (!content) return NextResponse.json({ error: "沒有可潤飾的內容" }, { status: 400 });
    if (content.length > 18000) return NextResponse.json({ error: "內容過長，請分項潤飾" }, { status: 400 });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_POLISH_MODEL || "gpt-5-mini",
        instructions: [
          "你是台灣繁體中文編輯，只負責潤飾諮詢結果。",
          "只能改善語句通順、標點、段落與一致性，不可新增、刪除或扭曲任何事實與結論。",
          "姓名、稱謂、日期、時間、年齡、金額、地點、數量、吉凶、時辰、注意事項必須完整保留。",
          "不得自行增加命理判斷、醫療建議、保證、恐嚇、推銷或免責聲明。",
          "一律使用台灣繁體中文，不使用簡體字。不要加前言、說明、標題或引號，只輸出潤飾後全文。",
          `指定語氣：${style}。`,
          itemGuidance(itemTitle),
        ].join("\n"),
        input: `諮詢項目：${itemTitle}\n\n原文：\n${content}`,
        max_output_tokens: 6000,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "AI 潤飾失敗");
    const polished = (result.output || [])
      .flatMap((entry: any) => Array.isArray(entry.content) ? entry.content : [])
      .filter((entry: any) => entry.type === "output_text" && typeof entry.text === "string")
      .map((entry: any) => entry.text)
      .join("\n")
      .trim();
    if (!polished) throw new Error("AI 沒有回傳文字，請再試一次");
    return NextResponse.json({ ok: true, polished });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 潤飾失敗" }, { status: 400 });
  }
}
