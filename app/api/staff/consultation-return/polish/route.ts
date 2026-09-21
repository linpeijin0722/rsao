import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";

const polishInstructions = `整理以下內容時，請嚴格遵守以下規則：

1. 完整保留原意
完全不要改變原本的意思，也不要自行解讀、延伸或補充內容。

2. 可以稍微潤飾
可以將一些較制式的句子，改得更口語化，像真人講話。主要修正明顯錯字、明顯打錯的字、明顯不合理的標點及制式化句子。

3. 主詞保持一致
原文使用什麼主詞，就維持原本的主詞，不要自行替換。例如原本寫「自己」，就維持「自己」；不要自行改成「我」、「他」、「她」或「你」。即使前後看起來可以換成其他稱呼，也不要自行修改。

4. 只調整標點與斷句
主要透過標點符號和斷句，讓內容更容易閱讀。可以補充或調整逗號、句號、頓號、問號、冒號等標點；將過長的句子適當斷開；合併不必要的斷句；依照語意重新安排句子的停頓位置。但不能因為調整斷句而改變原本的文字或意思。

5. 相關內容整理在同一段
將前後屬於同一件事情、同一個脈絡或同一個意思的內容整理在同一段。不要一句一段，也不要把一個完整的意思切得太零碎。不同事情或不同主題，再適當分段。

6. 可以微幅刪減內容
內容重複、看起來多餘，主詞太多重複，明顯錯字，可以微幅修改內容。

7. 不要自行增加內容
不要補充原文沒有提到的資訊、解釋、形容詞或結論。如果原文沒有說，就不要自己加。

8. 不要改變原本的說話方式
保留口語。原文如果有比較直接、簡單或重複的說法，也不要自行修飾成書面語。此為口語諮詢結果。這次的目的不是把文章「寫得更漂亮」，而是把原本內容整理得更清楚、更好閱讀。

9. 年紀統一使用阿拉伯數字
凡是表示年紀的數字，統一使用阿拉伯數字。例如：「得年四十五歲」改成「得年45歲」、「四十歲」改成「40歲」、「三十幾歲」改成「30幾歲」。其他不是表示年紀的數字，不要任意更改格式。

10. 最終檢查
確認原本意思沒有改變、沒有增加內容、沒有自行改變主詞、沒有任意替換原文字，只有修正明顯錯字、標點、斷句與段落，年紀已統一使用阿拉伯數字。

總原則：寧可保留原文，也不要過度修改。這次是「整理原文」，不是重新寫作。

另外檢查疑似語音輸入錯誤：
- 只有與整篇內容明顯完全無關、可高度確定是語音辨識雜訊的句子，才可從 polishedContent 刪除，並在 suspectedIssues 中以 action="removed" 完整列出原句與原因。
- 只要無法高度確定，就必須保留在 polishedContent，並以 action="kept" 提醒人工確認。
- 人名、稱謂、日期、時間、地址、生肖、年紀、親屬關係，即使看起來奇怪也不可擅自刪除，只能保留並提醒。
- changeSummary 只簡單列出實際做過的整理，不得聲稱未做過的修改。`;

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY" }, { status: 500 });
  try {
    const body = await request.json();
    const content = String(body.content || "").trim();
    if (!content) return NextResponse.json({ error: "沒有可潤飾的內容" }, { status: 400 });
    if (content.length > 18000) return NextResponse.json({ error: "內容過長，請分項潤飾" }, { status: 400 });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_POLISH_MODEL || "gpt-5-mini",
        instructions: polishInstructions,
        input: `請整理以下原文：\n\n${content}`,
        text: { format: {
          type: "json_schema", name: "consultation_polish_result", strict: true,
          schema: {
            type: "object", additionalProperties: false,
            properties: {
              polishedContent: { type: "string" },
              changeSummary: { type: "array", items: { type: "string" } },
              suspectedIssues: { type: "array", items: {
                type: "object", additionalProperties: false,
                properties: { originalText: { type: "string" }, action: { type: "string", enum: ["removed", "kept"] }, reason: { type: "string" } },
                required: ["originalText", "action", "reason"],
              } },
            },
            required: ["polishedContent", "changeSummary", "suspectedIssues"],
          },
        } },
        max_output_tokens: 7000,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "AI 潤飾失敗");
    const outputText = (result.output || []).flatMap((entry: any) => Array.isArray(entry.content) ? entry.content : []).filter((entry: any) => entry.type === "output_text" && typeof entry.text === "string").map((entry: any) => entry.text).join("").trim();
    const parsed = JSON.parse(outputText || "{}");
    const polished = String(parsed.polishedContent || "").trim();
    if (!polished) throw new Error("AI 沒有回傳文字，請再試一次");
    return NextResponse.json({
      ok: true, polished,
      changeSummary: Array.isArray(parsed.changeSummary) ? parsed.changeSummary.map(String).filter(Boolean) : [],
      suspectedIssues: Array.isArray(parsed.suspectedIssues) ? parsed.suspectedIssues.map((issue: any) => ({ originalText: String(issue?.originalText || ""), action: issue?.action === "removed" ? "removed" : "kept", reason: String(issue?.reason || "") })).filter((issue: any) => issue.originalText) : [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 潤飾失敗" }, { status: 400 });
  }
}
