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
  upsertPastLifeOverviewReplies,
  upsertQuickConsultationQuestionReplies,
  upsertQuickConsultationSectionReplies,
} from "@/lib/google-consultation-docs";

const one = (value: any) => (Array.isArray(value) ? value[0] : value);
const asArray = (value: any): any[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const clean = (value: any) => String(value || "").trim();
const loveBuiltInOptions = [
  { id: "virtual-self-personality-loyal", code: "self_personality_loyal", label: "忠厚重感情", sort_order: 201, is_active: true },
  { id: "virtual-self-personality-empathy", code: "self_personality_empathy", label: "有同情心", sort_order: 202, is_active: true },
  { id: "virtual-self-personality-principled", code: "self_personality_principled", label: "做事講原則", sort_order: 203, is_active: true },
  { id: "virtual-self-personality-responsive", code: "self_personality_responsive", label: "反應靈敏", sort_order: 204, is_active: true },
  { id: "virtual-self-personality-capable", code: "self_personality_capable", label: "有能力", sort_order: 205, is_active: true },
  { id: "virtual-self-personality-helpful", code: "self_personality_helpful", label: "熱心助人", sort_order: 206, is_active: true },
  { id: "virtual-self-personality-responsible", code: "self_personality_responsible", label: "有責任心", sort_order: 207, is_active: true },
  { id: "virtual-self-personality-stubborn", code: "self_personality_stubborn", label: "容易固執己見", sort_order: 208, is_active: true },
  { id: "virtual-self-personality-preachy", code: "self_personality_preachy", label: "有時比較愛說教", sort_order: 209, is_active: true },
  { id: "virtual-self-personality-mature", code: "self_personality_mature", label: "想法成熟穩重", sort_order: 210, is_active: true },
  { id: "virtual-self-personality-orderly", code: "self_personality_orderly", label: "做事有條理", sort_order: 211, is_active: true },
  { id: "virtual-self-personality-self-demanding", code: "self_personality_self_demanding", label: "容易過度要求自己", sort_order: 212, is_active: true },
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
  ...[
    ["relationship_situation_distance", "可能有遠距離"],
    ["relationship_situation_age_gap", "年齡可能有差距"],
    ["relationship_situation_work", "容易受到工作影響"],
    ["relationship_situation_family", "容易受到家人意見影響"],
    ["relationship_situation_communication", "溝通容易有落差"],
    ["relationship_situation_pace", "相處節奏不一樣"],
    ["relationship_situation_future", "對未來想法不同"],
    ["relationship_situation_money", "金錢觀念有差異"],
    ["relationship_situation_busy", "容易因忙碌而疏遠"],
    ["relationship_situation_security", "容易缺乏安全感"],
    ["relationship_situation_past", "舊感情容易影響關係"],
    ["relationship_situation_friends", "朋友圈容易介入"],
    ["relationship_situation_strong", "其中一方比較強勢"],
    ["relationship_situation_silent", "有事容易冷戰不說"],
  ].map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`,
    code,
    label,
    sort_order: 330 + index,
    is_active: true,
  })),
  ...[
    ["relationship_advice_clear", "把需求說清楚"],
    ["relationship_advice_listen", "先聽對方說完"],
    ["relationship_advice_boundary", "守好自己的界線"],
    ["relationship_advice_slow", "放慢相處節奏"],
    ["relationship_advice_space", "給彼此適當空間"],
    ["relationship_advice_conflict", "有問題就講清楚"],
    ["relationship_advice_action", "看行動不只聽承諾"],
    ["relationship_advice_future", "確認未來方向一致"],
    ["relationship_advice_self", "不要一味委屈自己"],
    ["relationship_advice_leave", "繼續下去會消耗自己，該斷則斷"],
  ].map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`,
    code,
    label,
    sort_order: 360 + index,
    is_active: true,
  })),
];
const loveBuiltInCopy: Record<string, string> = {
  self_personality_loyal: "個性忠厚，也很重感情。",
  self_personality_empathy: "有人緣，也會有同情心。",
  self_personality_principled: "有耿直的心性，做事情會講求原則。",
  self_personality_responsive: "反應靈敏，遇到事情能很快掌握狀況。",
  self_personality_capable: "本身有能力，交代的事情通常能處理好。",
  self_personality_helpful: "有熱心助人的心性，看到別人需要時會願意幫忙。",
  self_personality_responsible: "有責任心，答應的事情會想辦法做到。",
  self_personality_stubborn: "但是容易固執己見，有時候不太容易聽進別人的想法。",
  self_personality_preachy: "有時候想法會比較清高，而顯得比較愛說教。",
  self_personality_mature: "想法基本成熟，做事情也穩重。",
  self_personality_orderly: "做事情有條理，會先把順序和細節安排好。",
  self_personality_self_demanding: "有時候容易過度要求自己，會把太多壓力放在自己身上。",
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
  relationship_situation_distance: "兩個人容易有一段時間需要遠距離相處。",
  relationship_situation_age_gap: "兩個人的年齡可能有差距，相處方式也會不太一樣。",
  relationship_situation_work: "這段關係容易受到工作與時間安排影響。",
  relationship_situation_family: "這段關係容易受到家人意見影響。",
  relationship_situation_communication: "兩個人說話容易各自理解，溝通會有落差。",
  relationship_situation_pace: "兩個人想往前的速度不同，相處節奏不一樣。",
  relationship_situation_future: "兩個人對未來的安排還沒有一致。",
  relationship_situation_money: "兩個人的金錢觀念有差異，後面容易為花費起爭執。",
  relationship_situation_busy: "兩個人容易因為忙碌而疏遠，聯絡會慢慢變少。",
  relationship_situation_security: "這段關係容易缺乏安全感，需要更明確的態度。",
  relationship_situation_past: "過去的感情經驗還會影響現在的相處。",
  relationship_situation_friends: "朋友與生活圈容易介入兩個人的關係。",
  relationship_situation_strong: "其中一方比較強勢，很多事情容易由一個人決定。",
  relationship_situation_silent: "兩個人遇到問題容易冷戰，不會馬上把話說開。",
  relationship_advice_clear: "兩個人的需求要說清楚，不要讓對方一直猜。",
  relationship_advice_listen: "先把對方的話聽完，再處理彼此的問題。",
  relationship_advice_boundary: "相處可以體諒，但自己的界線要守好。",
  relationship_advice_slow: "這段關係先放慢，不要急著把結果定下來。",
  relationship_advice_space: "彼此留一點空間，關係反而會比較穩。",
  relationship_advice_conflict: "有問題就講清楚，不要累積到最後一次爆開。",
  relationship_advice_action: "接下來看對方怎麼做，不要只聽口頭承諾。",
  relationship_advice_future: "要先確認兩個人對未來的方向是不是一致。",
  relationship_advice_self: "不要為了留住這段關係，一直委屈自己。",
  relationship_advice_leave: "繼續下去只會消耗自己，該斷就要斷。",
};
const infantBuiltInRows = [
  ["infant_bridge_stones", "玩石頭", "寶寶目前還在奈何橋底下，有時候會自己玩石頭。"],
  ["infant_bridge_self_play", "自己玩耍", "寶寶目前還在奈何橋底下，有時候會自己玩耍。"],
  ["infant_bridge_friends", "會跟其他小朋友玩", "寶寶目前還在奈何橋底下，有時候會跟其他小朋友一起玩。"],
  ["infant_rebirth_excellent", "機會很好", "現在投胎的機會滿好的，已經有地方可以去了，時間到了就會去投胎。"],
  ["infant_rebirth_available", "有機會了", "現在已經有投胎的機會了，只是還在等時間，還沒有真的走。"],
  ["infant_rebirth_waiting", "正在等", "現在還在等投胎，還沒有那麼快，但已經慢慢有機會了。"],
  ["infant_rebirth_choosing", "還在挑", "現在有看到幾個可以投胎的地方，還在看看哪一個比較適合。"],
  ["infant_rebirth_undecided", "還沒決定", "現在還沒有決定好要去哪裡投胎，所以還在那邊等著。"],
  ["infant_rebirth_early", "機會還早", "現在投胎的機會還沒有那麼快，還要再等一陣子。"],
  ["infant_rebirth_not_ready", "暫時不想投胎", "現在還沒有很想急著投胎，自己在那邊待著、玩著，還沒有要走。"],
  ["infant_rebirth_blocked", "卡著還沒走", "現在還在那邊，投胎這件事情還沒有走得很順，所以暫時還沒辦法去。"],
  ["infant_rebirth_years", "大約多久可以投胎", "大約還要{infantYears}年可以投胎。"],
] as const;
const meritBuiltInRows = [
  ["buddhist_merit_very_good", "有很好的福德", "本身有很好的福德，很多事情都能得到一些善緣與助力。"],
  ["buddhist_merit_good", "福德不錯", "本身累積的福德不錯，遇到事情時比較容易有人幫忙，也比較有機會慢慢化開。"],
] as const;
const spiritBuiltInOptions = [...infantBuiltInRows, ...meritBuiltInRows].map(([code, label], index) => ({
  id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 700 + index, is_active: true,
}));
const spiritBuiltInCopy = Object.fromEntries(
  [...infantBuiltInRows, ...meritBuiltInRows].map(([code, , content]) => [code, content]),
) as Record<string, string>;
const overallBuiltInOptions = [
  {
    id: "virtual-deity-wangmu",
    code: "deity_wangmu",
    label: "王母娘娘",
    sort_order: 29,
    is_active: true,
  },
  {
    id: "virtual-deity-bao-fu",
    code: "deity_bao_fu",
    label: "包府千歲",
    sort_order: 30,
    is_active: true,
  },
  {
    id: "virtual-deity-city-god",
    code: "deity_city_god",
    label: "城隍爺",
    sort_order: 31,
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
    label: "目前穩定，短期沒有大變動",
    sort_order: 101,
    is_active: true,
  },
  {
    id: "virtual-overall-better",
    code: "status_overall_better",
    label: "阻力正在減少，卡關可重啟",
    sort_order: 102,
    is_active: true,
  },
  {
    id: "virtual-overall-rising",
    code: "status_overall_rising",
    label: "人脈與機會同步增加",
    sort_order: 103,
    is_active: true,
  },
  {
    id: "virtual-overall-sweet",
    code: "status_overall_sweet",
    label: "前段辛苦，後段開始收成果",
    sort_order: 104,
    is_active: true,
  },
  {
    id: "virtual-overall-help",
    code: "status_overall_help",
    label: "會有人主動提供協助",
    sort_order: 105,
    is_active: true,
  },
  {
    id: "virtual-overall-chance",
    code: "status_overall_chance",
    label: "工作、人脈或邀約帶來新機會",
    sort_order: 106,
    is_active: true,
  },
  {
    id: "virtual-overall-busy",
    code: "status_overall_busy",
    label: "工作量增加，但成果看得見",
    sort_order: 107,
    is_active: true,
  },
  {
    id: "virtual-overall-adjust",
    code: "status_overall_adjust",
    label: "事情過多，需要重排優先順序",
    sort_order: 108,
    is_active: true,
  },
  {
    id: "virtual-overall-hold",
    code: "status_overall_hold",
    label: "不宜大變動，先守住現況",
    sort_order: 109,
    is_active: true,
  },
  {
    id: "virtual-overall-break",
    code: "status_overall_break",
    label: "卡關處會出現具體解法",
    sort_order: 110,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-steady",
    code: "advice_overall_steady",
    label: "先固定作息與工作節奏",
    sort_order: 201,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-focus",
    code: "advice_overall_focus",
    label: "只保留三件最優先的事",
    sort_order: 202,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-patience",
    code: "advice_overall_patience",
    label: "重要決定延後確認，不急著答應",
    sort_order: 203,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-plan",
    code: "advice_overall_plan",
    label: "先列成本、風險與退路再行動",
    sort_order: 204,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-rest",
    code: "advice_overall_rest",
    label: "安排固定休息，避免疲勞判斷",
    sort_order: 205,
    is_active: true,
  },
  {
    id: "virtual-overall-advice-help",
    code: "advice_overall_help",
    label: "主動找可靠的人分工或詢問",
    sort_order: 206,
    is_active: true,
  },
  ...[
    ["recent_positive_windfall", "有偏財運"],
    ["recent_positive_support", "有貴人相助"],
    ["recent_positive_progress", "工作有進展"],
    ["recent_positive_news", "近期有好消息"],
    ["recent_positive_income", "正財收入穩定"],
    ["recent_positive_deal", "合作容易談成"],
    ["recent_positive_recovery", "身體恢復力好"],
    ["recent_positive_family", "家中事情順利"],
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
    ["recent_advice_blood", "可至信任宮廟請示破血"],
    ["recent_advice_prayer", "可安太歲或點平安燈"],
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
    ["body_hot", "體質比較燥熱"],
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
    ["body_positive_energy", "精神與體力穩定"],
    ["body_positive_recovery", "身體恢復力不錯"],
    ["body_positive_sleep", "睡眠大致安穩"],
    ["body_positive_stomach", "腸胃吸收正常"],
    ["body_positive_mobility", "筋骨活動穩定"],
    ["body_positive_circulation", "氣色與循環不錯"],
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
    "這段時間運勢穩，手上的事情照原定進度做就會完成。先顧好現在的工作，不要一次接太多新的事情。",
  status_overall_better:
    "前面卡住、拖著沒有下文的事情，最近會重新有進度。該談的會談、該定的會定，可以直接往下處理。",
  status_overall_rising:
    "最近人脈會起來，工作、合作、介紹來的機會都會變多。會有人主動找上門，裡面有一個條件適合你，先把內容看清楚再答應。",
  status_overall_sweet:
    "前面這一段會辛苦，事情多，也要自己處理。撐過這一段就會開始收成果，現在不要換方向，把已經做一半的事情完成。",
  status_overall_help:
    "最近會有人主動給消息、牽線或直接幫忙。遇到問題就把需求講清楚，這次有人能幫你把事情往前推。",
  status_overall_chance:
    "新的機會會從工作往來、人脈介紹或臨時邀約進來。消息來得突然，看到合適的就要回覆，不要拖到機會被別人拿走。",
  status_overall_busy:
    "最近工作量會明顯增加，事情一件接一件來。時間會很趕，也會同時卡好幾件，先排順序，重要的先處理。",
  status_overall_adjust:
    "最近事情太多，順序也容易亂。先把不重要的行程刪掉，再照期限排列，否則會忙了一整天卻漏掉真正重要的事。",
  status_overall_hold:
    "現在先不要突然離職，也不要投入大筆資金。先守住收入和手上的成果，等條件談清楚、有退路之後再動。",
  status_overall_break:
    "原本卡住的事情會出現解法，也會有人把關鍵消息帶來。方法一出現就直接處理，這次能把拖很久的問題解掉。",
  advice_overall_steady:
    "先固定睡眠、工作與處理事情的時間，連續維持穩定節奏，再評估下一步；狀態不穩時不要做重大決定。",
  advice_overall_focus:
    "把目前事項列出來，只保留三件最重要且有期限的事先完成，其餘延後，避免每件都做卻沒有一件完成。",
  advice_overall_patience:
    "重要合作、離職或金錢決定不要當下答應，至少把條件重新確認一次；資訊不完整時先保留，不要勉強決定。",
  advice_overall_plan:
    "行動前先列出預算、最壞風險與退出方式，三項都能承擔再開始；其中一項不清楚，就先補齊資料。",
  advice_overall_rest:
    "每週安排固定休息時間，疲倦或睡眠不足時不要處理重要文件、駕駛長途或做高風險決定。",
  advice_overall_help:
    "把需要協助的事情說清楚，直接找有經驗、能做決定或能提供資源的人詢問；可以分工的事情不要全部自己扛。",
  recent_positive_windfall: "財運這邊有偏財，會有原本沒有預期到的錢進來，或是多一筆收入。金額不一定很大，但確實拿得到。",
  recent_positive_support: "最近貴人會出現，遇到問題時有人給消息、介紹資源，也有人願意直接幫你處理。",
  recent_positive_progress: "工作這邊會有進展。前面卡住、拖著沒有下文的事情會重新動起來，不會再一直停在原地。",
  recent_positive_news: "最近會收到一個好消息，等待中的結果會定下來，內容對你有利。",
  recent_positive_income: "正財收入守得住，工作上的固定收入沒有問題，也有機會因為工作量或表現多拿一筆。",
  recent_positive_deal: "最近談合作容易談成，對方願意往下談，條件確認清楚就能定下來。",
  recent_positive_recovery: "身體的恢復力好，有小狀況也能穩定恢復，不會一直拖著不好。",
  recent_positive_family: "家裡近期沒有大的問題，原本讓人操心的事情會處理好，家人之間也會比較安定。",
  recent_negative_car: "近期有車關，開車、騎車和過馬路都不要搶快。特別注意轉彎、路口和視線死角。",
  recent_negative_blood: "近期有血光，小割傷、碰撞或跌倒容易發生。使用刀具、工具和上下樓梯都要慢一點。",
  recent_negative_surgery: "身體有手術、開刀或侵入性處置的象。現在已經有不舒服的地方就不要拖，該檢查就去檢查。",
  recent_negative_loss: "近期會有一筆額外支出，容易花在修繕、醫療或臨時狀況。投資、借貸和大筆消費先不要衝動。",
  recent_detail_minor: "看到的是小傷、小碰撞，像跌倒、撞到或割傷。自己小心就能避掉，沒有看到大的傷災。",
  recent_detail_life: "這項提醒較為明顯，需要嚴肅看待安全問題；若有身體症狀，應立即尋求醫療協助。",
  recent_detail_daily: "這個狀況會影響日常生活，需要停下來休息和處理，行程要先預留時間。",
  recent_detail_recovery: "處理後要休養一段時間，這段期間不能逞強，也不要急著恢復原本的工作量。",
  recent_detail_check: "這件事要提早檢查，拖下去只會讓處理時間拉長。先把原因查清楚，再照結果處理。",
  recent_detail_caution: "這一關避得掉。近期不搶快、不逞強、不做危險的事，小問題就不會變成大問題。",
  recent_advice_medical: "實際身體狀況仍要以合格醫療人員的檢查與判斷為準，不要延誤就醫。",
  recent_advice_traffic: "這段時間交通往來要放慢速度，避免疲勞駕駛，也不要為了趕時間冒險。",
  recent_advice_rest: "最近要避免過度疲勞，維持規律作息，讓精神與反應保持穩定。",
  recent_advice_blood: "可至信任的宮廟請示破血。",
  recent_advice_prayer: "可安太歲或點平安燈。",
  recent_advice_charity: "平常可以行善布施並迴向祈求平安，同時把現實中的安全措施做好。",
  body_headache: "容易頭痛。",
  body_dizziness: "容易頭暈。",
  body_sleep: "睡眠品質不穩。",
  body_eyes: "眼睛容易乾澀疲勞。",
  body_neck: "肩頸容易緊繃痠痛。",
  body_back: "腰背容易痠痛。",
  body_stomach: "腸胃比較敏感。",
  body_cold: "體質比較寒。",
  body_hot: "體質比較燥熱。",
  body_allergy: "容易有過敏狀況。",
  body_breath: "呼吸道比較敏感。",
  body_circulation: "循環比較弱。",
  body_pressure: "血壓容易有起伏。",
  body_liver: "肝膽代謝要注意。",
  body_kidney: "泌尿與腎臟要注意。",
  body_joint: "關節容易痠痛。",
  body_fatigue: "容易疲倦、精神比較差。",
  body_female_gynecology: "婦科方面要注意。",
  body_female_cycle: "生理期與荷爾蒙要注意。",
  body_male_prostate: "攝護腺方面要注意。",
  body_male_urinary: "男性泌尿狀況要注意。",
  body_positive_energy: "精神與體力穩定。",
  body_positive_recovery: "身體恢復力不錯。",
  body_positive_sleep: "睡眠大致安穩。",
  body_positive_stomach: "腸胃吸收正常。",
  body_positive_mobility: "筋骨活動穩定。",
  body_positive_circulation: "氣色與循環不錯。",
};
const healthExtraRows = [
  ["recent_positive_health_energy", "精神體力穩定", "近期精神跟體力都穩定，日常活動沒有太大問題。"],
  ["recent_positive_health_sleep", "睡眠狀況穩定", "近期睡眠狀況穩定，休息後精神恢復得起來。"],
  ["recent_positive_health_appetite", "食慾與消化正常", "近期食慾跟消化都正常，身體吸收狀況沒有問題。"],
  ["recent_positive_health_mobility", "筋骨活動順暢", "近期筋骨活動順暢，走動跟日常活動都穩定。"],
  ["recent_positive_health_recovery", "治療恢復順利", "目前治療後的恢復會順利，照進度休養就能慢慢穩定。"],
  ["recent_negative_health_inflammation", "容易發炎或反覆不適", "近期身體容易發炎或同一個地方反覆不舒服。"],
  ["recent_negative_health_chronic", "舊毛病容易復發", "近期舊毛病容易再出現，已經不舒服的地方不要拖。"],
  ["recent_negative_health_exhaustion", "過度疲勞影響身體", "近期容易累過頭，休息不夠時身體的不舒服會更明顯。"],
  ["recent_negative_health_check", "需要安排檢查", "近期有需要安排檢查的狀況，先把原因確認清楚。"],
  ["recent_negative_health_recovery", "恢復期會比較久", "這次身體恢復需要比較長的時間，不能太快恢復原本的工作量。"],
  ["health_advice_checkup", "按時追蹤檢查", "該做的檢查要按時完成。"],
  ["health_advice_sleep", "固定睡眠時間", "睡眠時間要固定，不要長期熬夜。"],
  ["health_advice_diet", "飲食清淡規律", "飲食要清淡、三餐要規律。"],
  ["health_advice_medication", "按醫囑用藥", "藥物要照醫囑使用，不要自行停藥。"],
  ["health_advice_rehab", "循序復健活動", "復健和活動要循序漸進。"],
  ["health_advice_rest", "避免過度勞累", "最近不要硬撐，身體累了就要休息。"],
] as const;
const healthBuiltInOptions = [
  ...overallBuiltInOptions.filter((option) =>
    /^(body_|recent_positive_recovery|recent_negative_surgery|recent_detail_)/.test(option.code),
  ),
  ...healthExtraRows.map(([code, label], index) => ({
    id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 520 + index, is_active: true,
  })),
];
const healthBuiltInCopy = Object.fromEntries(
  healthExtraRows.map(([code, , content]) => [code, content]),
) as Record<string, string>;
const dateResultBuiltInRows = [
  ["date_judgment_best", "這個時間最適合", "這個時間最適合，可以優先安排。"],
  ["date_judgment_good", "這個日子可以使用", "這個日子可以使用，照原定計畫進行即可。"],
  ["date_judgment_adjust", "需要調整時辰", "日期可以用，但時辰需要再調整。"],
  ["date_judgment_avoid", "這個日子要避開", "這個日子要避開，不建議安排重要事情。"],
  ["date_support_business", "有利工作開張", "這個時間對工作、開張與事業推進有利。"],
  ["date_support_relationship", "有利婚嫁感情", "這個時間對婚嫁、訂婚與感情安排有利。"],
  ["date_support_home", "有利搬家入厝", "這個時間適合搬家、入厝與安頓新居。"],
  ["date_support_contract", "有利簽約交易", "這個時間適合簽約、交易與處理重要文件。"],
  ["date_support_medical", "有利手術生產", "這個時間對手術、生產與後續恢復較有利。"],
  ["date_support_travel", "有利出行辦事", "這個時間適合出門辦事，過程會比較順。"],
  ["date_notice_clash", "避開沖煞時段", "當天要避開沖煞的時段，不要勉強使用。"],
  ["date_notice_early", "重要流程提早完成", "重要流程要提早完成，不要拖到太晚。"],
  ["date_notice_delay", "流程不要延誤", "當天流程不要延誤，時間一過就不建議再進行。"],
  ["date_notice_calm", "當天保持平和", "當天情緒要穩，不要爭吵或臨時改動。"],
  ["date_notice_traffic", "預留交通時間", "當天要預留交通時間，避免趕路錯過時辰。"],
  ["date_notice_simple", "儀式簡單莊重", "儀式保持簡單莊重，不用安排得太複雜。"],
  ["date_notice_documents", "文件資料先備齊", "相關文件與資料要先準備完整，當天不要臨時補件。"],
  ["date_notice_weather", "先確認天候狀況", "安排前先確認天候狀況，遇到明顯變化就提早調整。"],
  ["date_notice_people", "重要人員先確認", "重要人員要事先確認時間，不要到當天才臨時聯絡。"],
  ["date_notice_backup", "預留備用方案", "當天要預留備用方案，臨時有變化時才不會亂掉。"],
  ["date_notice_rest", "前一天充分休息", "前一天要充分休息，當天精神穩定，事情才會做得順。"],
  ["date_notice_check", "出發前再次確認", "出發前把時間、地點和攜帶物品再確認一次。"],
] as const;
const dateResultBuiltInOptions = dateResultBuiltInRows.map(([code, label], index) => ({
  id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 100 + index, is_active: true,
}));
const dateResultBuiltInCopy = Object.fromEntries(dateResultBuiltInRows.map(([code, , content]) => [code, content])) as Record<string, string>;
const pastLifeBuiltInRows = [
  ["past_overview_smart", "聰明敏銳", "聰明敏銳，心思縝密，做事情有條理，也有分析能力。"],
  ["past_overview_righteous", "熱情正直", "本性熱情正直，遇到事情敢承擔，也有創造能力。"],
  ["past_overview_leader", "喜歡主導", "性格喜歡主導，有自信，也會察言觀色。"],
  ["past_overview_proud", "有傲氣又好面子", "本身有傲氣，也會好面子，處理事情容易比較主觀。"],
  ["past_overview_sensitive", "敏感多愁", "心思細膩，容易神經過敏或多愁善感，情緒會放在心裡。"],
  ["past_overview_suspicious", "容易多疑", "遇到事情容易多疑，也會反覆分析別人的想法。"],
  ["past_overview_perfection", "追求完美", "做事情追求完美，也很在意別人的肯定。"],
  ["past_overview_stubborn", "容易偏執計較", "有時候會偏執，也會有計較心，容易鑽牛角尖。"],
  ["past_overview_money", "本身有財", "本身有財，但是錢財比較容易來去，會有財務波動。"],
  ["past_overview_invest", "適合短期投資", "可以投資或代理，但是適合短期操作，不要戀棧。"],
  ["past_overview_dispute", "留意是非官非", "做事情要小心謹慎，容易遇到是非、官非或不必要的耗損。"],
  ["past_overview_tired", "做事勞心費力", "做事情比較勞心費力，煩心的事情也會比較多。"],
  ["past_overview_kind", "本性善良有外緣", "本性善良，有外緣也有能力，關鍵時刻會有人願意幫忙。"],
  ["past_overview_blessing", "多布施增加福德", "有能力要多布施，能增加福德與貴人運的助力。"],
  ["past_overview_temple", "多走大廟宮廟", "有空可以多走大廟或宮廟，遇到事情比較容易化解。"],
  ["past_consultant_direct", "熱情直率", "{selfName}的個性比較熱情直率，能冷靜分析，也喜歡把道理講清楚。"],
  ["past_consultant_perfect", "追求完美與肯定", "{selfName}喜歡追求完美，也很在意別人的肯定。"],
  ["past_consultant_worry", "多疑容易計較", "{selfName}容易多疑或過度計較，遇到事情會鑽牛角尖。"],
  ["past_consultant_kind", "善良有能力", "{selfName}本性善良，有能力，也懂得察言觀色。"],
  ["past_target_confident", "有自信與領導力", "{partnerName}有自信、有領導力，做事情喜歡掌控全局。"],
  ["past_target_proud", "好面子較主觀", "{partnerName}比較好面子，作風威嚴，有時候會太主觀。"],
  ["past_target_sensitive", "心思細膩敏感", "{partnerName}心思細膩，也容易敏感，很多事情會放在心裡。"],
  ["past_target_reason", "冷靜理性", "{partnerName}能冷靜分析，重視道理與實際結果。"],
  ["past_relationship_communicate", "主導權要溝通", "兩個人容易因為理念或主導權產生摩擦，一定要把話講清楚。"],
  ["past_relationship_stepback", "彼此適度退讓", "相處時要適度退讓，不要每件事情都爭輸贏。"],
  ["past_relationship_boundary", "界線要說清楚", "兩個人的界線與責任要先說清楚，後面才不容易互相埋怨。"],
  ["past_relationship_stop", "避免情緒對立", "有情緒時先停一下，不要硬碰硬，否則很容易對立或意見分歧。"],
  ["past_relationship_support", "多肯定少批評", "兩個人要多肯定對方、少用批評的方式溝通，關係才會順。"],
  ["past_relationship_distance", "保留相處空間", "彼此要保留適當的相處空間，不要把對方管得太緊。"],
] as const;
const pastLifeBuiltInOptions = pastLifeBuiltInRows.map(([code, label], index) => ({ id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 1100 + index, is_active: true }));
const pastLifeBuiltInCopy = Object.fromEntries(pastLifeBuiltInRows.map(([code, , content]) => [code, content])) as Record<string, string>;
const lawsuitBuiltInRows = [
  ["lawsuit_attitude_continue", "對方會繼續追究", "這件事情對方還不會放掉，後面還會繼續處理，不會這麼快結束。"],
  ["lawsuit_attitude_step_back", "對方會退一步", "這件事情後面對方的態度會軟下來，不會一直強硬到底。"],
  ["lawsuit_attitude_repeated", "對方態度會反覆", "對方的態度還會反覆，一下願意談、一下又變強硬，先不要急著相信口頭承諾。"],
  ["lawsuit_settlement_talk", "雙方會談和解", "這件事情最後會往談和解的方向走，後面會有人出來談條件。"],
  ["lawsuit_settlement_slow", "不會這麼快和解", "現在還談不到一個雙方都能接受的結果，這件事情還要再拖一段時間。"],
  ["lawsuit_court_details", "開庭會被問細節", "下次開庭不會只是簡單問幾句，細節、經過、前後說法都會被問得比較仔細。"],
  ["lawsuit_evidence_opponent_gap", "對方說法有漏洞", "對方講的東西前後有些地方對不起來，細節會被拿出來看。"],
  ["lawsuit_court_speak_carefully", "自己說話要小心", "這場官司最怕自己講太多，尤其前後說法不能不一樣，該講的講清楚就好。"],
  ["lawsuit_court_progress", "開庭後會有進度", "下一次開庭後事情會往前走，會有新的程序或明確的處理方向。"],
  ["lawsuit_evidence_key", "證據是關鍵", "這件事情最後不是靠誰講得大聲，證據才是關鍵，手上的資料一定要整理好。"],
  ["lawsuit_support_tiring", "一個人處理會比較累", "現在一個人處理這件事情，後面會越來越繁瑣，光靠自己會比較吃力。"],
  ["lawsuit_support_help", "有人會幫忙", "後面會有人出手幫忙，可能是熟人提供意見，也可能有人幫忙處理細節。"],
  ["lawsuit_support_professional", "需要找專業人士", "這件事情牽涉的細節比較多，不適合完全自己摸索，法律上的部分該問專業就要問。"],
  ["lawsuit_support_family", "家人會出手協助", "後面家人會出手幫忙，至少有人能一起討論、整理資料或陪同處理。"],
  ["lawsuit_time_short_not_end", "短期不會結束", "這件事情短期內還不會結束，後面還有程序要走。"],
  ["lawsuit_time_next_progress", "下次之後有進度", "下一次開庭或調解之後會有明顯進度，不會一直停在現在。"],
  ["lawsuit_time_delayed", "時間容易往後延", "原本預期的時間容易往後延，結果不會那麼快定下來。"],
  ["lawsuit_injury_attitude_continue", "傷害案件：對方還在追究", "這件事情對方現在還沒有要放手，後面還會繼續追。"],
  ["lawsuit_injury_settlement_terms", "傷害案件：雙方會談條件", "後面會談到賠償、條件這些事情，不會只是一直僵著。"],
  ["lawsuit_injury_settlement_possible", "傷害案件：和解有機會", "後面確實會走到談和解這一步。"],
  ["lawsuit_injury_settlement_amount", "傷害案件：和解金額會拉鋸", "真正卡住的不是要不要談，是條件跟金額談不攏。"],
  ["lawsuit_injury_settlement_agree", "傷害案件：條件最後能談成", "前面雖然會拉鋸，但最後條件還是能談到雙方可以接受。"],
  ["lawsuit_injury_evidence_key", "傷害案件：證據很重要", "這件事情最後還是要看證據，口頭講法不能當全部。"],
  ["lawsuit_injury_evidence_review", "傷害案件：對方說法會被檢視", "對方講的內容後面會被一項一項拿出來看。"],
  ["lawsuit_injury_court_speak", "傷害案件：自己不能亂講", "開庭前後說法一定要一致，不要想到什麼就補什麼。"],
  ["lawsuit_injury_time_drag", "傷害案件：這件事情會拖", "不會一次開完就結束，後面還有程序要跑。"],
  ["lawsuit_injury_support_help", "傷害案件：有人會出手協助", "現在雖然自己一個人處理，後面還是會有人提供協助。"],
  ["lawsuit_injury_support_professional", "傷害案件：需要專業協助", "這件事情不要什麼都自己猜，法律上的部分該問專業就要問。"],
] as const;
const lawsuitBuiltInOptions = lawsuitBuiltInRows.map(([code, label], index) => ({
  id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 100 + index, is_active: true,
}));
const lawsuitBuiltInCopy = Object.fromEntries(
  lawsuitBuiltInRows.map(([code, , content]) => [code, content]),
) as Record<string, string>;
const homeBuiltInOptions = [
  ...[
    ["home_condition_stable", "整體氣場穩定"], ["home_condition_bright", "採光氣場不錯"],
    ["home_condition_cluttered", "雜氣比較重"], ["home_condition_stagnant", "氣場流動較慢"],
    ["home_condition_yin", "陰氣稍重"], ["home_condition_conflict", "格局氣場有沖煞"],
    ["home_impact_calm", "住起來心情安定"], ["home_impact_support", "對家運有助力"],
    ["home_impact_sleep", "容易影響睡眠"], ["home_impact_mood", "容易心浮氣躁"],
    ["home_impact_health", "容易影響精神與體力"], ["home_impact_relationship", "家人較容易有口角"],
    ["home_area_entrance", "玄關"], ["home_area_living", "客廳"], ["home_area_bedroom", "房間"],
    ["home_area_kitchen", "廚房"], ["home_area_bathroom", "廁所"], ["home_area_door", "大門"],
    ["home_area_balcony", "陽台"], ["home_area_ok", "整體都還可以"],
    ["home_adjust_tidy", "整理環境"], ["home_adjust_move", "換位置"],
    ["home_adjust_light", "增加採光"], ["home_adjust_air", "保持通風"],
    ["home_suitable_yes", "適合繼續住"], ["home_suitable_observe", "可以住但要觀察"],
    ["home_suitable_adjust", "調整後可以繼續住"], ["home_suitable_short", "短期居住較合適"],
    ["home_suitable_move", "長期建議考慮搬遷"], ["home_suitable_family", "要看家人適應情況"],
    ["home_fortune_positive_gather", "旺氣漸聚"], ["home_fortune_positive_family", "家運轉穩"],
    ["home_fortune_positive_noble", "貴人氣入宅"], ["home_fortune_positive_wealth", "財氣慢慢提升"],
    ["home_fortune_negative_block", "宅運受阻"], ["home_fortune_negative_leak", "財氣容易外洩"],
    ["home_fortune_negative_dispute", "口舌之氣較重"], ["home_fortune_negative_unsettled", "家宅較不安定"],
    ["home_final_steady", "先穩定居家氣場"], ["home_final_clean", "定期清理與除濕"],
    ["home_final_sun", "讓陽光進到屋內"], ["home_final_route", "保持主要動線通暢"],
    ["home_final_pray", "依信仰祈福安宅"], ["home_final_observe", "調整後再觀察一段時間"],
  ].map(([code, label], index) => ({ id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 100 + index, is_active: true })),
];
const homeBuiltInCopy: Record<string, string> = {
  home_condition_stable: "這間房子目前的整體氣場算穩定，住起來沒有太大的問題。",
  home_condition_bright: "屋內的採光與陽氣不錯，整體氣場比較明亮。",
  home_condition_cluttered: "屋內目前的雜氣比較重，東西堆放太多的地方尤其明顯。",
  home_condition_stagnant: "房子的氣場流動比較慢，容易讓人覺得沉悶或做事提不起勁。",
  home_condition_yin: "屋內的陰氣稍微重一些，陰暗、潮濕或長期沒有使用的地方要多留意。",
  home_condition_conflict: "房子的格局氣場有一些沖煞，主要動線與家具擺放需要再調整。",
  home_impact_calm: "這間房子對居住者有安定情緒的作用，住在裡面比較容易靜下來。",
  home_impact_support: "目前的住宅氣場對家運有一些助力，家人相處與做事會比較穩。",
  home_impact_sleep: "這裡的氣場比較容易影響睡眠，晚上可能較難放鬆或容易醒來。",
  home_impact_mood: "住在這裡比較容易心浮氣躁，情緒也可能受到空間氣場影響。",
  home_impact_health: "這裡的環境容易讓精神與體力受到影響，要留意長期疲倦或不舒服的情況。",
  home_impact_relationship: "家中的口舌之氣比較明顯，家人之間容易因小事產生摩擦。",
  home_area_entrance: "這個房子需要注意玄關，入口不要堆放太多雜物，讓氣能順利進來。",
  home_area_living: "這個房子的主要問題比較集中在客廳，公共空間要保持明亮與整齊。",
  home_area_bedroom: "這個房子的主要問題比較集中在房間，尤其是晚上休息的地方，不要堆太多雜物。",
  home_area_kitchen: "廚房的火氣與清潔需要留意，保持乾淨會比較有利於家中氣場。",
  home_area_bathroom: "廁所的濕氣與穢氣要多留意，平常要維持乾燥與通風。",
  home_area_door: "大門附近的氣場需要留意，門口與主要動線要保持通暢。",
  home_area_balcony: "陽台是屋內納氣的重要位置，不要長期堆滿雜物或完全遮住採光。",
  home_area_ok: "房子各個區域整體都還可以，目前沒有哪一處特別需要擔心。",
  home_adjust_tidy: "建議先整理環境，把長期不用與堆積的物品清掉，氣場會比較流通。",
  home_adjust_move: "部分家具或物品可以換個位置，避開阻擋動線與長期壓迫的擺法。",
  home_adjust_light: "屋內可以增加採光，白天多讓自然光進來，有助於提升陽氣。",
  home_adjust_air: "平常要保持通風，讓屋內的濕氣與沉滯氣場能夠散出去。",
  home_suitable_yes: "這間房子目前適合繼續居住，只要維持整潔與正常使用即可。",
  home_suitable_observe: "目前還可以繼續住，但要觀察家人的睡眠、情緒與生活是否持續受影響。",
  home_suitable_adjust: "這間房子調整之後可以繼續住，暫時不需要急著搬走。",
  home_suitable_short: "這裡比較適合短期居住，若要長住仍要評估環境與家人的適應情況。",
  home_suitable_move: "若長期住下來一直不舒服，可以開始評估搬遷，不需要勉強留在原處。",
  home_suitable_family: "是否適合繼續住，也要看每一位家人的實際適應情況再決定。",
  home_fortune_positive_gather: "最近家中的旺氣正在慢慢聚集，宅運會比前一段時間穩定。",
  home_fortune_positive_family: "最近家運有慢慢轉穩的現象，家裡的事情會比較容易安定下來。",
  home_fortune_positive_noble: "最近有貴人氣入宅，家人遇到事情比較容易得到外來的幫助。",
  home_fortune_positive_wealth: "最近家中的財氣會慢慢提升，但仍要穩穩累積，不宜過度冒險。",
  home_fortune_negative_block: "最近宅運有一些受阻，做事情容易反覆或進展比較慢。",
  home_fortune_negative_leak: "最近家中的財氣比較容易外洩，要留意不必要的支出與物品損壞。",
  home_fortune_negative_dispute: "最近家中的口舌之氣比較重，家人說話要多留一點餘地。",
  home_fortune_negative_unsettled: "最近家宅氣場比較不安定，居住者的睡眠與情緒可能容易受到影響。",
  home_final_steady: "最後建議先把居家氣場穩定下來，不要一次做太多大幅度改動。",
  home_final_clean: "可以固定清理、除濕與淘汰不用的物品，讓空間維持乾淨清爽。",
  home_final_sun: "白天可以多拉開窗簾，讓陽光進到屋內，對整體宅氣會有幫助。",
  home_final_route: "玄關、大門與主要走道要保持通暢，不要讓大型物品擋住動線。",
  home_final_pray: "若有民俗信仰，可以到信任的宮廟祈福安宅，讓家人心裡更安定。",
  home_final_observe: "環境調整後先觀察一段時間，再依家人的實際感受決定下一步。",
};
const spiritualBuiltInRows = [
  ["spiritual_level_none", "沒有外靈干擾", "目前沒有看到外靈干擾，這部分不用太擔心。如果最近有哪裡不舒服，先從睡眠、壓力跟生活作息去調整就好。"],
  ["spiritual_level_light", "有一點干擾", "目前是有一點干擾，不算很嚴重。這陣子比較容易覺得累，心裡也容易不安，晚上安靜下來的時候，感覺會比較明顯。"],
  ["spiritual_level_heavy", "干擾比較重", "這邊的干擾比較重，所以最近整個人容易覺得不舒服，精神也比較差，晚上也容易睡不好。這種狀況已經有影響到生活，就不要一直放著。"],
  ["spiritual_level_recent", "最近才出現", "這個干擾是最近才出現的，跟最近生活上的一些變化有關係。可以想一下，最近是不是有去過什麼比較特殊的地方，或是去了哪裡之後，才開始覺得怪怪的。"],
  ["spiritual_level_long", "已經一段時間", "這個狀況已經有一段時間了，所以才會一直覺得哪裡不太對。不是這一兩天突然有的，這個就要把前面的事情一起想一想。"],
  ["spiritual_follow_self", "跟著本人", "這個是跟著本人的，所以不管到哪裡，多少都還是容易有感覺。單純換地方住，不一定就能解決。"],
  ["spiritual_follow_home", "跟著房子", "這個跟房子的關係比較大，住在這裡的人容易受到影響。如果是搬來這裡之後才開始有狀況，這間房子就要多注意。"],
  ["spiritual_follow_family", "跟著家人", "這個是跟著家裡其中一個人，不是每個人都會有感覺。所以要看一下，到底是哪一個人最近特別容易不舒服或覺得怪怪的。"],
  ["spiritual_follow_outside", "從外面帶回來", "這個是從外面帶回來的，跟之前去過的地方或接觸到的人事物有關係。可以回想一下，是不是去哪裡回來之後，狀況才開始出現。"],
  ["spiritual_follow_karma", "原本就有因緣", "這個因緣本來就存在，不是最近才突然有的，只是最近狀況比較明顯，所以才開始感覺得到。"],
  ["spiritual_symptom_tired", "容易疲累", "最近身體很容易累，明明也沒有特別做什麼，整個人就是一直提不起精神，休息了也還是覺得累。"],
  ["spiritual_symptom_sleep", "容易睡不好", "晚上比較容易受到影響，容易睡不著、半夜醒來，或者一直做夢，睡了一覺起來還是覺得很累。"],
  ["spiritual_symptom_irritable", "容易心煩", "最近心情比較容易受到影響，一點小事情就容易煩，耐性也比較差，常常自己都覺得怎麼最近這麼容易不開心。"],
  ["spiritual_symptom_uneasy", "容易心裡不安", "最近心裡容易有一種不安的感覺，明明沒有發生什麼事情，就是覺得怪怪的、靜不下來，做事情也比較容易分心。"],
  ["spiritual_symptom_minor", "影響沒有很大", "雖然這邊有一些干擾，但是目前影響沒有很大，生活還是可以正常過。不要一直盯著這件事情，越想反而越容易讓自己不舒服。"],
  ["spiritual_entity_kind", "沒有惡意", "這個沒有惡意，不是要來傷害人的，所以不用自己嚇自己。把該處理的事情處理好，慢慢就會穩下來。"],
  ["spiritual_entity_family", "對家人有牽掛", "這個對家人還有牽掛，所以容易出現在家人的身邊，讓家人有感覺。這種不用一直害怕，好好表達心意就可以。"],
  ["spiritual_entity_message", "有事情要表達", "這個有事情想讓家人知道，所以才會一直有一些感覺。如果最近一直出現同樣的狀況，就要留意一下。"],
  ["spiritual_entity_unfinished", "因緣還沒完", "這邊還有一些因緣沒有處理完，所以才會一直有感覺。事情處理清楚之後，狀況才會慢慢淡掉。"],
  ["spiritual_entity_handle", "需要處理", "這個狀況已經有影響到生活了，就不要一直拖著。該處理的就處理掉，不要放著讓它一直影響。"],
  ["spiritual_advice_none", "先不用特別處理", "目前不用特別做什麼，先把生活過好就好。睡覺、吃飯、作息正常一點，也不要每天一直去想這件事情。"],
  ["spiritual_advice_clean", "先整理家裡", "家裡先整理一下，尤其房間不要堆太多東西，該丟的就丟、該清的就清，窗戶有空也打開通通風，整個環境舒服一點，人也會比較穩。"],
  ["spiritual_advice_temple", "去熟悉的廟走走", "如果心裡一直覺得不安，可以去平常有在拜的廟走走，拜拜、坐一下，讓心先靜下來，不要一直胡思亂想。"],
  ["spiritual_advice_karma", "把因緣處理好", "既然這個事情已經影響到生活，就把該做的處理好。該表達的心意就表達，不要一直拖著，也不要自己亂試一些方法。"],
  ["spiritual_advice_careful", "不要亂處理", "這種事情不要看到網路上什麼方法就跟著做，這個很容易越弄越亂。真的有需要，就找懂的人處理，不要自己在那邊一直試。"],
  ["spiritual_advice_doctor", "身體不舒服先看醫生", "如果本身有身體上的不舒服，還是要先去看醫生。外靈歸外靈，身體的問題還是要處理，不能什麼都算在這上面。"],
] as const;
const spiritualBuiltInOptions = spiritualBuiltInRows.map(([code, label], index) => ({
  id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 100 + index, is_active: true,
}));
const spiritualBuiltInCopy = Object.fromEntries(
  spiritualBuiltInRows.map(([code, , content]) => [code, content]),
) as Record<string, string>;
const historyMatchesItem = (content: any, itemCode: string) =>
  itemCode === "deceased-relative"
    ? !/【\s*過世寵物\s*】/u.test(clean(content))
    : itemCode === "deceased-pet"
      ? !/【\s*過世親人\s*】/u.test(clean(content))
      : true;
const previousDeceasedLocation = (value: any) => {
  const text = clean(value).replace(/\s+/g, "");
  const detailedReborn = text.match(/(?:已經|已)?投胎[^。！？\n]{0,20}?現在是(一個|一隻)([^，。！？\n]{1,16})/);
  if (detailedReborn)
    return {
      text: `已投胎成為${detailedReborn[1]}${detailedReborn[2]}`,
      rank: 5,
    };
  const reborn = text.match(
    /(?:目前|現在)?(?:已經)?(?:投胎|轉世)(?:成為|成|為)?([^，。！？\n]{1,16})/,
  );
  if (reborn) return { text: `已投胎成為${reborn[1]}`, rank: 5 };
  if (/奈何橋/.test(text)) return { text: "在奈何橋", rank: 0 };
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
      "id,customer_id,booking_no,customers(line_display_name,full_name),booking_details(id,item_id,created_at,item_title,google_document_id,google_document_url,booking_items(code),booking_detail_sub_items(sub_item_title),booking_consultation_answers(profile_id,questions,extra_data,consultation_profiles(*),booking_answer_participants(position,profile_id,consultation_profiles(*))))",
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
            presentation = profilePresentation(profile, ownerNameForQuestions),
            itemCode = one(detail.booking_items)?.code || "",
            extra = answer.extra_data || {},
            overallFocusQuestionLabels: Record<string, string> = {
              想換工作: "想換工作建議",
              職涯迷惘: "職涯迷惘建議",
              財務壓力: "財務壓力建議",
            },
            focuses = asArray(extra.overall_focuses).map(clean).filter(Boolean).length
              ? asArray(extra.overall_focuses).map(clean).filter(Boolean)
              : Object.keys(extra.overall_focus_details || {}),
            questions = itemCode === "overall-fortune" && focuses.length
              ? focuses.slice(0, 3).map((focus: string) => overallFocusQuestionLabels[focus] || `${focus}建議`)
              : asArray(answer.questions);
          if (itemCode === "past-life-relationship" && Object.keys(extra.target_questions || {}).length) {
            const participants = asArray(answer.booking_answer_participants).slice().sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0));
            const orderedTargetIds = [
              ...participants.map((entry: any) => String(entry.profile_id)),
              ...Object.keys(extra.target_questions || {}),
            ].filter((targetId, index, all) => all.indexOf(targetId) === index && Object.prototype.hasOwnProperty.call(extra.target_questions || {}, targetId));
            return orderedTargetIds.flatMap((targetId) => {
              const values = extra.target_questions?.[targetId];
              const participant = asArray(answer.booking_answer_participants).find((entry: any) => String(entry.profile_id) === String(targetId));
              const targetProfile = one(participant?.consultation_profiles);
              const targetPresentation = profilePresentation(targetProfile, ownerNameForQuestions);
              return asArray(values).map((question: any) => ({
                question: String(question || "").trim(), itemCode, itemTitle: detail.item_title || "",
                profileName: clean(targetProfile?.name) || "對方", profileLines: targetPresentation.profileLines,
              }));
            });
          }
          return questions.map((question: any) => ({
            question: String(question || "").trim(),
            itemCode,
            itemTitle: detail.item_title || "",
            profileName: clean(profile?.name),
            profileLines: presentation.profileLines,
          }));
        }),
      )
      .filter((entry: any) => entry.question);
  const documentQuestionSlots = await getQuickReplyQuestionSlots(documentDetail.google_document_id);
  let questionSlots = questionMeta.map((meta: any, index: number) => {
    const normalized = clean(meta.question).replace(/[？?。.!！\s]/g, "");
    // 文件中的相同題目可能出現在不同對象頁面；只允許相同順序且題目相符的內容回填，
    // 避免用 Array.find() 把第一位對象的 A1 誤帶到其他對象。
    const documentSlot = documentQuestionSlots[index];
    const answer = documentSlot?.question.replace(/[？?。.!！\s]/g, "") === normalized
      ? documentSlot.answer || ""
      : "";
    const previousSameGroup = questionMeta.slice(0, index).filter((entry: any) =>
      entry.itemCode === meta.itemCode && entry.profileName === meta.profileName,
    ).length;
    return { slotIndex: index, questionNumber: previousSameGroup + 1, question: meta.question, answer, itemCode: meta.itemCode || "", itemTitle: meta.itemTitle || "", profileName: meta.profileName || "", profileLines: meta.profileLines || [], manualOnly: true };
  });
  if (!questionSlots.length) questionSlots = documentQuestionSlots.map((slot, index) => ({ ...slot, itemCode: "", itemTitle: "", profileName: "", profileLines: [], manualOnly: true }));
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
  if (questionMeta.length > questionSlots.length) {
    for (let index = questionSlots.length; index < questionMeta.length; index += 1) {
      questionSlots.push({
        slotIndex: index,
        questionNumber: index + 1,
        question: questionMeta[index]?.question || `問題${index + 1}`,
        answer: "",
        itemCode: questionMeta[index]?.itemCode || "",
        itemTitle: questionMeta[index]?.itemTitle || "",
        profileName: questionMeta[index]?.profileName || "",
        profileLines: questionMeta[index]?.profileLines || [],
        manualOnly: false,
      } as any);
    }
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
  const topicRows = [...(topics || [])];
  if (!topicRows.some((topic: any) => topic.code === "date_result")) topicRows.push({
    id: "virtual-date-result-topic", code: "date_result", title: "擇日／擇時", icon: "📅",
    keywords: ["擇日", "擇時"], sort_order: 950, quick_reply_options: [],
  } as any);
  if (!topicRows.some((topic: any) => topic.code === "past_life")) topicRows.push({
    id: "virtual-past-life-topic", code: "past_life", title: "前世因果", icon: "☯",
    keywords: ["前世", "綜觀今生"], sort_order: 960, quick_reply_options: [],
  } as any);
  const normalizedTopics = topicRows.map((topic: any) => {
    const options: any[] = topic.code === "spiritual"
      ? []
      : asArray(topic.quick_reply_options).filter(
          (option: any) => option.is_active,
        );
    const builtIns =
      topic.code === "love"
        ? loveBuiltInOptions
        : topic.code === "overall"
          ? overallBuiltInOptions
          : topic.code === "health"
            ? healthBuiltInOptions
            : topic.code === "lawsuit"
              ? lawsuitBuiltInOptions
          : topic.code === "home"
            ? homeBuiltInOptions
            : topic.code === "spiritual"
              ? spiritualBuiltInOptions
              : topic.code === "date_result"
                ? dateResultBuiltInOptions
              : topic.code === "past_life"
                ? pastLifeBuiltInOptions
          : [];
    for (const option of builtIns)
      if (!options.some((entry: any) => entry.code === option.code))
        options.push(option);
    return {
      ...topic,
      options: options.sort((a: any, b: any) => a.sort_order - b.sort_order),
    };
  });
  const deceasedTopic = normalizedTopics.find((topic: any) => topic.code === "deceased"),
    infantTopic = normalizedTopics.find((topic: any) => topic.code === "infant_spirit");
  const loveTopic = normalizedTopics.find((topic: any) => topic.code === "love");
  if (loveTopic) {
    const selfOptions = loveTopic.options.filter((option: any) => option.code.startsWith("self_personality_"));
    const mirroredPartners = selfOptions.map((option: any, index: number) => {
      const code = `partner_personality_mirror_${option.code.replace(/^self_personality_/, "")}`;
      const label = String(option.label || "");
      const selfCopy = loveBuiltInCopy[option.code];
      loveBuiltInCopy[code] = selfCopy
        ? selfCopy.replace(/^但是/, "有時候").replace(/^本身/, "對方")
        : /^(比較|容易|很|有|重|不)/.test(label)
          ? `對方${label}。`
          : `對方的個性${label}。`;
      return { id: `virtual-${code.replaceAll("_", "-")}`, code, label, sort_order: 240 + index, is_active: true };
    });
    loveTopic.options = [
      ...loveTopic.options.filter((option: any) => !option.code.startsWith("partner_personality_")),
      ...mirroredPartners,
    ].sort((a: any, b: any) => a.sort_order - b.sort_order);
  }
  if (deceasedTopic && infantTopic) {
    const infantOptions = new Map(infantTopic.options.map((option: any) => [option.code, option]));
    infantTopic.options = deceasedTopic.options.map((option: any) => infantOptions.get(option.code) || option);
  }
  for (const topic of normalizedTopics) {
    if (["deceased", "deceased_pet", "infant_spirit"].includes(topic.code)) {
      for (const option of spiritBuiltInOptions) {
        const infantOnly = option.code.startsWith("infant_");
        if ((!infantOnly || topic.code === "infant_spirit") && !topic.options.some((entry: any) => entry.code === option.code))
          topic.options.push(option);
      }
      topic.options.sort((a: any, b: any) => a.sort_order - b.sort_order);
    }
  }
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
    "past-life-personal": "past_life",
    "past-life-relationship": "past_life",
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
      love_status: "目前感情狀態",
      lawsuit_type: "官司或糾紛類型",
      lawsuit_progress: "目前訴訟進度",
      next_court_date: "下次開庭或調解日期",
      dispute_summary: "事件簡述與爭議點",
      professional_help: "目前是否有專業人士或他人協助",
      previous_handling: "過去是否曾處理過",
      health_concerns: "當前關注的健康問題",
      major_treatment_planned: "近期是否有手術或重大治療規劃",
      treatment_question: "想瞭解的問題",
      treatment_question_other: "其他想瞭解的問題",
      health_notes: "健康備註",
      current_regret: "目前的困擾或遺憾",
      consultation_goal: "這次諮詢最希望獲得什麼",
      old_name: "公司目前名字或舊名",
      business: "主要業務與產品",
      mode: "公司經營模式",
      preferences: "命名喜好與禁忌",
      favorite_words: "特別喜歡或想放進去的字",
      relationship_status: "目前關係狀態",
      relationship_duration: "這段關係多久了",
      main_event: "這次最想解決的事件",
      relationship_goal: "最希望達成的目標",
      purpose: "擇日用途",
      other_purpose: "其他擇日用途",
      date_range: "指定日期範圍或避諱",
      location: "地點",
      partner: "其他合夥人",
    },
    cleanInputLabel = (value: string) => value.replace(/[／/]/g, "或"),
    renderInputValue = (value: any): string =>
      Array.isArray(value)
        ? value.map((entry) => clean(entry)).filter(Boolean).join("、")
        : clean(value),
    overallFocusLabel: Record<string, Record<string, string>> = {
      想換工作: {
        "目前公司／產業": "公司或產業", "目前職位與主要工作內容": "職位或工作",
        "希望轉往的方向／職務": "希望轉往", "想離開或換工作的主要原因": "離開原因",
      },
      職涯迷惘: {
        "目前正在考慮的選擇": "考慮中的選擇", "目前的工作／待業狀態": "工作或待業狀態",
        "選擇工作時最在意的條件": "最在意的條件", "目前最大的困難": "目前困難",
      },
      財務壓力: {
        "最希望改善的事情": "想改善", "目前主要的壓力來源": "壓力來源",
        "這個狀況持續多久了": "持續時間", "是否有重要期限": "重要期限",
      },
    },
    focusFieldOrder: Record<string, string[]> = {
      想換工作: ["目前公司／產業", "目前職位與主要工作內容", "希望轉往的方向／職務", "想離開或換工作的主要原因"],
      職涯迷惘: ["目前正在考慮的選擇", "目前的工作／待業狀態", "選擇工作時最在意的條件", "目前最大的困難"],
      財務壓力: ["最希望改善的事情", "目前主要的壓力來源", "這個狀況持續多久了", "是否有重要期限"],
    },
    sectionMeta = details.flatMap((detail: any) => {
      const answer = one(detail.booking_consultation_answers),
        profile = one(answer?.consultation_profiles),
        presentation = profilePresentation(profile, ownerName),
        extra = answer?.extra_data || {},
        itemCode = one(detail.booking_items)?.code || "",
        healthQuestion = renderInputValue(extra.treatment_question || extra.treatment_question_other),
        healthPlanned = renderInputValue(extra.major_treatment_planned),
        healthTreatmentLines = itemCode === "health" && (healthPlanned || healthQuestion)
          ? [`${/有|是|規劃/.test(healthPlanned) ? "近期是有手術或重大治療規劃，想瞭解" : "近期手術或重大治療規劃，想瞭解"}：${healthQuestion || healthPlanned}`]
          : [],
        simpleRequestLines = Object.entries(extra)
          .filter(
            ([key, value]) =>
              !["major_treatment_planned", "treatment_question", "treatment_question_other"].includes(key) &&
              ((inputLabels[key] && renderInputValue(value) && typeof value !== "object") ||
              (inputLabels[key] && Array.isArray(value) && renderInputValue(value))),
          )
          .map(([key, value]) => `${cleanInputLabel(inputLabels[key])}：${renderInputValue(value)}`),
        focusLines = Object.entries(extra.overall_focus_details || {}).flatMap(([focus, rawRows]) => {
          const rows = rawRows && typeof rawRows === "object" ? rawRows as Record<string, unknown> : {};
          const keys = focusFieldOrder[focus] || Object.keys(rows);
          const content = keys.map((key) => {
            const value = renderInputValue(rows[key]);
            if (!value) return "";
            return `${overallFocusLabel[focus]?.[key] || cleanInputLabel(key)}：${value}`;
          }).filter(Boolean);
          return content.length ? [`【${focus}】`, ...content] : [];
        }).filter(Boolean),
        relationshipTargetIds = Array.from(new Set([
          ...asArray(answer?.booking_answer_participants).slice().sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0)).map((entry: any) => String(entry.profile_id)),
          ...Object.keys(extra.relationship_details || {}),
          ...Object.keys(extra.target_questions || {}),
        ])).filter((targetId) =>
          Object.prototype.hasOwnProperty.call(extra.relationship_details || {}, targetId) ||
          Object.prototype.hasOwnProperty.call(extra.target_questions || {}, targetId),
        ),
        relationshipTargets = relationshipTargetIds.map((targetId) => {
          const rawRows = extra.relationship_details?.[targetId] || {};
          const rows = rawRows && typeof rawRows === "object" ? rawRows as Record<string, unknown> : {};
          const participant = asArray(answer?.booking_answer_participants).find((entry: any) => String(entry.profile_id) === String(targetId));
          const targetProfile = one(participant?.consultation_profiles);
          const targetPresentation = profilePresentation(targetProfile, ownerName);
          const fields = ["relationship_status", "relationship_duration", "main_event", "relationship_goal"]
            .map((key) => renderInputValue(rows[key]) ? `${inputLabels[key]}：${renderInputValue(rows[key])}` : "")
            .filter(Boolean);
          const questions = asArray(extra.target_questions?.[targetId]).map(clean).filter(Boolean).map((value: string, index: number) => `問題${index + 1}：${value}`);
          const compactTargetProfileLines = targetPresentation.profileLines.map((line: string) =>
            line.replace(/^(?:姓名|農曆生日|居住地址)：/, ""),
          );
          const lines = targetProfile
            ? [`【對象：${clean(targetProfile.name) || "未命名"}】`, ...compactTargetProfileLines, ...fields, ...questions]
            : [...fields, ...questions];
          return { targetId, targetProfile, lines };
        }),
        relationshipLines = relationshipTargets.flatMap((entry) => entry.lines),
        pregnancyLines = asArray(extra.pregnancy_losses).flatMap((loss: any, index: number) => {
          const values = [
            renderInputValue(loss?.date) ? `日期：${renderInputValue(loss.date)}` : "",
            renderInputValue(loss?.lunar_date) ? `農曆日期：${renderInputValue(loss.lunar_date)}` : "",
            renderInputValue(loss?.shichen) ? `時辰：${renderInputValue(loss.shichen)}` : "",
            renderInputValue(loss?.notes) ? `備註：${renderInputValue(loss.notes)}` : "",
          ].filter(Boolean);
          return values.length ? [`【流產資料${asArray(extra.pregnancy_losses).length > 1 ? index + 1 : ""}】`, ...values] : [];
        }),
        infantRecords = asArray(extra.pregnancy_losses).map((loss: any, index: number) => ({
          title: `嬰靈${index + 1}`,
          lines: [
            renderInputValue(loss?.date) ? `日期：${renderInputValue(loss.date)}` : "",
            renderInputValue(loss?.lunar_date) ? `農曆日期：${renderInputValue(loss.lunar_date)}` : "",
            renderInputValue(loss?.shichen) ? `時辰：${renderInputValue(loss.shichen)}` : "",
            renderInputValue(loss?.notes) ? `備註：${renderInputValue(loss.notes)}` : "",
          ].filter(Boolean),
        })),
        directQuestions = asArray(answer?.questions).map(clean).filter(Boolean),
        targetQuestions = Object.values(extra.target_questions || {}).flatMap((values) => asArray(values).map(clean).filter(Boolean)),
        questionLines = Array.from(new Set(relationshipLines.length ? directQuestions : [...directQuestions, ...targetQuestions])).map((value, index) => `問題${index + 1}：${value}`),
        requestLines = [...focusLines, ...relationshipLines, ...(itemCode === "infant-spirit" ? [] : pregnancyLines), ...healthTreatmentLines, ...simpleRequestLines, ...questionLines],
        labels = [
          detail.item_title,
          ...asArray(detail.booking_detail_sub_items).map(
            (entry: any) => entry.sub_item_title,
          ),
        ].filter(Boolean),
        infantMultiple = itemCode === "infant-spirit" && /一位以上|兩位|二位|2位|含.*以上/.test(labels.join(" ")),
        dateResultCount = itemCode === "date-time-selection" && /六|6/.test(labels.join(" ")) ? 6 : 3;
      const effectiveLabels = itemCode.startsWith("past-life-") ? labels.slice(0, 1) : labels;
      return effectiveLabels.flatMap((label: string) => {
        const base = {
          label: String(label).replace(/[【】]/g, "").trim(),
          detailId: detail.id,
          itemId: detail.item_id,
          profileId: answer?.profile_id,
          itemCode,
          profile,
          profileName: clean(profile?.name),
          infantMultiple,
          dateResultCount,
          infantRecords,
          ...presentation,
        };
        if (["marriage-bazi", "past-life-relationship"].includes(itemCode) && relationshipTargets.length) {
          return relationshipTargets.map((target) => {
            const targetProfile = target.targetProfile;
            const targetName = clean(targetProfile?.name) || "未命名對象";
            const targetGender = clean(targetProfile?.gender);
            const targetRelation = clean(targetProfile?.relationship_detail || targetProfile?.relationship);
            const targetPresentation = profilePresentation(targetProfile, ownerName);
            const compactTargetProfileLines = targetPresentation.profileLines.map((line: string) =>
              line.replace(/^(?:姓名|農曆生日|居住地址)：/, ""),
            );
            return {
              ...base,
              ...targetPresentation,
              profileName: targetName,
              profileLines: compactTargetProfileLines,
              targetName,
              targetDisplay: `對象：${targetName}${targetGender ? `／${targetGender}` : ""}${targetRelation ? `（${targetRelation}）` : ""}`,
              requestLines: [...compactTargetProfileLines, ...target.lines.filter((line: string) => !/^【對象：/.test(line) && !targetPresentation.profileLines.some((profileLine: string) => profileLine.replace(/^(?:姓名|農曆生日|居住地址)：/, "") === line))],
            };
          });
        }
        return [{ ...base, requestLines }];
      });
    });
  questionSlots = questionSlots.map((slot: any) => {
    const matching = sectionMeta.find((entry: any) =>
      entry.itemCode === slot.itemCode &&
      (!slot.profileName || entry.profileName === slot.profileName),
    );
    return { ...slot, requestLines: matching?.requestLines || [] };
  });
  const historyEligible = sectionMeta.filter(
      (entry: any) =>
        ["infant-spirit", "deceased-relative", "deceased-pet"].includes(entry.itemCode) ||
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
    historyEligible.some((entry: any) => ["infant-spirit", "deceased-relative", "deceased-pet"].includes(entry.itemCode))
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
      for (const meta of historyEligible.filter((entry: any) =>
        ["infant-spirit", "deceased-relative", "deceased-pet"].includes(entry.itemCode),
      )) {
        const currentProfile = meta.profile;
        for (const oldBooking of asArray(oldBookings)) {
          const matchingDetail = asArray(oldBooking.booking_details).find(
            (detail: any) =>
              one(detail.booking_items)?.code === meta.itemCode &&
              asArray(detail.booking_consultation_answers).some((answer: any) =>
                samePerson(currentProfile, one(answer.consultation_profiles)),
              ),
          );
          const saved = replyByBooking.get(String(oldBooking.id));
          if (!matchingDetail || !saved?.final_answer) continue;
          const blockTitle = meta.itemCode === "infant-spirit" ? "嬰靈" : meta.itemCode === "deceased-pet" ? "過世寵物" : "過世親人";
          const escapedTitle = blockTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const block = clean(saved.final_answer).match(
            new RegExp(`【\\s*${escapedTitle}\\s*】([\\s\\S]*?)(?=\\n【|$)`, "u"),
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
        if (["infant-spirit", "deceased-relative", "deceased-pet"].includes(entry.itemCode)) {
          const sentences = content
            .split(/[。！？\n]+/)
            .map((value: string) => value.trim())
            .filter(Boolean);
          excerpt =
            sentences.find((value: string) =>
              /(現在在|目前已(?:經)?投胎|在地府|在枉死城|奈何橋)/.test(value),
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
          ["infant-spirit", "deceased-relative", "deceased-pet"].includes(itemCode)
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
        label: itemCode === "past-life-personal"
          ? "前世因果（個人）"
          : itemCode === "past-life-relationship"
            ? "前世因果（與他人前世關係）"
            : meta.label,
        itemCode,
        profileName: meta.profileName || "",
        profileLines: meta.profileLines || [],
        requestLines: meta.requestLines || [],
        targetDisplay: itemCode === "past-life-relationship"
          ? ((meta as any).targetDisplay || `對象：${(meta as any).targetName || meta.profileName || "未命名"}`)
          : (meta as any).targetDisplay || "",
        targetName: (meta as any).targetName || "",
        infantMultiple: (meta as any).infantMultiple === true,
        infantRecords: (meta as any).infantRecords || [],
        dateResultCount: Number((meta as any).dateResultCount || 3),
        locationSubject:
          itemCode === "infant-spirit" ? "寶寶" : meta.locationSubject || "祂",
        genderPronoun: meta.genderPronoun || "祂",
        isPet: itemCode === "deceased-pet",
        previousLocation,
        manualOnly: false,
      };
    })
    .filter(Boolean) as any[];
  // 前世因果的頁面內還有「前世／綜觀今生」等子標題，不能把這些 Google
  // 文件子標題當成預約項目。這類項目直接以預約資料為準建立清單，才能穩定得到
  // 一個個人項目與每位關係對象各一個項目。
  const nonPastLifeSectionSlots = sectionSlots.filter((slot: any) => !String(slot.itemCode || "").startsWith("past-life-"));
  const pastLifeSectionSlots = sectionMeta
    .filter((meta: any) => String(meta.itemCode || "").startsWith("past-life-"))
    .map((meta: any, index: number) => ({
      slotIndex: rawSectionSlots.length + index,
      label: meta.itemCode === "past-life-personal" ? "前世因果（個人）" : "前世因果（與他人前世關係）",
      answer: "",
      itemCode: meta.itemCode,
      profileName: meta.profileName || "",
      profileLines: meta.profileLines || [],
      requestLines: meta.requestLines || [],
      targetDisplay: meta.itemCode === "past-life-relationship"
        ? (meta.targetDisplay || `對象：${meta.targetName || "未命名"}`)
        : "",
      targetName: meta.targetName || "",
      infantMultiple: false,
      infantRecords: [],
      dateResultCount: 3,
      locationSubject: "祂",
      genderPronoun: "祂",
      isPet: false,
      previousLocation: null,
      manualOnly: false,
    }));
  sectionSlots.splice(0, sectionSlots.length, ...nonPastLifeSectionSlots, ...pastLifeSectionSlots);
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
      const rawExisting = savedReplies[String(slot.slotIndex)] || {};
      const existing = slot.itemCode === "past-life-relationship" && rawExisting.profileName !== slot.profileName ? {} : rawExisting;
      const savedAnswer = clean(existing.answer);
      const documentAnswer = clean(slot.answer);
      const safeSavedAnswer = /^(?:Q\d+\s*[:：]|【)/u.test(savedAnswer) ? "" : savedAnswer;
      const safeDocumentAnswer = /^(?:Q\d+\s*[:：]|【)/u.test(documentAnswer) ? "" : documentAnswer;
      return [
        String(slot.slotIndex),
        {
          selections: existing.selections || {},
          phraseIds: existing.phraseIds || [],
          answer: safeSavedAnswer || safeDocumentAnswer,
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
      const rawExisting = savedSections[String(slot.slotIndex)] || {},
        existing = slot.itemCode === "past-life-relationship" && rawExisting.targetName !== slot.targetName ? {} : rawExisting,
        expected = String(
          recommendedBySection[String(slot.slotIndex)]?.[0] || "",
        ),
        originalIds = asArray(existing.optionIds).map(String),
        optionIds = originalIds.filter((id: string) => {
          if (!expected) return true;
          const actual = optionTopicById.get(id);
          return actual === expected ||
            (expected === "infant_spirit" && actual === "deceased");
        }),
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
        partner2Ids = new Set(asArray(body.partner2OptionIds).map(String)),
        partnerRows = valid.filter((selection) =>
          selection.optionCode.startsWith("partner_personality_") && !partner2Ids.has(selection.optionId),
        ),
        partner2Rows = valid.filter((selection) =>
          selection.optionCode.startsWith("partner_personality_") && partner2Ids.has(selection.optionId),
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
                  optionCode: selection.optionCode,
                  content:
                    loveBuiltInCopy[selection.optionCode] ||
                    overallBuiltInCopy[selection.optionCode] ||
                    healthBuiltInCopy[selection.optionCode] ||
                    lawsuitBuiltInCopy[selection.optionCode] ||
                    homeBuiltInCopy[selection.optionCode] ||
                    spiritualBuiltInCopy[selection.optionCode] ||
                    dateResultBuiltInCopy[selection.optionCode] ||
                    pastLifeBuiltInCopy[selection.optionCode] ||
                    spiritBuiltInCopy[selection.optionCode] ||
                    "",
                }
              : (() => {
                  const entry = pick(
                  (phrases || []).filter(
                    (entry: any) => entry.option_id === selection.optionId,
                  ),
                  previous,
                  );
                  return entry ? { ...entry, optionCode: selection.optionCode } : null;
                })(),
          )
          .filter((entry: any) => entry?.content) as any[],
        locationSelected = valid.some(
          (selection) => selection.optionCode === "location",
        ),
        customLocation = clean(body.customLocation),
        locationSubject = clean(body.locationSubject) || "祂",
        reincarnatedAs = clean(body.reincarnatedAs),
        reincarnatedKind = clean(body.reincarnatedKind),
        reincarnatedPlace = clean(body.reincarnatedPlace),
        reincarnatedAge = clean(body.reincarnatedAge),
        infantYears = clean(body.infantYears),
        locationMode = clean(body.locationMode),
        locationSentence = locationSelected
          ? locationMode === "reincarnated"
            ? reincarnatedKind === "animal"
              ? `目前已經投胎，現在是一隻${reincarnatedAs || "動物"}${reincarnatedPlace ? `，已投胎到${reincarnatedPlace}` : ""}。`
              : reincarnatedKind === "human"
                ? `目前已經投胎，現在是一個${reincarnatedAs || "人"}${reincarnatedPlace ? `，已投胎到${reincarnatedPlace}` : ""}${reincarnatedAge ? `，目前約${reincarnatedAge}歲` : ""}。`
                : "目前已經投胎。"
            : locationMode === "bridge"
              ? `${locationSubject}現在在奈何橋。`
            : customLocation
              ? `${locationSubject}現在在${customLocation}。`
              : ""
          : "";
      const subject = clean(body.locationSubject) || "祂",
        pronoun = clean(body.genderPronoun) || "祂",
        deity = clean(body.customDeity) || "神佛",
        worshipDeities = asArray(body.worshipDeities).map(clean).filter(Boolean),
        visitTarget = clean(body.visitTarget) || (clean(body.locationSubject) === "寶寶" ? "父母" : "親友"),
        customVisitReason = clean(body.customVisitReason),
        shortPersonName = (value: string) => /^[\u3400-\u9fff]{2,4}$/u.test(value) && value.length > 2 ? value.slice(1) : value,
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
              .replaceAll("{infantYears}", infantYears || "一段時間")
              .replaceAll("{customVisitReason}", customVisitReason)
              .replaceAll("{selfName}", shortPersonName(clean(body.selfName) || "本人"))
              .replaceAll("{partnerName}", shortPersonName(clean(body.partnerName) || "對方"))
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
        loveFormat = body.loveFormat === true || personalLove,
        pickRows = (rows: any[]) =>
          rows
            .map((row) => row.optionId.startsWith("virtual-")
              ? { id: row.optionId, content: loveBuiltInCopy[row.optionCode] || "" }
              : pick(
                (phrases || []).filter(
                  (entry: any) => entry.option_id === row.optionId,
                ),
                previous,
              ),
            )
            .filter((entry: any) => entry?.content) as any[],
        selfPhrases = pickRows(selfRows),
        partnerPhrases = pickRows(partnerRows),
        partner2Phrases = pickRows(partner2Rows),
        selfSentence = selfPhrases
          .map((entry, index) => {
            let value = render(entry.content);
            if (index === 0) {
              const prefix = personalLove ? `(${selfName})` : `本身(${selfName})`;
              const transformed = value
                .replace(/^你自己的/, prefix)
                .replace(/^你的/, `${prefix}的`)
                .replace(/^你/, prefix);
              return transformed === value ? `${prefix}${value}` : transformed;
            }
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
              return value
                .replace(/^容易遇到的對象[，,]?/, "")
                .replace(/^對方的個性/, "")
                .replace(/^對方的?/, "")
                .trim();
            return index === 0
              ? value.replace(/^對方/, `對方(${partnerName})`)
              : value;
          })
          .join(" "),
        partner2Sentence = partner2Phrases
          .map((entry, index) => {
            const value = render(entry.content);
            return index === 0
              ? value.replace(/^對方的個性/, "").replace(/^對方的?/, "").trim()
              : value.replace(/^對方的?/, "").trim();
          })
          .join(" "),
        romanceAges = asArray(body.romanceAges).map(clean).filter(Boolean).slice(0, 3),
        divorceAges = asArray(body.divorceAges).map(clean).filter(Boolean).slice(0, 2),
        romanceTimingSentence = romanceAges.length
          ? `紅鸞星：會落在${romanceAges.map((age) => `${age}歲`).join("、")}（容易會遇到有緣份的對象，或者是感情會有明顯進展。）`
          : "",
        divorceTimingSentence = divorceAges.length
          ? `而離婚或離異的高風險年齡則要特別注意：${divorceAges.map((age) => `${age}歲`).join("、")}。`
          : "";
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
        hasRelation = relationCodes.size > 0,
        relationParts = [
          hasRelation ? `與${uniqueDeities.join("、")}有緣` : "",
          relationCodes.has("deity_relation_protect")
            ? "也有在身邊護持著自己"
            : "",
          relationCodes.has("deity_relation_guide")
            ? "遇到事情時也會得到一些指引"
            : "",
        ].filter(Boolean),
        uniqueWorshipDeities = Array.from(new Set(worshipDeities)),
        sameWorship =
          uniqueWorshipDeities.length > 0 &&
          uniqueWorshipDeities.length === uniqueDeities.length &&
          uniqueWorshipDeities.every((name) => uniqueDeities.includes(name)),
        worshipSentence = uniqueWorshipDeities.length
          ? sameWorship
            ? "有空可以多走其大廟，對自己會有最直接的助力。"
            : `有空可以多走其大廟，另外也可以多拜${uniqueWorshipDeities.join("、")}，對自己會有最直接的助力。`
          : "",
        deitySentence = uniqueDeities.length
          ? relationParts.length
            ? `${relationParts.join("，")}${worshipSentence ? `，${worshipSentence}` : "。"}`
            : worshipSentence || `與${uniqueDeities.join("、")}有緣。`
          : uniqueWorshipDeities.length
            ? `有空可以多拜${uniqueWorshipDeities.join("、")}，對自己會有最直接的助力。`
            : "",
        standardAnswerParts = [
          locationSentence,
          elementSentence,
          deitySentence,
          meetSentence,
          ...chosen.map((entry) => render(entry.content)),
          combinedHelp,
          combinedScripture,
        ].filter(Boolean),
        safeHeading = (label: string) => `\u2060【${label}】`,
        overallChosenGroup = (prefixes: string[]) => chosen
          .filter((entry: any) => prefixes.some((prefix) => String(entry.optionCode || "").startsWith(prefix)))
          .map((entry: any) => render(entry.content))
          .filter(Boolean)
          .join(" "),
        overallKnownPrefixes = ["status_overall_", "advice_overall_", "recent_", "body_"],
        overallOther = chosen
          .filter((entry: any) => !overallKnownPrefixes.some((prefix) => String(entry.optionCode || "").startsWith(prefix)))
          .map((entry: any) => render(entry.content))
          .filter(Boolean)
          .join(" "),
        overallBody = overallChosenGroup(["body_"]),
        overallStatus = overallChosenGroup(["status_overall_"]),
        overallRecent = chosen
          .filter((entry: any) => String(entry.optionCode || "").startsWith("recent_") && !String(entry.optionCode || "").startsWith("recent_advice_"))
          .map((entry: any) => render(entry.content)).filter(Boolean).join(" "),
        overallAdvice = [overallChosenGroup(["advice_overall_", "recent_advice_"]), overallOther].filter(Boolean).join(" "),
        overallDestiny = [elementSentence, deitySentence].filter(Boolean).join(" "),
        overallAnswer = [
          overallBody ? `${safeHeading("身體狀況")}\n${overallBody}` : "",
          overallDestiny ? `${safeHeading("本命格")}\n${overallDestiny}` : "",
          overallStatus ? `${safeHeading("整體運勢")}\n${overallStatus}` : "",
          overallRecent ? `${safeHeading("最近狀況")}\n${overallRecent}` : "",
          overallAdvice ? `${safeHeading("建議")}\n${overallAdvice}` : "",
        ].filter(Boolean).join("\n\n"),
        selectedSection = data.sectionSlots.find((slot: any) => Number(slot.slotIndex) === Number(body.sectionSlotIndex)),
        pastGroup = (prefix: string) => chosen.filter((entry: any) => String(entry.optionCode || "").startsWith(prefix)).map((entry: any) => render(entry.content)).filter(Boolean).join(" "),
        pastOverviewParts = chosen.filter((entry: any) => String(entry.optionCode || "").startsWith("past_overview_")).map((entry: any) => render(entry.content)).filter(Boolean),
        pastOverview = Array.from({ length: Math.ceil(pastOverviewParts.length / 3) }, (_, index) => pastOverviewParts.slice(index * 3, index * 3 + 3).join(" ")).join("\n"),
        pastConsultant = pastGroup("past_consultant_"),
        pastTarget = pastGroup("past_target_"),
        pastRelationship = pastGroup("past_relationship_"),
        pastLifeAnswer = selectedSection?.itemCode === "past-life-personal"
          ? pastOverview
          : [
              pastOverview ? `${safeHeading("綜觀今生")}\n${pastOverview}` : "",
              pastConsultant || pastTarget || pastRelationship ? `${safeHeading("兩人相處建議")}\n${[pastConsultant, pastTarget, pastRelationship].filter(Boolean).join(" ")}` : "",
            ].filter(Boolean).join("\n\n"),
        healthAnswer = chosen
          .map((entry: any) => render(entry.content).replace(/[。；;]+$/u, ""))
          .filter(Boolean)
          .join("、") + (chosen.length ? "。" : ""),
        answer = valid.some((selection) => selection.topicCode === "past_life")
          ? pastLifeAnswer
          : loveFormat
          ? [
              selfSentence ? `${safeHeading("本身的個性")}\n${selfSentence}` : "",
              partnerSentence || partner2Sentence
                ? `${safeHeading("對象特質")}\n${personalLove ? `以下是容易遇到的對象特質\n${[
                      partnerSentence ? `對象1：${partnerSentence}` : "",
                      partner2Sentence ? `對象2：${partner2Sentence}` : "",
                    ].filter(Boolean).join("\n")}` : [partnerSentence, partner2Sentence].filter(Boolean).join("\n")}`
                : "",
              romanceTimingSentence || divorceTimingSentence || standardAnswerParts.length
                ? `${safeHeading("感情運")}\n${[romanceTimingSentence, divorceTimingSentence].filter(Boolean).join("\n")}${(romanceTimingSentence || divorceTimingSentence) && standardAnswerParts.length ? "\n\n" : ""}${standardAnswerParts.join(" ")}`
                : "",
            ].filter(Boolean).join("\n\n")
          : valid.some((selection) => selection.topicCode === "overall")
            ? overallAnswer
            : valid.some((selection) => selection.topicCode === "health")
              ? healthAnswer
            : [selfSentence, partnerSentence, ...standardAnswerParts].filter(Boolean).join(" ");
      if (!answer)
        return NextResponse.json(
          { error: "這些選項目前沒有可用句子" },
          { status: 400 },
        );
      return NextResponse.json({
        ok: true,
        answer,
        phraseIds: [...chosen, ...selfPhrases, ...partnerPhrases, ...partner2Phrases].map(
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
      questionReplies: Record<string, any> = { ...(data.questionReplies || {}) },
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
        profileName: slot.profileName || "",
      };
      // 文件中已有相同答案時不要重複刪除、重寫。Google Docs 不允許刪除
      // 段落末端的保留換行，重寫相同 A1/A2 會讓後續「綜觀今生」整批中止。
      if (normalizeConsultationReturnText(String(slot.answer || "")) !== answer)
        answers[String(slot.slotIndex)] = answer;
    }
    const incomingSections =
        body.sectionReplies && typeof body.sectionReplies === "object"
          ? body.sectionReplies
          : {},
      sectionReplies: Record<string, any> = { ...(data.sectionReplies || {}) },
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
        targetName: slot.targetName || "",
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
      ].map(String).filter((id) => id && !id.startsWith("virtual-")),
      finalAnswer = [
        ...Object.entries(questionReplies).map(
          ([index, row]: any) =>
            `A${data.questionSlots[Number(index)]?.questionNumber || Number(index) + 1}:${row.answer}`,
        ),
        ...Object.entries(sectionReplies).map(
          ([index, row]: any) =>
            `【${data.sectionSlots.find((slot: any) => String(slot.slotIndex) === String(index))?.label || "項目"}】${row.answer}`,
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
    const pastLifeOverviewAnswers = data.sectionSlots
      .filter((slot: any) => slot.itemCode.startsWith("past-life-"))
      .map((slot: any) => ({
        answer: sectionAnswers[String(slot.slotIndex)] || "",
        itemCode: slot.itemCode,
        targetName: slot.targetName || "",
        profileName: slot.profileName || "",
      }));
    const regularSectionAnswers = Object.fromEntries(
      Object.entries(sectionAnswers).filter(([index]) =>
        !String(data.sectionSlots.find((slot: any) => String(slot.slotIndex) === String(index))?.itemCode || "").startsWith("past-life-"),
      ),
    );
    if (Object.keys(regularSectionAnswers).length)
      await upsertQuickConsultationSectionReplies(
        data.documentDetail.google_document_id,
        regularSectionAnswers,
      );
    if (pastLifeOverviewAnswers.some((entry: any) => entry.answer))
      await upsertPastLifeOverviewReplies(
        data.documentDetail.google_document_id,
        pastLifeOverviewAnswers,
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
