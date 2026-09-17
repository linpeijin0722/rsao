import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import {
  isQuickReplyToken,
  makeQuickReplyToken,
} from "@/lib/quick-reply-token";
import { adminSupabase } from "@/lib/supabase";
import {
  getQuickReplyQuestionSlots,
  getQuickReplySectionSlots,
  normalizeConsultationReturnText,
  upsertQuickConsultationQuestionReplies,
  upsertQuickConsultationSectionReplies,
} from "@/lib/google-consultation-docs";

const one = (value: any) => (Array.isArray(value) ? value[0] : value);
const asArray = (value: any): any[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const clean = (value: any) => String(value || "").trim();
const loveBuiltInOptions = [
  {
    id: "virtual-love-trend-better",
    code: "love_trend_getting_better",
    label: "感情發展會漸入佳境",
    sort_order: 119,
    is_active: true,
  },
  {
    id: "virtual-love-advice-social",
    code: "advice_expand_social",
    label: "多認識新朋友",
    sort_order: 301,
    is_active: true,
  },
  {
    id: "virtual-love-advice-natural",
    code: "advice_natural_interaction",
    label: "保持自然互動",
    sort_order: 302,
    is_active: true,
  },
  {
    id: "virtual-love-advice-observe",
    code: "advice_observe_slowly",
    label: "放慢腳步觀察",
    sort_order: 303,
    is_active: true,
  },
  {
    id: "virtual-love-advice-self",
    code: "advice_care_for_self",
    label: "先照顧好自己",
    sort_order: 304,
    is_active: true,
  },
];
const loveBuiltInCopy: Record<string, string> = {
  love_trend_getting_better:
    "感情方面會慢慢進入比較好的狀態，不用急著要求馬上有結果，照著自己的步調往前，後面的發展會比現在順一些。",
  advice_expand_social:
    "可以多認識一些新朋友，讓自己的生活圈自然擴大，接觸的人變多之後，也比較容易遇到真正適合自己的對象。",
  advice_natural_interaction:
    "和別人相處時保持自然就好，不需要刻意迎合或急著表現，先讓彼此舒服地互動，反而比較容易看清楚適不適合。",
  advice_observe_slowly:
    "感情上可以放慢一點，多花時間觀察對方的個性與做事方式，確定彼此真的合適之後再往前，會比較穩定。",
  advice_care_for_self:
    "現階段可以先把自己的生活照顧好，讓心情和生活都穩定下來；當自己的狀態越來越好，也會更容易吸引到適合的人。",
};
const overallBuiltInOptions = [
  {
    id: "virtual-deity-wangmu",
    code: "deity_wangmu",
    label: "王母娘娘",
    sort_order: 29,
    is_active: true,
  },
  {
    id: "virtual-deity-relation-affinity",
    code: "deity_relation_affinity",
    label: "有緣",
    sort_order: 81,
    is_active: true,
  },
  {
    id: "virtual-deity-relation-protect",
    code: "deity_relation_protect",
    label: "在護著",
    sort_order: 82,
    is_active: true,
  },
  {
    id: "virtual-deity-relation-guide",
    code: "deity_relation_guide",
    label: "有指引",
    sort_order: 83,
    is_active: true,
  },
  {
    id: "virtual-overall-steady",
    code: "status_overall_steady",
    label: "運勢平穩",
    sort_order: 101,
    is_active: true,
  },
  {
    id: "virtual-overall-better",
    code: "status_overall_better",
    label: "慢慢轉好",
    sort_order: 102,
    is_active: true,
  },
  {
    id: "virtual-overall-rising",
    code: "status_overall_rising",
    label: "運勢漸旺",
    sort_order: 103,
    is_active: true,
  },
  {
    id: "virtual-overall-sweet",
    code: "status_overall_sweet",
    label: "先苦後甘",
    sort_order: 104,
    is_active: true,
  },
  {
    id: "virtual-overall-help",
    code: "status_overall_help",
    label: "貴人助力增加",
    sort_order: 105,
    is_active: true,
  },
  {
    id: "virtual-overall-chance",
    code: "status_overall_chance",
    label: "機會慢慢出現",
    sort_order: 106,
    is_active: true,
  },
  {
    id: "virtual-overall-busy",
    code: "status_overall_busy",
    label: "忙中有收穫",
    sort_order: 107,
    is_active: true,
  },
  {
    id: "virtual-overall-adjust",
    code: "status_overall_adjust",
    label: "需要調整步調",
    sort_order: 108,
    is_active: true,
  },
  {
    id: "virtual-overall-hold",
    code: "status_overall_hold",
    label: "目前宜守成",
    sort_order: 109,
    is_active: true,
  },
  {
    id: "virtual-overall-break",
    code: "status_overall_break",
    label: "即將突破關卡",
    sort_order: 110,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-steady",
    code: "advice_overall_steady",
    label: "穩住自己",
    sort_order: 201,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-focus",
    code: "advice_overall_focus",
    label: "先處理眼前事情",
    sort_order: 202,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-patience",
    code: "advice_overall_patience",
    label: "保持耐心",
    sort_order: 203,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-plan",
    code: "advice_overall_plan",
    label: "做好規劃再行動",
    sort_order: 204,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-rest",
    code: "advice_overall_rest",
    label: "適度休息調整",
    sort_order: 205,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-help",
    code: "advice_overall_help",
    label: "善用身邊資源",
    sort_order: 206,
    is_active: true,
  },
  ...[
    ["recent_positive_windfall", "有偏財運"],
    ["recent_positive_support", "有貴人相助"],
    ["recent_positive_progress", "工作有進展"],
    ["recent_positive_news", "近期有好消息"],
    ["recent_negative_car", "有車關"],
    ["recent_negative_blood", "血光之災"],
    ["recent_negative_surgery", "容易開刀"],
    ["recent_negative_loss", "容易破財"],
  ].map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`,
    code,
    label,
    sort_order: 301 + index,
    is_active: true,
  })),
  ...[
    ["recent_detail_minor", "小傷無大礙"],
    ["recent_detail_life", "可能有生命危險"],
    ["recent_detail_daily", "可能影響日常生活"],
    ["recent_detail_recovery", "需要一段時間恢復"],
    ["recent_detail_check", "宜及早檢查處理"],
    ["recent_detail_caution", "提高警覺即可避開"],
    ["recent_advice_medical", "先就醫檢查，不延誤處理"],
    ["recent_advice_traffic", "交通往來放慢並注意安全"],
    ["recent_advice_rest", "避免疲勞並維持規律作息"],
    ["recent_advice_blood", "民俗上可至信任宮廟請示破血"],
    ["recent_advice_prayer", "民俗上可祈福、安太歲或點平安燈"],
    ["recent_advice_charity", "行善布施並迴向祈求平安"],
  ].map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`,
    code,
    label,
    sort_order: 321 + index,
    is_active: true,
  })),
  ...[
    ["body_headache", "容易頭痛"],
    ["body_dizziness", "容易頭暈"],
    ["body_sleep", "睡眠品質不穩"],
    ["body_eyes", "眼睛容易疲勞"],
    ["body_neck", "肩頸容易痠痛"],
    ["body_back", "腰背容易不舒服"],
    ["body_stomach", "腸胃較敏感"],
    ["body_cold", "體質比較寒"],
    ["body_allergy", "容易過敏"],
    ["body_breath", "呼吸道較敏感"],
    ["body_circulation", "循環比較不好"],
    ["body_pressure", "血壓需要留意"],
    ["body_liver", "肝膽代謝需要留意"],
    ["body_kidney", "泌尿與腎臟需要留意"],
    ["body_joint", "關節容易不舒服"],
    ["body_fatigue", "容易疲倦、精神較差"],
    ["body_female_gynecology", "婦科需要留意"],
    ["body_female_cycle", "生理期與荷爾蒙需要留意"],
    ["body_male_prostate", "攝護腺需要留意"],
    ["body_male_urinary", "男性泌尿狀況需要留意"],
  ].map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`,
    code,
    label,
    sort_order: 401 + index,
    is_active: true,
  })),
];
const overallBuiltInCopy: Record<string, string> = {
  status_overall_steady:
    "整體的運勢算是平穩，沒有什麼太大的問題，只是很多事情不會一下子就看到結果，慢慢做、穩穩來，反而比較容易把事情做好。",
  status_overall_better:
    "前一段時間可能會覺得事情比較卡，做什麼都不是很順，不過現在運勢有慢慢往好的方向走，接下來會比之前輕鬆一些，有些事情也會開始慢慢有進展。",
  status_overall_rising:
    "現在的運勢有慢慢起來，但不會突然一下子就大旺，而是慢慢累積起來。只要自己不要太急，接下來會越來越順。",
  status_overall_sweet:
    "這段時間可能會比較辛苦一點，很多事情都要自己處理，也比較容易覺得累，但是後面的運勢會慢慢拉起來，不用太擔心。",
  status_overall_help:
    "接下來身邊的貴人助力會比之前明顯，有些原本只能自己處理的事情，慢慢會有人願意提供意見或幫忙。",
  status_overall_chance:
    "目前新的機會正在慢慢出現，雖然一開始不一定很明顯，但只要多留意身邊的變化，會找到適合自己的方向。",
  status_overall_busy:
    "最近事情會比較多，也容易覺得忙碌，不過這些付出不會白費，後面可以慢慢看到成果。",
  status_overall_adjust:
    "目前不是運勢不好，而是做事的步調需要稍微調整。不要每件事都急著一次完成，分清楚先後順序會更順。",
  status_overall_hold:
    "現階段比較適合先把手上的事情顧好，不需要急著做太大的變動。基礎穩定之後，再往下一步走會比較安全。",
  status_overall_break:
    "現在已經慢慢走到轉折的位置，原本卡住的事情有機會出現突破口，再多堅持一下，後面會比目前順利。",
  advice_overall_steady:
    "現在比較重要的不是一直往外衝，而是先把自己的生活、工作和心情穩下來。先把眼前的事情處理好，後面的路會慢慢清楚。",
  advice_overall_focus:
    "先把眼前最重要的事情一件一件處理好，不需要同時顧太多方向；事情有順序之後，心裡也會比較安定。",
  advice_overall_patience:
    "目前做事情需要多一點耐心，有些結果只是還沒有到時間，不代表沒有進展，穩穩做下去會比較有利。",
  advice_overall_plan:
    "遇到重要決定時可以先做好規劃，把可能的狀況想清楚再行動，會比一時衝動更容易得到好的結果。",
  advice_overall_rest:
    "最近如果覺得心累或身體比較疲倦，要記得留一點時間休息。自己的狀態調整好，做事情才不容易一直卡住。",
  advice_overall_help:
    "有些事情不用全部自己扛，可以多聽聽身邊可靠的人怎麼看，也可以善用現有的資源，會讓事情推進得更順。",
  recent_positive_windfall: "最近有一些偏財機會，可以多留意額外收入或意外出現的小收穫，但仍要量力而為。",
  recent_positive_support: "最近的貴人運比較明顯，遇到問題時容易有人提供意見或伸手幫忙。",
  recent_positive_progress: "最近工作上的事情會慢慢有進展，原本卡住的地方也比較有機會往前推動。",
  recent_positive_news: "近期有機會收到好消息，等待中的事情也可能慢慢出現比較明朗的結果。",
  recent_negative_car: "最近交通往來要多留意，開車、騎車或過馬路時都不要搶快。",
  recent_negative_blood: "最近有血光方面的提醒，日常活動與使用尖銳物品時要提高警覺。",
  recent_negative_surgery: "最近有動手術或接受侵入性處置的可能，若身體不舒服要及早檢查並依醫師判斷處理。",
  recent_negative_loss: "最近金錢上比較容易有額外支出，投資、借貸與大筆消費都要再確認清楚。",
  recent_detail_minor: "整體看起來以小傷為主，注意處理即可，不需要過度恐慌。",
  recent_detail_life: "這項提醒較為明顯，需要嚴肅看待安全問題；若有身體症狀，應立即尋求醫療協助。",
  recent_detail_daily: "這個狀況可能暫時影響日常生活，應預留休息與處理的時間。",
  recent_detail_recovery: "後續可能需要一段時間恢復，這段期間不要勉強自己過度活動。",
  recent_detail_check: "建議及早安排合格醫療檢查，把實際原因確認清楚。",
  recent_detail_caution: "只要近期提高警覺、避免冒險，多數風險都有機會避開。",
  recent_advice_medical: "實際身體狀況仍要以合格醫療人員的檢查與判斷為準，不要延誤就醫。",
  recent_advice_traffic: "這段時間交通往來要放慢速度，避免疲勞駕駛，也不要為了趕時間冒險。",
  recent_advice_rest: "最近要避免過度疲勞，維持規律作息，讓精神與反應保持穩定。",
  recent_advice_blood: "若有民俗信仰，也可以到自己信任的宮廟請示破血等祈安方式；這不能取代醫療處理。",
  recent_advice_prayer: "若有民俗信仰，可依自己的信仰祈福、安太歲或點平安燈，讓心情安定一些。",
  recent_advice_charity: "平常可以行善布施並迴向祈求平安，同時把現實中的安全措施做好。",
  body_headache: "身體方面要留意頭痛或頭部緊繃的情況。",
  body_dizziness: "身體方面要留意頭暈、精神不集中或突然無力的情況。",
  body_sleep: "最近要留意睡眠品質，避免長期熬夜或作息混亂。",
  body_eyes: "眼睛比較容易疲勞，使用手機或電腦時要適度休息。",
  body_neck: "肩頸比較容易緊繃痠痛，平常要留意姿勢並適度活動。",
  body_back: "腰背容易不舒服，搬重物或久坐時要多加注意。",
  body_stomach: "腸胃比較敏感，飲食時間與刺激性食物要多留意。",
  body_cold: "體質比較偏寒，平常要注意保暖與規律作息。",
  body_allergy: "比較容易出現過敏狀況，要留意環境、飲食與季節變化。",
  body_breath: "呼吸道比較敏感，空氣品質不好或換季時要多加留意。",
  body_circulation: "循環狀況需要留意，避免久坐，也要安排適度活動。",
  body_pressure: "血壓方面需要定期留意，有異常時要及早諮詢醫療人員。",
  body_liver: "肝膽與代謝方面需要留意，應避免長期熬夜與過量飲酒。",
  body_kidney: "泌尿與腎臟方面需要留意，有不適時應及早檢查。",
  body_joint: "關節比較容易不舒服，活動時要循序漸進，不要突然過度用力。",
  body_fatigue: "最近比較容易疲倦、精神較差，要留意是否休息不足。",
  body_female_gynecology: "婦科方面需要多留意，若有持續不適應安排婦科檢查。",
  body_female_cycle: "生理期與荷爾蒙狀況需要留意，異常或持續不適時要及早就醫。",
  body_male_prostate: "攝護腺方面需要留意，若有排尿異常應安排檢查。",
  body_male_urinary: "男性泌尿狀況需要留意，有持續不適時應及早就醫。",
};
const historyMatchesItem = (content: any, itemCode: string) =>
  itemCode === "deceased-relative"
    ? !/【\s*過世寵物\s*】/u.test(clean(content))
    : itemCode === "deceased-pet"
      ? !/【\s*過世親人\s*】/u.test(clean(content))
      : true;
const previousDeceasedLocation = (value: any) => {
  const text = clean(value).replace(/\s+/g, "");
  const reborn = text.match(
    /(?:目前|現在)?(?:已經)?(?:投胎|轉世)(?:成為|成|為)?([^，。！？\n]{1,16})/,
  );
  if (reborn) return { text: `已投胎成為${reborn[1]}`, rank: 5 };
  if (/枉死城/.test(text)) return { text: "在枉死城", rank: 0 };
  const hall = text.match(/(?:目前|現在)?在?地府(?:第)?([一二三四1234])殿/);
  if (hall) {
    const ranks: Record<string, number> = {
        一: 1,
        "1": 1,
        二: 2,
        "2": 2,
        三: 3,
        "3": 3,
        四: 4,
        "4": 4,
      },
      names: Record<string, string> = {
        一: "第一殿",
        "1": "第一殿",
        二: "第二殿",
        "2": "第二殿",
        三: "第三殿",
        "3": "第三殿",
        四: "第四殿",
        "4": "第四殿",
      };
    return { text: `在地府${names[hall[1]]}`, rank: ranks[hall[1]] };
  }
  return null;
};
const profilePresentation = (profile: any, ownerName: string) => {
  if (!profile)
    return {
      profileLines: [],
      locationSubject: "祂",
      genderPronoun: "祂",
      isPet: false,
    };
  const isPet = profile.profile_type === "pet",
    name = clean(profile.name),
    detail = clean(profile.relationship_detail),
    relationship =
      detail ||
      (profile.relationship === "本人" ? "本人" : clean(profile.relationship)),
    relation =
      relationship === "本人"
        ? "本人"
        : `${ownerName || "用戶"}的${relationship || "親友"}`;
  const lunar = clean(profile.lunar_birth_text),
    rocYear = Number(lunar.match(/民國\s*(\d+)/)?.[1]),
    birthYear = rocYear
      ? rocYear + 1911
      : Number(clean(profile.birth_date).match(/^(\d{4})/)?.[1]),
    age = birthYear ? Math.max(1, new Date().getFullYear() - birthYear + 1) : 0,
    shichen = clean(profile.birth_shichen).split(/[（(]/)[0],
    gender = clean(profile.gender),
    zodiac = clean(profile.zodiac),
    address = clean(profile.address || profile.full_address);
  const profileLines = [
    `姓名：${name}${gender ? `／${gender}` : ""}${relation ? `（${relation}）` : ""}${age ? `　虛歲：${age}歲` : ""}`,
    lunar
      ? `農曆生日：${lunar}${shichen ? `（${shichen}）` : ""}${zodiac ? `　生肖：${zodiac}` : ""}`
      : "",
    address ? `居住地址：${address}` : "",
  ].filter(Boolean);
  return {
    profileLines,
    locationSubject: isPet
      ? name || "毛孩"
      : relationship && relationship !== "本人"
        ? relationship
        : name || "祂",
    genderPronoun: gender.includes("女")
      ? "她"
      : gender.includes("男")
        ? "他"
        : "祂",
    isPet,
  };
};

async function context(bookingNo: string, requestedDocumentId = "") {
  const db = adminSupabase();
  const { data: booking, error } = await db
    .from("bookings")
    .select(
      "id,customer_id,booking_no,customers(line_display_name,full_name),booking_details(id,item_id,created_at,item_title,google_document_id,google_document_url,booking_items(code),booking_detail_sub_items(sub_item_title),booking_consultation_answers(profile_id,questions,extra_data,consultation_profiles(*)))",
    )
    .eq("booking_no", bookingNo)
    .single();
  if (error || !booking) throw new Error("找不到這筆預約");
  const details = asArray(booking.booking_details).sort((a: any, b: any) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );
  const documentDetail =
    details.find(
      (detail: any) => detail.google_document_id === requestedDocumentId,
    ) || details.find((detail: any) => detail.google_document_id);
  if (!documentDetail?.google_document_id)
    throw new Error("這筆預約尚未建立 Google 諮詢單");
  const ownerNameForQuestions = clean(
      one(booking.customers)?.full_name ||
        one(booking.customers)?.line_display_name,
    ),
    questionMeta = details
      .flatMap((detail: any) =>
        asArray(detail.booking_consultation_answers).flatMap((answer: any) => {
          const profile = one(answer.consultation_profiles),
            presentation = profilePresentation(profile, ownerNameForQuestions);
          return asArray(answer.questions).map((question: any) => ({
            question: String(question || "").trim(),
            itemCode: one(detail.booking_items)?.code || "",
            itemTitle: detail.item_title || "",
            profileName: clean(profile?.name),
            profileLines: presentation.profileLines,
          }));
        }),
      )
      .filter((entry: any) => entry.question);
  let questionSlots = (
    await getQuickReplyQuestionSlots(documentDetail.google_document_id)
  ).map((slot, index) => ({
    ...slot,
    itemCode: questionMeta[index]?.itemCode || "",
    itemTitle: questionMeta[index]?.itemTitle || "",
    profileName: questionMeta[index]?.profileName || "",
    profileLines: questionMeta[index]?.profileLines || [],
    manualOnly: String(questionMeta[index]?.itemCode || "").startsWith(
      "past-life-",
    ),
  }));
  if (!questionSlots.length) {
    const fallback = details
      .flatMap((detail: any) =>
        asArray(detail.booking_consultation_answers).flatMap((answer: any) =>
          asArray(answer.questions),
        ),
      )
      .map((question: any) => String(question || "").trim())
      .filter(Boolean);
    questionSlots = fallback.map((question: string, slotIndex: number) => ({
      slotIndex,
      questionNumber: slotIndex + 1,
      question,
      answer: "",
      itemCode: questionMeta[slotIndex]?.itemCode || "",
      itemTitle: questionMeta[slotIndex]?.itemTitle || "",
      profileName: questionMeta[slotIndex]?.profileName || "",
      profileLines: questionMeta[slotIndex]?.profileLines || [],
      manualOnly: String(questionMeta[slotIndex]?.itemCode || "").startsWith(
        "past-life-",
      ),
    }));
  }
  const { data: topics, error: topicError } = await db
    .from("quick_reply_topics")
    .select(
      "id,code,title,icon,keywords,sort_order,quick_reply_options(id,code,label,sort_order,is_active)",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (topicError)
    throw new Error(
      topicError.message.includes("quick_reply_topics")
        ? "尚未建立快速諮詢回覆資料表，請先執行本次提供的 Supabase SQL"
        : topicError.message,
    );
  const normalizedTopics = (topics || []).map((topic: any) => {
    const options = asArray(topic.quick_reply_options).filter(
      (option: any) => option.is_active,
    );
    const builtIns =
      topic.code === "love"
        ? loveBuiltInOptions
        : topic.code === "overall"
          ? overallBuiltInOptions
          : [];
    for (const option of builtIns)
      if (!options.some((entry: any) => entry.code === option.code))
        options.push(option);
    return {
      ...topic,
      options: options.sort((a: any, b: any) => a.sort_order - b.sort_order),
    };
  });
  const itemTopic: Record<string, string> = {
    "infant-spirit": "infant_spirit",
    "deceased-relative": "deceased",
    "deceased-pet": "deceased_pet",
    "spiritual-interference": "spiritual",
    "home-energy": "home",
    "overall-fortune": "overall",
    "personal-romance": "love",
    "marriage-bazi": "love",
    health: "health",
    "lawsuit-benefactor": "lawsuit",
    naming: "naming_result",
    "date-time-selection": "date_result",
  };
  const recommendedByQuestion = Object.fromEntries(
    questionSlots.map((slot) => {
      const fromItem = itemTopic[slot.itemCode],
        fromWords = normalizedTopics
          .filter((topic: any) =>
            asArray(topic.keywords).some((keyword: string) =>
              slot.question
                .toLocaleLowerCase("zh-TW")
                .includes(String(keyword).toLocaleLowerCase("zh-TW")),
            ),
          )
          .map((topic: any) => topic.code);
      return [
        String(slot.slotIndex),
        slot.manualOnly
          ? []
          : Array.from(new Set([fromItem, ...fromWords].filter(Boolean))),
      ];
    }),
  );
  const ownerName = clean(
      one(booking.customers)?.full_name ||
        one(booking.customers)?.line_display_name,
    ),
    inputLabels: Record<string, string> = {
      current_condition: "目前的困擾或遺憾",
      social_lifestyle: "目前的社交與生活型態",
      interference_situation: "目前受到干擾的情況",
      interference_duration: "持續多久",
      home_purpose: "本次諮詢的主要目的",
      home_problem: "目前住起來最困擾的問題",
      preferred_characters: "喜歡的字／讀音",
      name_style: "名字風格",
      name_taboo: "避開的字／諧音",
      naming_notes: "其他備註",
      baby_surname: "希望姓氏",
      core_question: "最想詢問的問題",
      situation: "目前情況",
      notes: "其他補充",
    },
    sectionMeta = details.flatMap((detail: any) => {
      const answer = one(detail.booking_consultation_answers),
        profile = one(answer?.consultation_profiles),
        presentation = profilePresentation(profile, ownerName),
        extra = answer?.extra_data || {},
        requestLines = Object.entries(extra)
          .filter(
            ([key, value]) =>
              inputLabels[key] && clean(value) && typeof value !== "object",
          )
          .map(([key, value]) => `${inputLabels[key]}：${clean(value)}`),
        labels = [
          detail.item_title,
          ...asArray(detail.booking_detail_sub_items).map(
            (entry: any) => entry.sub_item_title,
          ),
        ].filter(Boolean);
      return labels.map((label: string) => ({
        label: String(label)
          .replace(/[【】]/g, "")
          .trim(),
        detailId: detail.id,
        itemId: detail.item_id,
        profileId: answer?.profile_id,
        itemCode: one(detail.booking_items)?.code || "",
        profile,
        profileName: clean(profile?.name),
        requestLines,
        ...presentation,
      }));
    });
  const historyEligible = sectionMeta.filter(
      (entry: any) =>
        ["deceased-relative", "deceased-pet"].includes(entry.itemCode) ||
        entry.itemCode.startsWith("past-life-"),
    ),
    historyItemIds = Array.from(
      new Set(
        historyEligible.map((entry: any) => entry.itemId).filter(Boolean),
      ),
    ),
    historyProfileIds = Array.from(
      new Set(
        historyEligible.map((entry: any) => entry.profileId).filter(Boolean),
      ),
    ),
    currentDetailIds = new Set(details.map((detail: any) => String(detail.id)));
  let histories: any[] = [];
  if (historyItemIds.length && historyProfileIds.length) {
    const { data: rows, error: historyError } = await db
      .from("consultation_result_history")
      .select(
        "booking_detail_id,item_id,profile_id,result_content,consultation_created_at,returned_at,booking_details(bookings(status,payment_status))",
      )
      .in("item_id", historyItemIds)
      .in("profile_id", historyProfileIds)
      .order("returned_at", { ascending: false });
    if (
      historyError &&
      !String(historyError.message || "").includes(
        "consultation_result_history",
      )
    )
      throw historyError;
    histories = (rows || []).filter(
      (row: any) =>
        one(one(row.booking_details)?.bookings)?.status !== "cancelled" &&
        one(one(row.booking_details)?.bookings)?.payment_status !== "failed",
    );
  }
  const formatHistoryDate = (value: any) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("zh-TW", {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "numeric",
          day: "numeric",
        })
          .format(date)
          .replace(/\//g, "/")
      : "";
  };
  const samePerson = (current: any, candidate: any) => {
    if (!current || !candidate) return false;
    if (String(current.id || "") === String(candidate.id || "")) return true;
    const currentName = clean(current.name).replace(/\s+/g, ""),
      candidateName = clean(candidate.name).replace(/\s+/g, "");
    if (!currentName || currentName !== candidateName) return false;
    const currentPet = current.profile_type === "pet",
      candidatePet = candidate.profile_type === "pet";
    if (currentPet !== candidatePet) return false;
    const currentRelation = clean(
        current.relationship_detail || current.relationship,
      ),
      candidateRelation = clean(
        candidate.relationship_detail || candidate.relationship,
      );
    return (
      !currentRelation ||
      !candidateRelation ||
      currentRelation === candidateRelation
    );
  };
  const quickReplyLocationByProfile = new Map<
    string,
    { date: string; text: string }
  >();
  if (
    booking.customer_id &&
    historyEligible.some((entry: any) => entry.itemCode === "deceased-relative")
  ) {
    const { data: oldBookings, error: oldBookingsError } = await db
      .from("bookings")
      .select(
        "id,created_at,status,payment_status,booking_details(item_id,item_title,booking_items(code),booking_consultation_answers(profile_id,consultation_profiles(*)))",
      )
      .eq("customer_id", booking.customer_id)
      .neq("id", booking.id)
      .neq("status", "cancelled")
      .neq("payment_status", "failed")
      .order("created_at", { ascending: false });
    if (oldBookingsError) throw oldBookingsError;
    const oldIds = asArray(oldBookings)
      .map((entry: any) => entry.id)
      .filter(Boolean);
    if (oldIds.length) {
      const { data: oldReplies, error: oldRepliesError } = await db
        .from("booking_quick_replies")
        .select("booking_id,final_answer,updated_at")
        .in("booking_id", oldIds)
        .order("updated_at", { ascending: false });
      if (oldRepliesError) throw oldRepliesError;
      const replyByBooking = new Map(
        asArray(oldReplies).map((entry: any) => [
          String(entry.booking_id),
          entry,
        ]),
      );
      for (const meta of historyEligible.filter(
        (entry: any) => entry.itemCode === "deceased-relative",
      )) {
        const currentProfile = meta.profile;
        for (const oldBooking of asArray(oldBookings)) {
          const matchingDetail = asArray(oldBooking.booking_details).find(
            (detail: any) =>
              one(detail.booking_items)?.code === "deceased-relative" &&
              asArray(detail.booking_consultation_answers).some((answer: any) =>
                samePerson(currentProfile, one(answer.consultation_profiles)),
              ),
          );
          const saved = replyByBooking.get(String(oldBooking.id));
          if (!matchingDetail || !saved?.final_answer) continue;
          const block =
            clean(saved.final_answer).match(
              /【\s*過世親人\s*】([\s\S]*?)(?=\n【|$)/u,
            )?.[1] || "";
          const location = previousDeceasedLocation(block);
          if (location) {
            quickReplyLocationByProfile.set(String(meta.profileId), {
              date: formatHistoryDate(
                saved.updated_at || oldBooking.created_at,
              ),
              text: location.text,
            });
            break;
          }
        }
      }
    }
  }
  const formatDate = (value: any) => {
      const date = new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat("zh-TW", {
            timeZone: "Asia/Taipei",
            year: "numeric",
            month: "numeric",
            day: "numeric",
          })
            .format(date)
            .replace(/\//g, "/")
        : "";
    },
    previousSummaries = historyEligible
      .map((entry: any) => {
        const row = histories.find(
          (history: any) =>
            !currentDetailIds.has(String(history.booking_detail_id)) &&
            String(history.item_id) === String(entry.itemId) &&
            String(history.profile_id) === String(entry.profileId) &&
            historyMatchesItem(history.result_content, entry.itemCode),
        );
        if (!row?.result_content) return null;
        const content = clean(row.result_content).replace(/^【[^】]+】\s*/, ""),
          date = formatDate(row.consultation_created_at || row.returned_at);
        let excerpt = "";
        if (["deceased-relative", "deceased-pet"].includes(entry.itemCode)) {
          const sentences = content
            .split(/[。！？\n]+/)
            .map((value: string) => value.trim())
            .filter(Boolean);
          excerpt =
            sentences.find((value: string) =>
              /(現在在|目前已投胎|在地府|在枉死城|奈何橋)/.test(value),
            ) || "";
          if (excerpt) excerpt += "。";
        } else {
          const first =
            content
              .split(/[。！？\n]+/)
              .map((value: string) => value.trim())
              .find(Boolean) || "";
          excerpt = `${Array.from(first).slice(0, 20).join("")}${Array.from(first).length > 20 ? "..." : ""}`;
        }
        return excerpt
          ? {
              itemCode: entry.itemCode,
              itemTitle: entry.label,
              date,
              text: `${date}上次諮詢結果：${excerpt}`,
            }
          : null;
      })
      .filter(Boolean)
      .filter(
        (entry: any, index: number, all: any[]) =>
          all.findIndex(
            (candidate: any) =>
              candidate.itemCode === entry.itemCode &&
              candidate.text === entry.text,
          ) === index,
      );
  const rawSectionSlots = await getQuickReplySectionSlots(
      documentDetail.google_document_id,
    ),
    usedMeta = new Set<number>();
  const sectionSlots = rawSectionSlots
    .map((slot) => {
      let metaIndex = sectionMeta.findIndex(
        (entry: any, index: number) =>
          !usedMeta.has(index) && entry.label === slot.label,
      );
      if (metaIndex < 0 && /整體建議|流年運勢|整體運勢/.test(slot.label))
        metaIndex = sectionMeta.findIndex(
          (entry: any, index: number) =>
            !usedMeta.has(index) && entry.itemCode === "overall-fortune",
        );
      if (metaIndex < 0)
        metaIndex = sectionMeta.findIndex(
          (entry: any, index: number) =>
            !usedMeta.has(index) &&
            (slot.label.includes(entry.label) ||
              entry.label.includes(slot.label)),
        );
      if (metaIndex < 0) {
        const remaining = sectionMeta
          .map((_: any, index: number) => index)
          .filter((index: number) => !usedMeta.has(index));
        if (remaining.length === 1) metaIndex = remaining[0];
      }
      if (metaIndex < 0) return null;
      usedMeta.add(metaIndex);
      const meta = sectionMeta[metaIndex],
        itemCode = meta.itemCode || "",
        previousRow =
          itemCode === "deceased-relative"
            ? histories.find(
                (history: any) =>
                  !currentDetailIds.has(String(history.booking_detail_id)) &&
                  String(history.item_id) === String(meta.itemId) &&
                  String(history.profile_id) === String(meta.profileId) &&
                  historyMatchesItem(history.result_content, itemCode),
              )
            : null,
        historyLocation = previousRow
          ? previousDeceasedLocation(previousRow.result_content)
          : null,
        fallbackLocation = quickReplyLocationByProfile.get(
          String(meta.profileId),
        ),
        location =
          historyLocation ||
          (fallbackLocation && previousDeceasedLocation(fallbackLocation.text)),
        previousLocation = location
          ? {
              date: historyLocation
                ? formatDate(
                    previousRow.consultation_created_at ||
                      previousRow.returned_at,
                  )
                : fallbackLocation?.date || "",
              name: meta.profileName || meta.locationSubject || "亡者",
              text: location.text,
              rank: location.rank,
            }
          : null;
      return {
        ...slot,
        label: meta.label,
        itemCode,
        profileName: meta.profileName || "",
        profileLines: meta.profileLines || [],
        requestLines: meta.requestLines || [],
        locationSubject:
          itemCode === "infant-spirit" ? "寶寶" : meta.locationSubject || "祂",
        genderPronoun: meta.genderPronoun || "祂",
        isPet: itemCode === "deceased-pet",
        previousLocation,
        manualOnly:
          itemCode.startsWith("past-life-") || /前世|綜觀今生/.test(meta.label),
      };
    })
    .filter(Boolean) as any[];
  const recommendedBySection = Object.fromEntries(
    sectionSlots.map((slot) => [
      String(slot.slotIndex),
      slot.manualOnly
        ? []
        : [
            itemTopic[slot.itemCode] ||
              normalizedTopics.find((topic: any) =>
                asArray(topic.keywords).some((keyword: string) =>
                  slot.label.includes(String(keyword)),
                ),
              )?.code,
          ].filter(Boolean),
    ]),
  );
  const { data: saved, error: savedError } = await db
    .from("booking_quick_replies")
    .select("question_replies,section_replies,updated_at")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (savedError)
    throw new Error(
      savedError.message.includes("question_replies")
        ? "請先執行新版快速諮詢回覆 Supabase SQL"
        : savedError.message,
    );
  const savedReplies =
    saved?.question_replies && typeof saved.question_replies === "object"
      ? saved.question_replies
      : {};
  const savedSections =
    saved?.section_replies && typeof saved.section_replies === "object"
      ? saved.section_replies
      : {};
  const questionReplies = Object.fromEntries(
    questionSlots.map((slot) => {
      const existing = savedReplies[String(slot.slotIndex)] || {};
      return [
        String(slot.slotIndex),
        {
          selections: existing.selections || {},
          phraseIds: existing.phraseIds || [],
          answer: existing.answer || slot.answer || "",
          completed: existing.completed === true,
        },
      ];
    }),
  );
  const optionTopicById = new Map(
    normalizedTopics.flatMap((topic: any) =>
      topic.options.map(
        (option: any) => [String(option.id), topic.code] as const,
      ),
    ),
  );
  const sectionReplies = Object.fromEntries(
    sectionSlots.map((slot) => {
      const existing = savedSections[String(slot.slotIndex)] || {},
        expected = String(
          recommendedBySection[String(slot.slotIndex)]?.[0] || "",
        ),
        originalIds = asArray(existing.optionIds).map(String),
        optionIds = originalIds.filter(
          (id: string) => !expected || optionTopicById.get(id) === expected,
        ),
        contaminated = originalIds.length !== optionIds.length;
      return [
        String(slot.slotIndex),
        {
          optionIds,
          phraseIds: contaminated
            ? []
            : asArray(existing.phraseIds).map(String),
          answer: contaminated ? "" : existing.answer || slot.answer || "",
          completed: contaminated ? false : existing.completed === true,
        },
      ];
    }),
  );
  return {
    db,
    booking,
    customer: one(booking.customers) || {},
    documentDetail,
    questionSlots,
    sectionSlots,
    topics: normalizedTopics,
    recommendedByQuestion,
    recommendedBySection,
    questionReplies,
    sectionReplies,
    previousSummaries,
    updatedAt: saved?.updated_at || null,
  };
}

function pick<T extends { id: string }>(values: T[], previous: Set<string>) {
  const alternatives = values.filter((value) => !previous.has(value.id)),
    pool = alternatives.length ? alternatives : values;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export async function GET(request: NextRequest) {
  try {
    const bookingNo = request.nextUrl.searchParams.get("bookingNo") || "",
      documentId = request.nextUrl.searchParams.get("documentId") || "",
      token = request.nextUrl.searchParams.get("token") || "",
      admin = isAdminSession((await cookies()).get("admin_session")?.value),
      data = await context(bookingNo, documentId);
    if (!admin && token && !isQuickReplyToken(token, bookingNo, documentId))
      return NextResponse.json({ error: "連結驗證失敗" }, { status: 401 });
    const accessToken = makeQuickReplyToken(bookingNo, documentId);
    return NextResponse.json({
      ok: true,
      accessToken,
      bookingNo: data.booking.booking_no,
      customerName:
        data.customer.full_name ||
        data.customer.line_display_name ||
        "LINE 用戶",
      questions: data.questionSlots,
      sections: data.sectionSlots,
      topics: data.topics,
      recommendedByQuestion: data.recommendedByQuestion,
      recommendedBySection: data.recommendedBySection,
      questionReplies: data.questionReplies,
      sectionReplies: data.sectionReplies,
      previousSummaries: data.previousSummaries,
      updatedAt: data.updatedAt,
      documentId: data.documentDetail.google_document_id,
      documentUrl:
        data.documentDetail.google_document_url ||
        `https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "讀取快速回覆失敗" },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(),
      data = await context(
        String(body.bookingNo || ""),
        String(body.documentId || ""),
      );
    const admin = isAdminSession((await cookies()).get("admin_session")?.value);
    if (
      !admin &&
      !isQuickReplyToken(
        String(body.accessToken || ""),
        String(body.bookingNo || ""),
        String(body.documentId || ""),
      )
    )
      return NextResponse.json(
        { error: "連結驗證失敗，請重新從 Google 諮詢單開啟" },
        { status: 401 },
      );
    if (body.mode === "compose" || body.mode === "compose_section") {
      const selections =
          body.selections && typeof body.selections === "object"
            ? body.selections
            : {},
        valid: {
          topicCode: string;
          optionId: string;
          optionCode: string;
          optionLabel: string;
        }[] = [];
      if (body.mode === "compose_section") {
        for (const optionId of asArray(body.optionIds).map(String)) {
          for (const topic of data.topics) {
            const option = topic.options.find(
              (entry: any) => entry.id === optionId,
            );
            if (option)
              valid.push({
                topicCode: topic.code,
                optionId: option.id,
                optionCode: option.code,
                optionLabel: option.label,
              });
          }
        }
      } else
        for (const [topicCode, selectedCodes] of Object.entries(selections)) {
          const topic = data.topics.find(
            (entry: any) => entry.code === topicCode,
          );
          for (const optionCode of asArray(selectedCodes).map(String)) {
            const option = topic?.options.find(
              (entry: any) => entry.code === optionCode,
            );
            if (option)
              valid.push({
                topicCode,
                optionId: option.id,
                optionCode: option.code,
                optionLabel: option.label,
              });
          }
        }
      if (body.mode === "compose_section") {
        const expected = String(
          data.recommendedBySection[String(body.sectionSlotIndex)]?.[0] || "",
        );
        for (let index = valid.length - 1; index >= 0; index -= 1)
          if (expected && valid[index].topicCode !== expected)
            valid.splice(index, 1);
      }
      if (!valid.length)
        return NextResponse.json(
          { error: "請先選擇這個問題的判斷結果" },
          { status: 400 },
        );
      const optionIds = valid.map((entry) => entry.optionId),
        databaseOptionIds = optionIds.filter(
          (id) => !id.startsWith("virtual-"),
        ),
        previous = new Set(asArray(body.previousPhraseIds).map(String));
      const phraseQuery = data.db
        .from("quick_reply_phrases")
        .select("id,option_id,content")
        .eq("is_active", true)
        .eq("phrase_type", "judgment");
      const { data: phrases, error } = databaseOptionIds.length
        ? await phraseQuery.in("option_id", databaseOptionIds)
        : { data: [], error: null };
      if (error) throw new Error(error.message);
      const optionCodes = new Set(
          valid.map((selection) => selection.optionCode),
        ),
        combineLotusIngot =
          optionCodes.has("assistance_lotus") &&
          optionCodes.has("assistance_ingot"),
        scriptureRows = valid.filter((selection) =>
          selection.optionCode.startsWith("assistance_scripture_"),
        ),
        meetRows = valid.filter((selection) =>
          selection.optionCode.startsWith("meet_"),
        ),
        selfRows = valid.filter((selection) =>
          selection.optionCode.startsWith("self_personality_"),
        ),
        partnerRows = valid.filter((selection) =>
          selection.optionCode.startsWith("partner_personality_"),
        ),
        elementRows = valid.filter((selection) =>
          selection.optionCode.startsWith("element_"),
        ),
        deityRelationRows = valid.filter((selection) =>
          selection.optionCode.startsWith("deity_relation_"),
        ),
        deityRows = valid.filter(
          (selection) =>
            selection.optionCode.startsWith("deity_") &&
            !selection.optionCode.startsWith("deity_relation_") &&
            selection.optionCode !== "deity_custom",
        ),
        excluded = (selection: any) =>
          selection.optionCode === "location" ||
          selection.optionCode.startsWith("element_") ||
          selection.optionCode.startsWith("deity_") ||
          selection.optionCode.startsWith("assistance_scripture_") ||
          selection.optionCode.startsWith("meet_") ||
          selection.optionCode.startsWith("self_personality_") ||
          selection.optionCode.startsWith("partner_personality_") ||
          (combineLotusIngot &&
            ["assistance_lotus", "assistance_ingot"].includes(
              selection.optionCode,
            )),
        chosen = valid
          .filter((selection) => !excluded(selection))
          .map((selection) =>
            selection.optionId.startsWith("virtual-")
              ? {
                  id: selection.optionId,
                  content:
                    loveBuiltInCopy[selection.optionCode] ||
                    overallBuiltInCopy[selection.optionCode] ||
                    "",
                }
              : pick(
                  (phrases || []).filter(
                    (entry: any) => entry.option_id === selection.optionId,
                  ),
                  previous,
                ),
          )
          .filter((entry: any) => entry?.content) as any[],
        locationSelected = valid.some(
          (selection) => selection.optionCode === "location",
        ),
        customLocation = clean(body.customLocation),
        locationSubject = clean(body.locationSubject) || "祂",
        reincarnatedAs = clean(body.reincarnatedAs),
        locationMode = clean(body.locationMode),
        locationSentence = locationSelected
          ? locationMode === "reincarnated" && reincarnatedAs
            ? `目前已投胎成一個${reincarnatedAs}，`
            : customLocation
              ? `${locationSubject}現在在${customLocation}。`
              : ""
          : "";
      const subject = clean(body.locationSubject) || "祂",
        pronoun = clean(body.genderPronoun) || "祂",
        deity = clean(body.customDeity) || "神佛",
        visitTarget = clean(body.visitTarget) || "親友",
        customVisitReason = clean(body.customVisitReason),
        vary = (value: string) => {
          const variants: [[RegExp, string, string]] | any = [
            [/(目前)/g, "目前", "現在"],
            [/有空的時候/g, "有空的時候", "平常有空時"],
            [/不用太過擔心/g, "不用太過擔心", "可以稍微放心一些"],
          ];
          return variants.reduce(
            (text: any, [pattern, a, b]: any) =>
              Math.random() < 0.5
                ? text.replace(pattern, b)
                : text.replace(pattern, a),
            value,
          );
        },
        render = (value: any) =>
          vary(
            String(value || "")
              .replaceAll("{subject}", subject)
              .replaceAll("{pronoun}", pronoun)
              .replaceAll("{deity}", deity)
              .replaceAll("{visitTarget}", visitTarget)
              .replaceAll("{customVisitReason}", customVisitReason)
              .trim(),
          ),
        combinedHelp = combineLotusIngot
          ? [
              `${subject}目前還需要一些助力，有空的時候可以再多準備一些蓮花跟銀色元寶，燒化後迴向給${subject}，能補足目前比較欠缺的助力。`,
              `有空的時候可以幫${subject}一起準備蓮花跟銀色元寶，燒化後再迴向給${subject}，讓後面的路走得比較順。`,
              `蓮花跟銀色元寶可以一起多準備一些，有空的時候燒化再迴向給${subject}，對目前的狀況會有幫助。`,
            ][Math.floor(Math.random() * 3)]
          : "";
      const combinedScripture = scriptureRows.length
        ? `有空的時候可以唸${scriptureRows.map((row) => row.optionLabel).join("、")}，唸完再迴向給${subject}。`
        : "";
      const meetCopy: Record<string, string> = {
          meet_away: "離開平常熟悉的生活圈，反而比較容易遇到適合的對象。",
          meet_friend:
            "也可以多留意朋友介紹認識的人，先從自然相處開始，比較有機會慢慢發展成感情。",
          meet_at_work:
            "本身比較容易在工作上認識到對象，可能是因為工作往來、同事介紹，慢慢認識之後才發現彼此有感覺。",
          meet_online:
            "另外，也有可能是從網路上聊起來，兩個人剛好有共同的話題或興趣，慢慢聊熟之後才有進一步發展的機會。",
          meet_course:
            "有時候出去上課、進修，或是接觸一些新的東西，認識到的人反而比較有機會發展成感情。",
          meet_hobby:
            "也有可能是從共同的興趣開始，兩個人有話聊、相處起來比較自然，感情就會慢慢培養起來。",
          meet_gathering:
            "平常可以多參加聚會或活動，接觸不同的人，比較容易從自然互動中遇到適合的對象。",
          meet_daily:
            "其實不用特別跑到很遠的地方找，反而是在平常的生活圈裡，就有機會遇到適合的對象。",
        },
        meetSentence = meetRows
          .map((row, index) => {
            const value = meetCopy[row.optionCode] || "";
            return index === 0 ? value.replace(/^另外，/, "") : value;
          })
          .filter(Boolean)
          .join("");
      const selfName = clean(body.selfName) || "本人",
        partnerName = clean(body.partnerName) || "對方",
        personalLove = body.personalLove === true,
        pickRows = (rows: any[]) =>
          rows
            .map((row) =>
              pick(
                (phrases || []).filter(
                  (entry: any) => entry.option_id === row.optionId,
                ),
                previous,
              ),
            )
            .filter(Boolean) as any[],
        selfPhrases = pickRows(selfRows),
        partnerPhrases = pickRows(partnerRows),
        selfSentence = selfPhrases
          .map((entry, index) => {
            let value = render(entry.content);
            if (index === 0)
              return value
                .replace(/^你自己的/, `本身(${selfName})`)
                .replace(/^你的/, `本身(${selfName})的`)
                .replace(/^你/, `本身(${selfName})`);
            return value
              .replace(/^你自己的/, "")
              .replace(/^你的/, "")
              .replace(/^你/, "")
              .trim();
          })
          .join(" "),
        partnerSentence = partnerPhrases
          .map((entry, index) => {
            let value = render(entry.content);
            if (personalLove)
              return index === 0
                ? value
                    .replace(/^對方的個性/, "容易遇到的對象，個性")
                    .replace(/^對方/, "容易遇到的對象，")
                : value.replace(/^對方的?/, "").trim();
            return index === 0
              ? value.replace(/^對方/, `對方(${partnerName})`)
              : value;
          })
          .join(" ");
      const elementLabels = elementRows.map((row) => row.optionLabel),
        elementTraits: Record<string, string> = {
          金: "做事果斷，對專業和細節有要求",
          木: "想法多、有成長力，遇到事情願意往前試",
          水: "反應快、適應力強，做人做事比較靈活",
          火: "有行動力與執行力，決定之後就會直接去做",
          土: "個性穩定、責任感重，做事情比較踏實",
        },
        elementSentence = elementLabels.length
          ? `本命格屬${elementLabels.join("帶")}（個性${elementLabels
              .map((label) => elementTraits[label])
              .filter(Boolean)
              .join("，")}）。`
          : "";
      const deityLabels = [
          ...deityRows.map((row) => row.optionLabel),
          ...clean(body.customDeity)
            .split(/[、,，\s]+/)
            .filter(Boolean),
        ],
        uniqueDeities = Array.from(new Set(deityLabels)),
        relationCodes = new Set(deityRelationRows.map((row) => row.optionCode)),
        relationParts = [
          relationCodes.has("deity_relation_affinity")
            ? `與${uniqueDeities.join("、")}有緣`
            : "",
          relationCodes.has("deity_relation_protect")
            ? "也有在身邊護持著自己"
            : "",
          relationCodes.has("deity_relation_guide")
            ? "遇到事情時也會得到一些指引"
            : "",
        ].filter(Boolean),
        deitySentence = uniqueDeities.length
          ? relationParts.length
            ? `${relationParts.join("，")}，有空可以到大廟多拜${uniqueDeities[0]}，對自己會有最直接的助力。`
            : `有空可以多拜${uniqueDeities.join("、")}，對自己會有最直接的助力。`
          : "",
        answer = [
          locationSentence,
          elementSentence,
          deitySentence,
          meetSentence,
          selfSentence,
          partnerSentence,
          ...chosen.map((entry) => render(entry.content)),
          combinedHelp,
          combinedScripture,
        ]
          .filter(Boolean)
          .join(" ");
      if (locationSelected && !locationSentence)
        return NextResponse.json(
          {
            error:
              locationMode === "reincarnated"
                ? "請填寫現在投胎成什麼"
                : "請先選擇現在的位置",
          },
          { status: 400 },
        );
      if (!answer)
        return NextResponse.json(
          { error: "這些選項目前沒有可用句子" },
          { status: 400 },
        );
      return NextResponse.json({
        ok: true,
        answer,
        phraseIds: [...chosen, ...selfPhrases, ...partnerPhrases].map(
          (entry) => entry.id,
        ),
      });
    }
    if (body.mode !== "write")
      return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
    const incoming =
        body.questionReplies && typeof body.questionReplies === "object"
          ? body.questionReplies
          : {},
      questionReplies: Record<string, any> = {},
      answers: Record<string, string> = {};
    for (const slot of data.questionSlots) {
      const row = incoming[String(slot.slotIndex)] || {},
        answer = normalizeConsultationReturnText(String(row.answer || ""));
      if (!answer) continue;
      questionReplies[String(slot.slotIndex)] = {
        selections: row.selections || {},
        phraseIds: asArray(row.phraseIds).map(String),
        answer,
        completed: row.completed === true,
      };
      answers[String(slot.slotIndex)] = answer;
    }
    const incomingSections =
        body.sectionReplies && typeof body.sectionReplies === "object"
          ? body.sectionReplies
          : {},
      sectionReplies: Record<string, any> = {},
      sectionAnswers: Record<string, string> = {};
    for (const slot of data.sectionSlots) {
      const row = incomingSections[String(slot.slotIndex)] || {},
        answer = normalizeConsultationReturnText(String(row.answer || ""));
      if (!answer) continue;
      sectionReplies[String(slot.slotIndex)] = {
        optionIds: asArray(row.optionIds).map(String),
        phraseIds: asArray(row.phraseIds).map(String),
        answer,
        completed: row.completed === true,
      };
      sectionAnswers[String(slot.slotIndex)] = answer;
    }
    if (!Object.keys(answers).length && !Object.keys(sectionAnswers).length)
      return NextResponse.json(
        { error: "至少要完成一個回答" },
        { status: 400 },
      );
    const recommended = Array.from(
        new Set([
          ...Object.values(data.recommendedByQuestion).flat(),
          ...Object.values(data.recommendedBySection).flat(),
        ]),
      ) as string[],
      phraseIds = [
        ...Object.values(questionReplies).flatMap((row: any) => row.phraseIds),
        ...Object.values(sectionReplies).flatMap((row: any) => row.phraseIds),
      ],
      finalAnswer = [
        ...Object.entries(questionReplies).map(
          ([index, row]: any) =>
            `A${data.questionSlots[Number(index)]?.questionNumber || Number(index) + 1}:${row.answer}`,
        ),
        ...Object.entries(sectionReplies).map(
          ([index, row]: any) =>
            `【${data.sectionSlots[Number(index)]?.label || "項目"}】${row.answer}`,
        ),
      ].join("\n");
    const record = {
      booking_id: data.booking.id,
      recommended_topic_codes: recommended,
      selections: Object.fromEntries(
        Object.entries(questionReplies).map(([key, row]: any) => [
          key,
          row.selections,
        ]),
      ),
      phrase_ids: phraseIds,
      final_answer: finalAnswer,
      question_replies: questionReplies,
      section_replies: sectionReplies,
      phrase_usage: {
        questions: Object.fromEntries(
          Object.entries(questionReplies).map(([key, row]: any) => [
            key,
            row.phraseIds,
          ]),
        ),
        sections: Object.fromEntries(
          Object.entries(sectionReplies).map(([key, row]: any) => [
            key,
            row.phraseIds,
          ]),
        ),
      },
      google_document_id: data.documentDetail.google_document_id,
      google_document_url:
        data.documentDetail.google_document_url ||
        `https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await data.db
      .from("booking_quick_replies")
      .upsert(record, { onConflict: "booking_id" });
    if (saveError) throw new Error(saveError.message);
    if (Object.keys(answers).length)
      await upsertQuickConsultationQuestionReplies(
        data.documentDetail.google_document_id,
        answers,
      );
    if (Object.keys(sectionAnswers).length)
      await upsertQuickConsultationSectionReplies(
        data.documentDetail.google_document_id,
        sectionAnswers,
      );
    return NextResponse.json({
      ok: true,
      written: true,
      updatedAt: record.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "快速回覆處理失敗" },
      { status: 400 },
    );
  }
}
