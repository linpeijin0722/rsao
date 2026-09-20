"use client";
import { useEffect, useMemo, useRef, useState } from "react";
const asCodes = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : value
      ? [String(value)]
      : [];
const groupOverallRequestLines = (lines: string[]) => {
  const groups: { title: string; fields: { label: string; value: string }[] }[] = [];
  for (const line of lines || []) {
    const heading = /^【(.+)】$/.exec(line);
    if (heading) {
      groups.push({ title: heading[1], fields: [] });
      continue;
    }
    const split = line.indexOf("：");
    const field = {
      label: split >= 0 ? line.slice(0, split) : "補充內容",
      value: split >= 0 ? line.slice(split + 1) : line,
    };
    if (!groups.length) groups.push({ title: "其他內容", fields: [] });
    groups[groups.length - 1].fields.push(field);
  }
  return groups.filter((group) => group.fields.length);
};
type Option = { id: string; code: string; label: string };
type Topic = { code: string; title: string; icon: string; options: Option[] };
type Question = {
  slotIndex: number;
  questionNumber: number;
  question: string;
  answer: string;
  itemCode: string;
  itemTitle: string;
  profileName: string;
  profileLines: string[];
  requestLines: string[];
  manualOnly: boolean;
};
type PreviousLocation = {
  date: string;
  name: string;
  text: string;
  rank: number;
};
type Section = {
  slotIndex: number;
  label: string;
  answer: string;
  itemCode: string;
  manualOnly: boolean;
  profileName: string;
  profileLines: string[];
  requestLines: string[];
  targetDisplay?: string;
  targetName?: string;
  infantMultiple?: boolean;
  infantRecords?: { title: string; lines: string[] }[];
  dateResultCount?: number;
  locationSubject: string;
  genderPronoun: string;
  isPet: boolean;
  previousLocation?: PreviousLocation | null;
};
type Draft = {
  selections: Record<string, string[]>;
  phraseIds: string[];
  answer: string;
  completed?: boolean;
};
type SectionDraft = {
  optionIds: string[];
  phraseIds: string[];
  answer: string;
  completed?: boolean;
  accentElementIds?: string[];
  spiritualDetail?: string;
};
type DateResultRow = {
  date: string;
  verdict: string;
};
const emptyDateResultRow = (): DateResultRow => ({
  date: "",
  verdict: "",
});
const dateResultLine = (row: DateResultRow, index: number) => {
  if (!row.date.trim()) return "";
  return `第${index + 1}組：${row.date.trim()}${row.verdict ? `｜${row.verdict}` : ""}`;
};
type ReplyData = {
  bookingNo: string;
  customerName: string;
  questions: Question[];
  sections: Section[];
  topics: Topic[];
  recommendedByQuestion: Record<string, string[]>;
  recommendedBySection: Record<string, string[]>;
  questionReplies: Record<string, Draft>;
  sectionReplies: Record<string, SectionDraft>;
  previousSummaries: {
    itemCode: string;
    itemTitle: string;
    date: string;
    text: string;
  }[];
  documentUrl: string;
  accessToken: string;
};
export default function QuickConsultationReply({
  bookingNo,
  documentId,
  onClose,
  standalone = false,
  initialAccessToken = "",
  externalItemCode = "",
}: {
  bookingNo: string;
  documentId: string;
  onClose: () => void;
  standalone?: boolean;
  initialAccessToken?: string;
  externalItemCode?: string;
}) {
  const emptyNames = () =>
    Array.from({ length: 6 }, () => ({ name: "", aid: "未選擇", custom: "未選擇" }));
  const [data, setData] = useState<ReplyData | null>(null),
    [accessToken, setAccessToken] = useState(initialAccessToken),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<"section" | "question">("section"),
    [activeQuestion, setActiveQuestion] = useState(0),
    [activeSection, setActiveSection] = useState(0),
    [activeCategory, setActiveCategory] = useState<Record<string, string>>({}),
    [sectionCategory, setSectionCategory] = useState<Record<string, string>>(
      {},
    ),
    [locationMode, setLocationMode] = useState<Record<string, string>>({}),
    [locationHall, setLocationHall] = useState<Record<string, string>>({}),
    [reincarnatedAs, setReincarnatedAs] = useState<Record<string, string>>({}),
    [reincarnatedKind, setReincarnatedKind] = useState<Record<string, "human" | "animal">>({}),
    [reincarnatedPlace, setReincarnatedPlace] = useState<Record<string, string>>({}),
    [reincarnatedAge, setReincarnatedAge] = useState<Record<string, string>>({}),
    [infantYears, setInfantYears] = useState<Record<string, string>>({}),
    [dateResultRows, setDateResultRows] = useState<Record<string, DateResultRow[]>>({}),
    [dateTimeSupplements, setDateTimeSupplements] = useState<Record<string, { timeChoice: string; timeVerdict: string }>>({}),
    [partner2Enabled, setPartner2Enabled] = useState<Record<string, boolean>>({}),
    [partner2Selections, setPartner2Selections] = useState<Record<string, string[]>>({}),
    [romanceAges, setRomanceAges] = useState<Record<string, string[]>>({}),
    [divorceAges, setDivorceAges] = useState<Record<string, string[]>>({}),
    [customDeity, setCustomDeity] = useState<Record<string, string>>({}),
    [elementAccentSelections, setElementAccentSelections] = useState<Record<string, string[]>>({}),
    [spiritualDetails, setSpiritualDetails] = useState<Record<string, string>>({}),
    [worshipDeities, setWorshipDeities] = useState<Record<string, string[]>>({}),
    [namingRows, setNamingRows] = useState<
      Record<string, { name: string; aid: string; custom: string }[]>
    >({}),
    [openPanels, setOpenPanels] = useState<Record<string, boolean>>({}),
    [locationConfirm, setLocationConfirm] = useState<{
      mode: string;
      hall: string;
      previous: PreviousLocation;
      nextLabel: string;
    } | null>(null),
    [detailVersion, setDetailVersion] = useState(0),
    [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({}),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>(
      {},
    ),
    [manualSectionReplies, setManualSectionReplies] = useState<Record<string, string>>({}),
    [activeInfantBySection, setActiveInfantBySection] = useState<Record<string, number>>({}),
    [sectionPending, setSectionPending] = useState<Record<string, boolean>>({}),
    itemMenuRef = useRef<HTMLElement | null>(null),
    itemDetailRef = useRef<HTMLDivElement | null>(null),
    [busy, setBusy] = useState(false),
    [written, setWritten] = useState(false),
    [editing, setEditing] = useState(false);
  const sectionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
      {},
    ),
    consultantWarningShown = useRef(false),
    elementAccentSelectionsRef = useRef<Record<string, string[]>>({}),
    sectionSelections = useRef<Record<string, string[]>>({}),
    sectionRequestVersions = useRef<Record<string, number>>({}),
    deceasedDetails = useRef<
      Record<
        string,
        {
          deity: string;
          customDeity: string;
          visitTarget: string;
          customVisitReason: string;
        }
      >
    >({});
  useEffect(() => {
    fetch(
      `/api/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}&token=${encodeURIComponent(initialAccessToken)}&externalItemCode=${encodeURIComponent(externalItemCode)}`,
    )
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error || "讀取失敗");
        setData(x);
        setAccessToken(x.accessToken || initialAccessToken);
        setDrafts(x.questionReplies || {});
        setSectionDrafts(x.sectionReplies || {});
        const savedAccents = Object.fromEntries(Object.entries(x.sectionReplies || {}).map(([key, value]) => [key, (value as SectionDraft).accentElementIds || []]));
        elementAccentSelectionsRef.current = savedAccents;
        setElementAccentSelections(savedAccents);
        setSpiritualDetails(Object.fromEntries(Object.entries(x.sectionReplies || {}).map(([key, value]) => [key, (value as SectionDraft).spiritualDetail || ""])));
        sectionSelections.current = Object.fromEntries(
          Object.entries(x.sectionReplies || {}).map(([key, value]) => [
            key,
            (value as SectionDraft).optionIds || [],
          ]),
        );
        setActiveCategory(
          Object.fromEntries(
            (x.questions || []).map((q: Question) => [
              String(q.slotIndex),
              x.recommendedByQuestion?.[String(q.slotIndex)]?.[0] ||
                x.topics?.[0]?.code ||
                "",
            ]),
          ),
        );
        setSectionCategory(
          Object.fromEntries(
            (x.sections || []).map((s: Section) => [
              String(s.slotIndex),
              x.recommendedBySection?.[String(s.slotIndex)]?.[0] ||
                x.topics?.[0]?.code ||
                "",
            ]),
          ),
        );
        if (!(x.sections || []).some((s: Section) => !s.manualOnly))
          setView("question");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"))
      .finally(() => setLoading(false));
    return () => Object.values(sectionTimers.current).forEach(clearTimeout);
  }, [bookingNo, documentId, initialAccessToken, externalItemCode]);
  const topicMap = useMemo(
      () => new Map((data?.topics || []).map((t) => [t.code, t])),
      [data],
    ),
    sections = (data?.sections || []).filter((s) => !s.manualOnly),
    section = sections[activeSection],
    baseSectionKey = String(section?.slotIndex ?? 0),
    infantRecordCount = section?.itemCode === "infant-spirit" ? Math.max(section.infantRecords?.length || 0, section.infantMultiple ? 2 : 1) : 1,
    activeInfantIndex = Object.prototype.hasOwnProperty.call(activeInfantBySection, baseSectionKey)
      ? Math.min(activeInfantBySection[baseSectionKey], infantRecordCount - 1)
      : 0,
    effectiveInfantIndex = Math.max(0, activeInfantIndex),
    sectionKey = section?.itemCode === "infant-spirit" && effectiveInfantIndex > 0 ? `${baseSectionKey}:infant:${effectiveInfantIndex}` : baseSectionKey,
    sectionDraft = sectionDrafts[sectionKey] || {
      optionIds: [],
      phraseIds: [],
      answer: "",
      completed: false,
    },
    sectionTopic = topicMap.get(sectionCategory[sectionKey] || sectionCategory[baseSectionKey] || ""),
    sectionTopicCodes = data?.recommendedBySection?.[baseSectionKey] || [],
    spiritTopicCodes = ["infant_spirit", "deceased", "deceased_pet"],
    visibleSectionTopics = (data?.topics || []).filter(
      (topic) =>
        !spiritTopicCodes.includes(topic.code) ||
        sectionTopicCodes.includes(topic.code),
    ),
    scriptureOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("assistance_scripture_"),
      ) || [],
    helpOptions =
      sectionTopic?.options.filter(
        (o) =>
          o.code.startsWith("assistance_") &&
          !o.code.startsWith("assistance_scripture_"),
      ) || [],
    deceasedMoodOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_mood_"),
      ) || [],
    deceasedDivineOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_divine_"),
      ) || [],
    deceasedVisitOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_visit_"),
      ) || [],
    deceasedReasonOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_reason_"),
      ) || [],
    deceasedPeaceOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_peace_"),
      ) || [],
    deceasedOfferingReasonOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deceased_offering_reason_"),
      ) || [],
    deceasedOfferingOptions =
      sectionTopic?.options.filter(
        (o) =>
          o.code.startsWith("deceased_offering_") &&
          !o.code.startsWith("deceased_offering_reason_"),
      ) || [],
    infantBridgeOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("infant_bridge_")) || [],
    infantRebirthOptions =
      sectionTopic?.options.filter(
        (o) => o.code.startsWith("infant_rebirth_") && o.code !== "infant_rebirth_years",
      ) || [],
    infantYearsOption =
      sectionTopic?.options.find((o) => o.code === "infant_rebirth_years"),
    loveTrendOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("love_trend_")) ||
      [],
    meetOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("meet_")) || [],
    selfPersonalityOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("self_personality_"),
      ) || [],
    partnerPersonalityOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("partner_personality_"),
      ) || [],
    loveOtherOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("love_other_")) ||
      [],
    relationshipSituationLabels = new Set(["可能有遠距離", "年齡可能有差距", "容易受到工作影響", "容易受到家人意見影響"]),
    relationshipSituationOptions = Array.from(new Map(
      (sectionTopic?.options.filter((o) => o.code.startsWith("relationship_situation_") || relationshipSituationLabels.has(o.label)) || [])
        .map((o) => [o.label, o]),
    ).values()),
    remainingLoveOtherOptions = loveOtherOptions.filter((o) => !relationshipSituationLabels.has(o.label)),
    relationshipAdviceOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("relationship_advice_")) || [],
    spiritPlainOptions =
      sectionTopic && spiritTopicCodes.includes(sectionTopic.code)
        ? sectionTopic.options.filter(
            (o) =>
              o.code !== "location" &&
              !o.code.startsWith("assistance_") &&
              !o.code.startsWith("buddhist_") &&
              !o.code.startsWith("status_") &&
              !o.code.startsWith("condition_") &&
              !o.code.startsWith("deceased_") &&
              !o.code.startsWith("infant_"),
          )
        : [],
    statusOptions =
      sectionTopic?.options
        .filter(
          (o) =>
            (["home", "spiritual"].includes(sectionTopic?.code || "")
              ? false
              : sectionTopic?.code === "overall"
              ? o.code.startsWith("status_overall_")
              : o.code.startsWith("status_") ||
                o.code.startsWith("condition_")),
        )
        ?.concat(spiritPlainOptions) || [],
    adviceOptions =
      sectionTopic?.options.filter((o) =>
        ["home", "spiritual"].includes(sectionTopic?.code || "")
          ? false
          : sectionTopic?.code === "overall"
          ? o.code.startsWith("advice_overall_")
          : o.code.startsWith("advice_"),
      ) || [],
    recentPositiveOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("recent_positive_"),
      ) || [],
    recentNegativeOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("recent_negative_"),
      ) || [],
    recentDetailOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("recent_detail_"),
      ) || [],
    recentAdviceOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("recent_advice_"),
      ) || [],
    healthAdviceOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("health_advice_")) || [],
    dateJudgmentOptions = sectionTopic?.options.filter((o) => o.code.startsWith("date_judgment_")) || [],
    dateSupportOptions = sectionTopic?.options.filter((o) => o.code.startsWith("date_support_")) || [],
    dateNoticeOptions = sectionTopic?.options.filter((o) => o.code.startsWith("date_notice_")) || [],
    pastLifeTopicOptions = sectionTopic?.options || [],
    pastLifeOptionGroups = [
      {
        key: "overview",
        title: `綜觀今生${section?.itemCode === "past-life-relationship" && section.targetName ? `：${section.targetName}` : ""}`,
        subgroups: [
          ["個性與人生走向", pastLifeTopicOptions.filter((o) => o.code.startsWith("past_overview_") && !["past_overview_blessing", "past_overview_temple"].includes(o.code))],
          ["建議", pastLifeTopicOptions.filter((o) => ["past_overview_blessing", "past_overview_temple"].includes(o.code))],
        ],
      },
      {
        key: "consultant",
        title: `諮詢者的個性：${data?.customerName || "本人"}`,
        subgroups: [
          ["優點", pastLifeTopicOptions.filter((o) => o.code.startsWith("past_consultant_pro_"))],
          ["需要留意的地方", pastLifeTopicOptions.filter((o) => o.code.startsWith("past_consultant_con_"))],
        ],
      },
      {
        key: "target",
        title: `對象的個性：${section?.targetName || "對象"}`,
        subgroups: [
          ["優點", pastLifeTopicOptions.filter((o) => o.code.startsWith("past_target_pro_"))],
          ["需要留意的地方", pastLifeTopicOptions.filter((o) => o.code.startsWith("past_target_con_"))],
        ],
      },
      {
        key: "relationship",
        title: `兩人相處建議：${data?.customerName || "本人"}與${section?.targetName || "對象"}`,
        subgroups: [
          ["溝通與衝突", pastLifeTopicOptions.filter((o) => ["past_relationship_communicate", "past_relationship_stop", "past_relationship_support", "past_relationship_listen", "past_relationship_calm", "past_relationship_no_cold"].includes(o.code))],
          ["界線與相處", pastLifeTopicOptions.filter((o) => ["past_relationship_boundary", "past_relationship_distance", "past_relationship_respect", "past_relationship_responsibility", "past_relationship_stepback"].includes(o.code))],
          ["維繫關係", pastLifeTopicOptions.filter((o) => ["past_relationship_appreciate", "past_relationship_trust", "past_relationship_goal", "past_relationship_time", "past_relationship_decide"].includes(o.code))],
        ],
      },
    ].filter((group) =>
      (section?.itemCode !== "past-life-personal" || group.key === "overview") &&
      group.subgroups.some(([, options]) => (options as Option[]).length),
    ) as { key: string; title: string; subgroups: [string, Option[]][] }[],
    consultantSelectedElsewhere = section?.itemCode === "past-life-relationship"
      ? sections.find((candidate) => candidate.itemCode === "past-life-relationship" && candidate.slotIndex !== section.slotIndex &&
          (sectionDrafts[String(candidate.slotIndex)]?.optionIds || []).some((id) =>
            pastLifeTopicOptions.find((option) => option.id === id)?.code.startsWith("past_consultant_"),
          ))
      : undefined,
    bodyOptions =
      sectionTopic?.options.filter((o) => {
        if (!o.code.startsWith("body_")) return false;
        if (o.code.startsWith("body_female_"))
          return section?.genderPronoun === "她";
        if (o.code.startsWith("body_male_"))
          return section?.genderPronoun !== "她";
        return true;
      }) || [],
    bodyPositiveOptions = bodyOptions.filter((o) => o.code.startsWith("body_positive_")),
    bodyConcernOptions = bodyOptions.filter((o) => !o.code.startsWith("body_positive_")),
    bodyConcernOrder = [
      "body_headache", "body_dizziness", "body_eyes", "body_neck",
      "body_sleep", "body_breath", "body_allergy", "body_pressure",
      "body_liver", "body_stomach", "body_fatigue", "body_circulation",
      "body_cold", "body_hot", "body_back", "body_joint",
      "body_kidney", "body_female_gynecology", "body_female_cycle",
      "body_male_prostate", "body_male_urinary",
    ],
    sortedBodyConcerns = [...bodyConcernOptions].sort(
      (a, b) => bodyConcernOrder.indexOf(a.code) - bodyConcernOrder.indexOf(b.code),
    ),
    lowerBodyCodes = new Set([
      "body_back", "body_joint", "body_kidney", "body_female_gynecology",
      "body_female_cycle", "body_male_prostate", "body_male_urinary",
    ]),
    upperBodyOptions = sortedBodyConcerns.filter((o) => !lowerBodyCodes.has(o.code)),
    lowerBodyOptions = sortedBodyConcerns.filter((o) => lowerBodyCodes.has(o.code)),
    lawsuitOptionGroups = [
      ["對方態度", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?attitude_/.test(o.code)) || []],
      ["證據", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?evidence_/.test(o.code)) || []],
      ["開庭", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?court_/.test(o.code)) || []],
      ["和解", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?settlement_/.test(o.code)) || []],
      ["後續協助", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?support_/.test(o.code)) || []],
      ["時間", sectionTopic?.options.filter((o) => /^lawsuit_(?:injury_)?time_/.test(o.code)) || []],
    ].filter(([, options]) => (options as Option[]).length) as [string, Option[]][],
    homeConditionOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_condition_")) || [],
    homeImpactOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_impact_")) || [],
    homeAreaOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_area_")) || [],
    homeAdjustOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_adjust_")) || [],
    homeSuitableOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_suitable_")) || [],
    homeFortuneOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_fortune_")) || [],
    homeFinalOptions = sectionTopic?.options.filter((o) => o.code.startsWith("home_final_")) || [],
    spiritualLevelOptions = sectionTopic?.options.filter((o) => o.code.startsWith("spiritual_level_")) || [],
    spiritualFollowOptions = sectionTopic?.options.filter((o) => o.code.startsWith("spiritual_follow_")) || [],
    spiritualSymptomOptions = sectionTopic?.options.filter((o) => o.code.startsWith("spiritual_symptom_")) || [],
    spiritualEntityOptions = sectionTopic?.options.filter((o) => o.code.startsWith("spiritual_entity_")) || [],
    spiritualAdviceOptions = sectionTopic?.options.filter((o) => o.code.startsWith("spiritual_advice_")) || [],
    elementOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("element_")) || [],
    deityOptions =
      sectionTopic?.options.filter(
        (o) =>
          o.code.startsWith("deity_") &&
          !o.code.startsWith("deity_relation_") &&
          o.code !== "deity_custom",
      ) || [],
    deityRelationOptions =
      sectionTopic?.options.filter((o) =>
        o.code.startsWith("deity_relation_"),
      ) || [],
    selectedDeityOptions = deityOptions.filter((option) =>
      sectionDraft.optionIds.includes(option.id),
    ),
    selectedDeityLabels = selectedDeityOptions.map((option) => option.label),
    effectiveWorshipDeities = Object.prototype.hasOwnProperty.call(worshipDeities, sectionKey)
      ? worshipDeities[sectionKey]
      : selectedDeityLabels,
    worshipDeityOptions = [...deityOptions].sort((a, b) => {
      const priority = ["城隍爺", "包府千歲", "觀世音菩薩", "媽祖", "玄天上帝", "關聖帝君", "土地公"];
      const ai = priority.indexOf(a.label), bi = priority.indexOf(b.label);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }),
    buddhistOptions =
      sectionTopic?.options.filter((o) => o.code.startsWith("buddhist_")) || [],
    standardOptions =
      sectionTopic?.options.filter(
        (o) =>
          !["home", "spiritual"].includes(sectionTopic?.code || "") &&
          o.code !== "location" &&
          !o.code.startsWith("assistance_") &&
          !o.code.startsWith("love_trend_") &&
          !o.code.startsWith("meet_") &&
          !o.code.startsWith("self_personality_") &&
          !o.code.startsWith("partner_personality_") &&
          !o.code.startsWith("love_other_") &&
          !o.code.startsWith("relationship_advice_") &&
          !o.code.startsWith("relationship_situation_") &&
          !o.code.startsWith("status_") &&
          !o.code.startsWith("condition_") &&
          !o.code.startsWith("advice_") &&
          !o.code.startsWith("recent_") &&
          !o.code.startsWith("health_advice_") &&
          !o.code.startsWith("date_") &&
          !o.code.startsWith("past_") &&
          !o.code.startsWith("body_") &&
          !o.code.startsWith("home_") &&
          !o.code.startsWith("spiritual_") &&
          !o.code.startsWith("element_") &&
          !o.code.startsWith("deity_") &&
          !o.code.startsWith("buddhist_") &&
          !o.code.startsWith("deceased_") &&
          !o.code.startsWith("lawsuit_") &&
          !spiritTopicCodes.includes(sectionTopic?.code || ""),
      ) || [],
    isPersonalLove =
      section?.itemCode === "personal-romance" ||
      /個人感情運|僅看自己/.test(section?.label || ""),
    isFirstRelationshipSection = section?.itemCode !== "marriage-bazi" ||
      sections.findIndex((entry) => entry.itemCode === "marriage-bazi") === activeSection,
    namingSurname = section?.requestLines.find((line) => line.startsWith("希望姓氏："))?.split("：").slice(1).join("：").trim() || "",
    defaultNamingRows = () => emptyNames().map((row) => ({ ...row, name: namingSurname })),
    showPartnerPersonality = sectionTopic?.code === "love";
  const selfPersonalityGroups = Object.entries(
    selfPersonalityOptions.reduce<Record<string, Option[]>>((groups, option) => {
      const text = option.label;
      const group = /固執|說教|急|敏感|想太多|心軟|沒安全感|過度要求/.test(text)
        ? "需要留意的個性"
        : /原則|能力|反應|責任|做事|穩重|成熟/.test(text)
          ? "做事與責任感"
          : /助人|同情|人緣|忠厚|重感情|體貼/.test(text)
            ? "待人與感情態度"
            : "內在想法與相處方式";
      groups[group] = [...(groups[group] || []), option];
      return groups;
    }, {}),
  );
  const personalLoveProfileMeta = (() => {
    const text = (section?.profileLines || []).join(" ");
    const gender = text.match(/姓名\s*：[^／/\n]+[／/]\s*([男女])/)?.[1] || "";
    const age = Number(text.match(/虛歲\s*：\s*(\d+)/)?.[1] || 0);
    return {
      name: section?.profileName || "諮詢者",
      gender,
      age,
      label: `${section?.profileName || "諮詢者"}${gender ? `(${gender})` : ""}${age ? ` 虛歲：${age}歲` : ""}`,
    };
  })();
  const deceasedLayout = ["deceased", "infant_spirit"].includes(sectionTopic?.code || "");
  const questionGroups = useMemo(() => {
      const groups: { key: string; title: string; questions: Question[] }[] = [];
      for (const entry of data?.questions || []) {
        const isPastLife = entry.itemCode.startsWith("past-life-");
        const key = isPastLife ? `${entry.itemCode}:${entry.profileName || entry.itemTitle}` : `question:${entry.slotIndex}`;
        const existing = groups.find((group) => group.key === key);
        if (existing) {
          existing.questions.push(entry);
          continue;
        }
        const title = entry.itemCode === "past-life-personal"
          ? entry.itemTitle || "前世因果（個人）"
          : entry.itemCode.startsWith("past-life-")
            ? `前世因果（與他人前世關係）｜${entry.profileName || "對方"}`
            : entry.itemTitle;
        groups.push({ key, title, questions: [entry] });
      }
      return groups;
    }, [data?.questions]),
    questionGroup = questionGroups[activeQuestion],
    question = questionGroup?.questions[0],
    questionKey = String(question?.slotIndex ?? 0),
    draft = drafts[questionKey] || {
      selections: {},
      phraseIds: [],
      answer: "",
      completed: false,
    },
    categoryCode = activeCategory[questionKey] || "",
    category = topicMap.get(categoryCode),
    questionOptionGroups = useMemo(() => {
      const groups = new Map<string, Option[]>();
      for (const option of category?.options || []) {
        const code = option.code,
          text = option.label,
          label = /可能有遠距離|年齡可能有差距|容易受到工作影響|容易受到家人意見影響/.test(text)
            ? "兩人之間容易遇到"
            : code.startsWith("love_trend_") && /紅鸞|桃花|正緣|結婚/.test(text)
            ? "正緣、桃花與結婚機會"
            : code.startsWith("love_trend_") && /阻礙|不順|爛桃花|較淡/.test(text)
              ? "感情阻礙與需要留意"
            : code.startsWith("love_trend_")
              ? "感情順利穩定"
            : code.startsWith("meet_")
              ? "容易在哪裡遇到正緣"
              : code.startsWith("self_personality_")
                ? "自己的個性"
              : code.startsWith("partner_personality_")
                  ? "對方或容易遇到的對象個性"
                  : code.startsWith("status_overall_")
                    ? "整體運勢走向"
                  : code.startsWith("spiritual_level_")
                    ? "目前干擾程度"
                  : code.startsWith("spiritual_follow_")
                    ? "外靈跟著哪裡"
                  : code.startsWith("spiritual_symptom_")
                    ? "容易出現什麼狀況"
                  : code.startsWith("spiritual_entity_")
                    ? "外靈的情況"
                  : code.startsWith("spiritual_advice_")
                    ? "阿嫂建議"
                  : code.startsWith("recent_positive_")
                    ? "近期正面狀況"
                  : code.startsWith("recent_negative_")
                    ? "近期需要留意"
                  : code.startsWith("body_")
                    ? "身體狀況"
                  : code.startsWith("advice_")
                    ? "建議"
                    : code.startsWith("status_") ||
                        code.startsWith("condition_")
                      ? "現在狀況"
                      : code.startsWith("assistance_")
                        ? "需要幫助"
                        : /財|錢|收入|支出|投資/.test(text)
                          ? "財運與金錢"
                          : /工作|事業|職場/.test(text)
                            ? "工作與事業"
                            : /健康|身體|開刀|血光|車關/.test(text)
                              ? "健康與安全"
                              : "其它";
        groups.set(label, [...(groups.get(label) || []), option]);
      }
      return Array.from(groups.entries()).sort(([a], [b]) =>
        a === "其它" || a.startsWith("其它") ? 1 : b === "其它" || b.startsWith("其它") ? -1 : 0,
      );
    }, [category]),
    deceasedDetail = deceasedDetails.current[sectionKey] || {
      deity: "趙聖帝君",
      customDeity: "",
      visitTarget: sectionTopic?.code === "infant_spirit" ? "父母" : "親友",
      customVisitReason: "",
    },
    selectedVisitCode =
      deceasedVisitOptions.find((option) =>
        sectionDraft.optionIds.includes(option.id),
      )?.code || "",
    selectedOfferingCode =
      deceasedOfferingOptions.find((option) =>
        sectionDraft.optionIds.includes(option.id),
      )?.code || "";
  void detailVersion;
  const footerProfileLines =
    (view === "section" ? section?.profileLines : question?.profileLines) || [];
  async function post(payload: any) {
    const r = await fetch("/api/staff/quick-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingNo,
          documentId,
          accessToken,
          externalItemCode,
          ...payload,
        }),
      }),
      x = await r.json();
    if (!r.ok) throw new Error(x.error || "處理失敗");
    return x;
  }
  async function compose(next: Record<string, string[]>, reroll = false) {
    if (!question || !Object.values(next).some((values) => values.length))
      return;
    setBusy(true);
    setError("");
    setWritten(false);
    try {
      const x = await post({
        mode: "compose",
        selections: next,
        previousPhraseIds: reroll ? draft.phraseIds : [],
      });
      setDrafts((c) => ({
        ...c,
        [questionKey]: {
          selections: next,
          phraseIds: x.phraseIds || [],
          answer: x.answer || "",
          completed: true,
        },
      }));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生回覆失敗");
    } finally {
      setBusy(false);
    }
  }
  async function composeSection(
    optionIds: string[],
    reroll = false,
    targetSection = section,
    targetKey = sectionKey,
    requestVersion?: number,
    worshipOverride?: string[],
    partner2Override?: string[],
  ) {
    if (!targetSection || !optionIds.length) return;
    const version =
      requestVersion ?? (sectionRequestVersions.current[targetKey] || 0) + 1;
    sectionRequestVersions.current[targetKey] = version;
    const mode = locationMode[targetKey] || "",
      customLocation =
        mode === "hell" && locationHall[targetKey]
          ? `地府${locationHall[targetKey]}`
          : mode === "city"
            ? "枉死城"
            : mode === "bridge"
              ? "奈何橋"
            : "",
      targetIsPersonalLove =
        targetSection.itemCode === "personal-romance" ||
        /個人感情運|僅看自己/.test(targetSection.label || "");
    setSectionPending((c) => ({ ...c, [targetKey]: true }));
    setError("");
    setWritten(false);
    try {
      const partner2Ids = partner2Override || partner2Selections[targetKey] || [];
      const x = await post({
        mode: "compose_section",
        sectionSlotIndex: Number(targetSection.slotIndex),
        optionIds: Array.from(new Set([...optionIds, ...partner2Ids, ...(elementAccentSelectionsRef.current[targetKey] || [])])),
        partner2OptionIds: partner2Ids,
        accentElementIds: elementAccentSelectionsRef.current[targetKey] || [],
        spiritualDetail: spiritualDetails[targetKey] || "",
        locationMode: mode,
        customLocation,
        reincarnatedAs: reincarnatedAs[targetKey] || "",
        reincarnatedKind: reincarnatedKind[targetKey] || "",
        reincarnatedPlace: reincarnatedPlace[targetKey] || "",
        reincarnatedAge: reincarnatedAge[targetKey] || "",
        infantYears: infantYears[targetKey] || "",
        romanceAges: romanceAges[targetKey] || [],
        divorceAges: divorceAges[targetKey] || [],
        customDeity:
          customDeity[targetKey] ||
          [
            deceasedDetails.current[targetKey]?.deity,
            deceasedDetails.current[targetKey]?.customDeity,
          ]
            .filter(Boolean)
            .join("、"),
        worshipDeities: worshipOverride || (Object.prototype.hasOwnProperty.call(worshipDeities, targetKey)
          ? worshipDeities[targetKey]
          : (sectionTopic?.options || [])
              .filter((option) =>
                option.code.startsWith("deity_") &&
                !option.code.startsWith("deity_relation_") &&
                option.code !== "deity_custom" &&
                optionIds.includes(option.id),
              )
              .map((option) => option.label)),
        visitTarget: deceasedDetails.current[targetKey]?.visitTarget || (targetSection.itemCode === "infant-spirit" ? "父母" : "親友"),
        customVisitReason:
          deceasedDetails.current[targetKey]?.customVisitReason || "",
        locationSubject: targetSection.locationSubject,
        genderPronoun: targetSection.genderPronoun,
        selfName: data?.customerName || targetSection.profileName || "",
        partnerName: targetSection.targetName || targetSection.profileName || "",
        personalLove: targetIsPersonalLove,
        loveFormat: targetSection.itemCode === "personal-romance" || targetSection.itemCode === "marriage-bazi",
        previousPhraseIds: reroll
          ? sectionDrafts[targetKey]?.phraseIds || []
          : [],
      });
      if (
        sectionRequestVersions.current[targetKey] === version &&
        sectionSelections.current[targetKey]?.join("|") === optionIds.join("|")
      ) {
        const dateLines = targetSection.itemCode === "date-time-selection"
          ? (dateResultRows[targetKey] || [])
              .map(dateResultLine)
              .filter(Boolean)
              .join("\n")
          : "";
        const timeSupplement = targetSection.itemCode === "date-time-selection" && dateTimeSupplements[targetKey]?.timeChoice
          ? `${dateTimeSupplements[targetKey].timeVerdict === "避開" ? "避開時辰" : "推薦時辰"}：${dateTimeSupplements[targetKey].timeChoice}${dateTimeSupplements[targetKey].timeVerdict ? `（${dateTimeSupplements[targetKey].timeVerdict}）` : ""}`
          : "";
        setSectionDrafts((c) => ({
          ...c,
          [targetKey]: {
            optionIds,
            phraseIds: x.phraseIds || [],
            answer: [dateLines, timeSupplement, x.answer || ""].filter(Boolean).join("\n\n"),
            completed: true,
            accentElementIds: elementAccentSelectionsRef.current[targetKey] || [],
            spiritualDetail: spiritualDetails[targetKey] || "",
          },
        }));
      }
      setEditing(false);
    } catch (e) {
      if (sectionRequestVersions.current[targetKey] === version)
        setError(e instanceof Error ? e.message : "產生回覆失敗");
    } finally {
      if (sectionRequestVersions.current[targetKey] === version)
        setSectionPending((c) => ({ ...c, [targetKey]: false }));
    }
  }
  function scheduleSectionCompose(
    optionIds: string[],
    targetSection = section,
    targetKey = sectionKey,
  ) {
    clearTimeout(sectionTimers.current[targetKey]);
    const version = (sectionRequestVersions.current[targetKey] || 0) + 1;
    sectionRequestVersions.current[targetKey] = version;
    setSectionPending((c) => ({ ...c, [targetKey]: true }));
    sectionTimers.current[targetKey] = setTimeout(
      () =>
        void composeSection(
          optionIds,
          false,
          targetSection,
          targetKey,
          version,
        ),
      280,
    );
  }
  function choose(code: string) {
    if (!category) return;
    const current = asCodes(draft.selections[category.code]),
      nextCodes = current.includes(code)
        ? current.filter((value) => value !== code)
        : current.length < 3
          ? [...current, code]
          : current;
    if (!current.includes(code) && current.length >= 3) {
      window.alert("每一個分類最多選擇 3 個選項");
      return;
    }
    const next = { ...draft.selections, [category.code]: nextCodes };
    setDrafts((c) => ({
      ...c,
      [questionKey]: { ...draft, selections: next, completed: false },
    }));
    if (nextCodes.length) void compose(next);
    else
      setDrafts((c) => ({
        ...c,
        [questionKey]: {
          ...draft,
          selections: next,
          phraseIds: [],
          answer: "",
          completed: false,
        },
      }));
  }
  function toggleOption(id: string) {
    const current =
        sectionSelections.current[sectionKey] || sectionDraft.optionIds,
      selectedOption = pastLifeTopicOptions.find((option) => option.id === id);
    if (!current.includes(id) && selectedOption?.code.startsWith("past_consultant_") && consultantSelectedElsewhere && !consultantWarningShown.current) {
      consultantWarningShown.current = true;
      const message = `「諮詢者的個性」已在「與${consultantSelectedElsewhere.targetName || "其他對象"}的前世關係」中選擇過。\n\n仍要在這個項目選擇嗎？`;
      if (!window.confirm(message)) return;
    }
    const
      next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
    sectionSelections.current[sectionKey] = next;
    setSectionDrafts((c) => ({
      ...c,
      [sectionKey]: {
        ...(c[sectionKey] || sectionDraft),
        optionIds: next,
        answer: "",
        completed: false,
      },
    }));
    if (!next.length) {
      clearTimeout(sectionTimers.current[sectionKey]);
      setSectionPending((c) => ({ ...c, [sectionKey]: false }));
      return;
    }
    scheduleSectionCompose(next);
  }
  function toggleElementAccent(id: string) {
    const current = elementAccentSelectionsRef.current[sectionKey] || [],
      next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    elementAccentSelectionsRef.current = { ...elementAccentSelectionsRef.current, [sectionKey]: next };
    setElementAccentSelections((values) => ({ ...values, [sectionKey]: next }));
    if (sectionDraft.optionIds.length) void composeSection(sectionDraft.optionIds);
  }
  function toggleWorshipDeity(label: string) {
    const current = effectiveWorshipDeities,
      next = current.includes(label)
        ? current.filter((value) => value !== label)
        : [...current, label];
    setWorshipDeities((values) => ({ ...values, [sectionKey]: next }));
    if (sectionDraft.optionIds.length)
      void composeSection(
        sectionDraft.optionIds,
        false,
        section,
        sectionKey,
        undefined,
        next,
      );
  }
  function selectSingleOption(id: string, group: Option[]) {
    const groupIds = new Set(group.map((option) => option.id)),
      current = sectionSelections.current[sectionKey] || sectionDraft.optionIds,
      next = [...current.filter((value) => !groupIds.has(value)), id];
    sectionSelections.current[sectionKey] = next;
    setSectionDrafts((c) => ({
      ...c,
      [sectionKey]: {
        ...(c[sectionKey] || sectionDraft),
        optionIds: next,
        answer: "",
        completed: false,
      },
    }));
    scheduleSectionCompose(next);
  }
  function updateDeceasedDetail(
    field: "deity" | "customDeity" | "visitTarget" | "customVisitReason",
    value: string,
  ) {
    const current = deceasedDetails.current[sectionKey] || {
      deity: "趙聖帝君",
      customDeity: "",
      visitTarget: sectionTopic?.code === "infant_spirit" ? "父母" : "親友",
      customVisitReason: "",
    };
    deceasedDetails.current[sectionKey] = { ...current, [field]: value };
    setDetailVersion((version) => version + 1);
    const selected =
      sectionSelections.current[sectionKey] || sectionDraft.optionIds;
    if (selected.length) scheduleSectionCompose(selected);
  }
  function toggleDeceasedList(
    field: "deity" | "visitTarget",
    value: string,
    max = 99,
  ) {
    const current = deceasedDetails.current[sectionKey] || {
      deity: "趙聖帝君",
      customDeity: "",
      visitTarget: sectionTopic?.code === "infant_spirit" ? "父母" : "親友",
      customVisitReason: "",
    };
    const values = current[field].split("、").filter(Boolean),
      exists = values.includes(value),
      next = exists
        ? values.filter((item) => item !== value)
        : values.length < max
          ? [...values, value]
          : values;
    updateDeceasedDetail(field, next.join("、"));
  }
  function applyCustomDeity() {
    const customOption = sectionTopic?.options.find(
      (o) => o.code === "deity_custom",
    );
    if (!customOption || !customDeity[sectionKey]?.trim()) return;
    const current =
        sectionSelections.current[sectionKey] || sectionDraft.optionIds,
      next = current.includes(customOption.id)
        ? current
        : [...current, customOption.id];
    sectionSelections.current[sectionKey] = next;
    setSectionDrafts((c) => ({
      ...c,
      [sectionKey]: {
        ...(c[sectionKey] || sectionDraft),
        optionIds: next,
        answer: "",
        completed: false,
      },
    }));
    scheduleSectionCompose(next);
  }
  function updateNamingRow(
    index: number,
    field: "name" | "aid" | "custom",
    value: string,
  ) {
    setNamingRows((current) => {
      const rows = [...(current[sectionKey] || defaultNamingRows())];
      rows[index] = { ...rows[index], [field]: value };
      return { ...current, [sectionKey]: rows };
    });
  }
  function generateNamingAnswer() {
    const rows = (namingRows[sectionKey] || defaultNamingRows()).filter((row) => row.name.trim() && row.name.trim() !== namingSurname);
    if (!rows.length) {
      window.alert("請至少填寫一個名字");
      return;
    }
    const templates = [
      (name: string, benefits: string) => `${name}：${benefits}會直接帶起來，做事有人推、重要關卡也比較容易過。`,
      (name: string, benefits: string) => `${name}：主旺${benefits}，往後的人際與發展會走得順，遇事也比較有人接應。`,
      (name: string, benefits: string) => `${name}：格局落在${benefits}，反應快、機會抓得住，長大後做事不會拖泥帶水。`,
      (name: string, benefits: string) => `${name}：${benefits}最突出，能把原本欠缺的助力補上，發展會比同齡更穩。`,
      (name: string, benefits: string) => `${name}：走的是${benefits}，關鍵時刻有人幫，自己也有能力把機會接住。`,
      (name: string, benefits: string) => `${name}：整體名字有力，${benefits}會旺，讀書、工作到成家都走得比較順。`,
    ];
    const answer = rows
      .map((row, index) => {
        const selected = [row.aid, row.custom].filter((value) => value && value !== "未選擇");
        const benefits = selected.length ? selected.join("、") : "整體運勢與行動力";
        return templates[index % templates.length](row.name.trim(), benefits);
      })
      .join("\n");
    setSectionDrafts((current) => ({
      ...current,
      [sectionKey]: { optionIds: [], phraseIds: [], answer, completed: true },
    }));
  }
  function applyLocation(mode: string, hall = "", confirmed = false) {
    const ranks: Record<string, number> = {
        第一殿: 1,
        第二殿: 2,
        第三殿: 3,
        第四殿: 4,
      },
      nextRank =
        mode === "bridge"
          ? 0
          : mode === "city"
          ? 0
          : mode === "reincarnated"
            ? 5
            : mode === "hell" && hall
              ? ranks[hall]
              : -1,
      previous = section?.previousLocation,
      nextLabel =
        mode === "bridge"
          ? "奈何橋"
          : mode === "city"
          ? "枉死城"
          : mode === "reincarnated"
            ? "已投胎"
            : `地府${hall}`;
    if (!confirmed && previous && nextRank >= 0 && nextRank < previous.rank) {
      setLocationConfirm({ mode, hall, previous, nextLabel });
      return;
    }
    setLocationConfirm(null);
    const locationOption = sectionTopic?.options.find(
      (o) => o.code === "location",
    );
    if (!locationOption) return;
    setLocationMode((c) => ({ ...c, [sectionKey]: mode }));
    if (hall) setLocationHall((c) => ({ ...c, [sectionKey]: hall }));
    const current = sectionSelections.current[sectionKey] || sectionDraft.optionIds,
      cleanedCurrent = mode === "reincarnated"
        ? current.filter((id) => !infantBridgeOptions.some((option) => option.id === id))
        : current,
      next = cleanedCurrent.includes(locationOption.id)
        ? cleanedCurrent
        : [locationOption.id, ...cleanedCurrent];
    sectionSelections.current[sectionKey] = next;
    setSectionDrafts((c) => ({
      ...c,
      [sectionKey]: {
        ...(c[sectionKey] || sectionDraft),
        optionIds: next,
        answer: "",
        completed: false,
      },
    }));
    if (mode === "hell" && !hall) return;
    clearTimeout(sectionTimers.current[sectionKey]);
    setSectionPending((c) => ({ ...c, [sectionKey]: true }));
    const customLocation =
      mode === "hell" ? `地府${hall}` : mode === "city" ? "枉死城" : mode === "bridge" ? "奈何橋" : "";
    setError("");
    setWritten(false);
    void post({
      mode: "compose_section",
      sectionSlotIndex: Number(sectionKey),
      optionIds: next,
      locationMode: mode,
      customLocation,
      reincarnatedAs: reincarnatedAs[sectionKey] || "",
      reincarnatedKind: reincarnatedKind[sectionKey] || "",
      reincarnatedPlace: reincarnatedPlace[sectionKey] || "",
      reincarnatedAge: reincarnatedAge[sectionKey] || "",
      infantYears: infantYears[sectionKey] || "",
      locationSubject: section?.locationSubject || "祂",
      genderPronoun: section?.genderPronoun || "祂",
      previousPhraseIds: [],
    })
      .then((x) => {
        if (sectionSelections.current[sectionKey]?.join("|") === next.join("|"))
          setSectionDrafts((c) => ({
            ...c,
            [sectionKey]: {
              optionIds: next,
              phraseIds: x.phraseIds || [],
              answer: x.answer || "",
              completed: true,
            },
          }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "產生回覆失敗"))
      .finally(() => setSectionPending((c) => ({ ...c, [sectionKey]: false })));
  }
  function removeCategory() {
    if (!category) return;
    const next = { ...draft.selections };
    delete next[category.code];
    setDrafts((c) => ({
      ...c,
      [questionKey]: {
        selections: next,
        phraseIds: [],
        answer: Object.values(next).some((values) => asCodes(values).length)
          ? draft.answer
          : "",
        completed: false,
      },
    }));
    if (Object.values(next).some((values) => asCodes(values).length))
      void compose(next);
  }
  function confirmPersonalLoveAge(kind: "romance" | "divorce", index: number) {
    const values = kind === "romance" ? romanceAges : divorceAges;
    const raw = values[sectionKey]?.[index] || "";
    const entered = Number(raw);
    if (!entered || !personalLoveProfileMeta.age || entered >= personalLoveProfileMeta.age) return;
    const confirmed = window.confirm(
      `${personalLoveProfileMeta.name}${personalLoveProfileMeta.gender ? `(${personalLoveProfileMeta.gender})` : ""} 今年虛歲：${personalLoveProfileMeta.age}歲，請確認是否要填入${entered}`,
    );
    if (!confirmed) {
      const setter = kind === "romance" ? setRomanceAges : setDivorceAges;
      setter((current) => {
        const next = [...(current[sectionKey] || [])];
        next[index] = "";
        return { ...current, [sectionKey]: next };
      });
    }
  }
  async function write() {
    if (busy || sectionIsPending) {
      window.alert("帶入內容中請勿跳轉畫面");
      return;
    }
    if (!hasAnswer) return;
    const incompleteInfant = sections.find((entry) => {
      if (entry.itemCode !== "infant-spirit") return false;
      const count = Math.max(entry.infantRecords?.length || 0, entry.infantMultiple ? 2 : 1);
      if (count < 2) return false;
      const baseKey = String(entry.slotIndex);
      const completed = Array.from({ length: count }, (_, index) => sectionDrafts[index ? `${baseKey}:infant:${index}` : baseKey]?.answer?.trim()).filter(Boolean).length;
      return completed < count;
    });
    if (incompleteInfant && !window.confirm("這筆預約有多筆流產資料，目前仍有寶寶資料尚未填寫，請確認是否仍要送出？")) return;
    setBusy(true);
    setError("");
    try {
      await post({
        mode: "write",
        questionReplies: drafts,
        manualReplies: Object.entries(manualSectionReplies).flatMap(([entryKey, value]) => {
          const answer = value.trim();
          if (!answer || !entryKey.startsWith("manual:")) return [];
          const matchingSection = sections
            .map((entry) => String(entry.slotIndex))
            .sort((a, b) => b.length - a.length)
            .find((key) => entryKey.startsWith(`manual:${key}:`));
          if (!matchingSection) return [];
          const rawRemainder = entryKey.slice(`manual:${matchingSection}:`.length),
            remainder = rawRemainder.replace(/^infant:\d+:/, ""), split = remainder.indexOf(":");
          return [{ sectionSlotIndex: Number(matchingSection), label: split >= 0 ? remainder.slice(0, split) : remainder, question: split >= 0 ? remainder.slice(split + 1) : remainder, answer }];
        }),
        sectionReplies: Object.fromEntries(sections.map((entry) => {
          const baseKey = String(entry.slotIndex);
          if (entry.itemCode === "infant-spirit") {
            const count = Math.max(entry.infantRecords?.length || 0, entry.infantMultiple ? 2 : 1);
            const rows = Array.from({ length: count }, (_, index) => sectionDrafts[index ? `${baseKey}:infant:${index}` : baseKey]).filter(Boolean);
            const answers = rows.map((row) => row.answer?.trim()).filter(Boolean);
            const baseRow = sectionDrafts[baseKey] || { optionIds: [], phraseIds: [], answer: "", completed: false };
            return [baseKey, {
              ...baseRow,
              optionIds: rows.flatMap((row) => row.optionIds || []),
              phraseIds: rows.flatMap((row) => row.phraseIds || []),
              answer: answers.map((value, index) => `＊嬰靈${index + 1}\n${value}`).join("\n\n"),
              completed: answers.length > 0,
            }];
          }
          const row = sectionDrafts[baseKey] || { optionIds: [], phraseIds: [], answer: "", completed: false };
          return [baseKey, row];
        })),
      });
      setWritten(true);
      if (data?.documentUrl) window.location.assign(data.documentUrl);
      setEditing(false);
      const consultationDocumentUrl = data?.documentUrl ||
        `https://docs.google.com/document/d/${documentId}/edit`;
      // 寫入成功後固定回到同一份諮詢單，讓阿嫂可以立刻繼續編輯。
      const returnLink = document.createElement("a");
      returnLink.href = consultationDocumentUrl;
      returnLink.target = "_self";
      returnLink.rel = "noopener";
      document.body.appendChild(returnLink);
      returnLink.click();
      window.setTimeout(() => {
        try { window.top!.location.href = consultationDocumentUrl; }
        catch { window.location.href = consultationDocumentUrl; }
      }, 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : "寫入失敗，內容已保留");
      setBusy(false);
    }
  }
  const hasAnswer =
      Object.values(drafts).some((r) => r.answer?.trim()) ||
      Object.values(sectionDrafts).some((r) => r.answer?.trim()) ||
      Object.values(manualSectionReplies).some((value) => value.trim()),
    hasPending = Object.values(sectionDrafts).some(
      (r) => r.optionIds?.length && !r.answer?.trim(),
    ),
    sectionIsPending = Object.values(sectionPending).some(Boolean);
  const adviceFieldFor = (questionText: string, label: string, allowSectionFallback = false, scope?: { itemCode?: string; profileName?: string }) => {
    const normalized = questionText.replace(/[？?。.!！\s]/g, "");
    const targetItemCode = scope?.itemCode || section?.itemCode || "";
    const targetProfileName = scope?.profileName || section?.profileName || "";
    // 只要能對到既有 Qn，就直接更新 An；完全找不到 Qn 時，才建立
    // 「阿嫂回覆：」的自由回覆，交由回傳流程接續編成新的 Q&A。
    const adviceQuestion = normalized.length >= 2 ? data?.questions.find((entry) => {
      const candidate = entry.question.replace(/[？?。.!！\s]/g, "");
      return candidate === normalized && (!targetItemCode || entry.itemCode === targetItemCode) && (!targetProfileName || entry.profileName === targetProfileName);
    }) : undefined;
    if (!adviceQuestion) {
      if (!allowSectionFallback) return null;
      const manualKey = `manual:${sectionKey}:${label}:${questionText}`;
      return (
        <label className="quickReplyInlineAdvice quickReplySectionManualReply">
          <b>阿嫂回覆</b>
          <textarea
            rows={1}
            value={manualSectionReplies[manualKey] || ""}
            placeholder="請輸入本項目的回覆"
            onChange={(event) => {
              setManualSectionReplies((current) => ({ ...current, [manualKey]: event.target.value }));
              setWritten(false);
            }}
          />
        </label>
      );
    }
    const key = String(adviceQuestion.slotIndex);
    return (
      <label className="quickReplyInlineAdvice">
        <b>阿嫂回覆</b>
        <textarea
          rows={1}
          value={drafts[key]?.answer || ""}
          placeholder={`請填寫「${label}」的回答`}
          onChange={(event) => {
            const answer = event.target.value;
            setDrafts((current) => ({
              ...current,
              [key]: {
                selections: current[key]?.selections || {},
                phraseIds: current[key]?.phraseIds || [],
                answer,
                completed: Boolean(answer.trim()),
              },
            }));
            setWritten(false);
          }}
        />
      </label>
    );
  };
  const infantRecordCard = (index: number) => {
    if (!section || section.itemCode !== "infant-spirit") return null;
    const record = section.infantRecords?.[index];
    const recordKey = index ? `${baseSectionKey}:infant:${index}` : baseSectionKey;
    const expanded = activeInfantIndex === index;
    return (
      <article className={expanded ? "expanded" : ""} key={recordKey}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActiveInfantBySection((current) => ({
              ...current,
              [baseSectionKey]: expanded ? -1 : index,
            }));
            setEditing(false);
          }}
        >
          <b>寶寶資料 {index + 1}</b>
          <span>{expanded ? "收合 −" : "展開 ＋"}</span>
        </button>
        {expanded && (
          <div>
            <strong>流產時間資料</strong>
            {record?.lines?.length
              ? record.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)
              : <p>這一筆沒有填寫流產時間資料。</p>}
            <small>以下選項與回覆都屬於這一位寶寶</small>
          </div>
        )}
      </article>
    );
  };
  const pickTarget = (kind: "section" | "question", index: number) => {
    setView(kind);
    kind === "section" ? setActiveSection(index) : setActiveQuestion(index);
    setEditing(false);
    setError("");
    setWritten(false);
    window.requestAnimationFrame(() => itemDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const applyDateResult = () => {
    if (!section || section.itemCode !== "date-time-selection") return;
    const dateLines = (dateResultRows[sectionKey] || [])
      .map(dateResultLine)
      .filter(Boolean)
      .join("\n");
    if (!dateLines) return window.alert("請至少填寫一組日期");
    const supplement = dateTimeSupplements[sectionKey];
    const timeLine = supplement?.timeChoice
      ? `${supplement.timeVerdict === "避開" ? "避開時辰" : "推薦時辰"}：${supplement.timeChoice}${supplement.timeVerdict ? `（${supplement.timeVerdict}）` : ""}`
      : "";
    if (sectionDraft.optionIds.length) return void composeSection(sectionDraft.optionIds);
    setSectionDrafts((current) => ({
      ...current,
      [sectionKey]: { ...sectionDraft, answer: [dateLines, timeLine].filter(Boolean).join("\n\n"), completed: true },
    }));
    setWritten(false);
  };
  const togglePanel = (event: any) => {
    const target = event.target as HTMLElement,
      heading = target.closest(
        ".quickReplySpecialHeading,.quickReplySpiritHeading,.quickReplyHelpHeading",
      );
    if (!heading) return;
    const card = heading.closest(
      ".quickReplySpecialField,.quickReplySpiritCard,.quickReplyHelpCard",
    ) as HTMLElement | null;
    if (!card || card.classList.contains("quickReplyAlwaysOpen")) return;
    card.classList.toggle("expanded");
  };
  return (
    <div className={`quickReplyBackdrop${standalone ? " standalone" : ""}`}>
      <section className="quickReplyPanel" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>建立諮詢回覆</h2>
            {data && (
              <p>
                {data.customerName}｜{data.bookingNo}
              </p>
            )}
          </div>
          {standalone && data?.documentUrl && <a className="quickReplyReturnDocument" href={data.documentUrl}>返回諮詢單</a>}
          {!standalone && <button onClick={onClose}>×</button>}
        </header>
        {loading ? (
          <div className="quickReplyStatus">正在讀取客人問題與句庫…</div>
        ) : error && !data ? (
          <div className="quickReplyStatus error">
            <b>無法開啟</b>
            <p>{error}</p>
            {!standalone && <button onClick={onClose}>返回後台</button>}
          </div>
        ) : (
          data && (
            <div className="quickReplyBody">
              {data.previousSummaries?.length > 0 && (
                <section className="quickReplyPreviousSummary">
                  <h3>最近一次諮詢摘要</h3>
                  {data.previousSummaries.map((entry, index) => (
                    <div key={`${entry.itemCode}-${index}`}>
                      <b>【{entry.itemTitle}】</b>
                      <p>{entry.text}</p>
                    </div>
                  ))}
                </section>
              )}
              {view === "section" && (
                <>
                  {sections.length ? (
                    <section className="quickReplyQuestions" ref={itemMenuRef}>
                      <h3>先點選要填寫的項目標籤</h3>
                      <div>
                        {sections.map((s, i) => {
                          const baseKey = String(s.slotIndex);
                          const babyCount = s.itemCode === "infant-spirit" ? Math.max(s.infantRecords?.length || 0, s.infantMultiple ? 2 : 1) : 1;
                          const done = s.itemCode === "infant-spirit"
                            ? Array.from({ length: babyCount }, (_, babyIndex) => sectionDrafts[babyIndex ? `${baseKey}:infant:${babyIndex}` : baseKey]?.completed === true).every(Boolean)
                            : sectionDrafts[baseKey]?.completed === true;
                          return (
                            <button
                              key={s.slotIndex}
                              className={i === activeSection ? "selected" : ""}
                              onClick={() => pickTarget("section", i)}
                            >
                              <span>{done ? "✓" : "項目"}</span>
                              <b>【{s.label}】{s.targetDisplay && <em className="quickReplyTargetDisplay">　{s.targetDisplay}</em>}</b>
                              <small>
                                {done
                                  ? "已完成回答"
                                  : i === activeSection
                                    ? "目前選取"
                                    : "點此回答"}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : (
                    <div className="quickReplyStatus">
                      這份文件沒有可套用句庫的項目標籤。
                    </div>
                  )}
                  {section && (
                    <>
                      <div ref={itemDetailRef} className="quickReplyItemAnchor" aria-hidden="true" />
                      {section.profileLines?.length > 0 && (
                        <section className="quickReplyProfileCard">
                          <h3>本項目諮詢者資料</h3>
                          {section.profileLines.map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </section>
                      )}
                      {sectionTopic?.code !== "naming_result" && section.itemCode !== "infant-spirit" && (
                          <section className="quickReplyInputCard">
                            <h3>{section.requestLines.length ? "用戶填寫的內容" : "用戶無填寫內容"}</h3>
                            {section.itemCode === "overall-fortune" ? (
                              <div className="quickReplyOverallInputGroups">
                                {groupOverallRequestLines(section.requestLines).map((group) => {
                                  const replyField = group.fields.at(-1);
                                  return (
                                    <section key={group.title} className="quickReplyOverallInputGroup">
                                      <h4>{group.title}</h4>
                                      <div className="quickReplyOverallInputFields">
                                        {group.fields.map((field, index) => (
                                          <div key={`${group.title}-${index}`}>
                                            <b>{field.label}</b>
                                            <p>{field.value}</p>
                                          </div>
                                        ))}
                                      </div>
                                      {adviceFieldFor(replyField?.value || "", replyField?.label || group.title, true)}
                                    </section>
                                  );
                                })}
                                {!groupOverallRequestLines(section.requestLines).length && adviceFieldFor("", "本項目", true)}
                              </div>
                            ) : <>
                              {section.requestLines.map((line, index) => {
                              if (section.itemCode === "past-life-relationship" && section.profileLines.includes(line))
                                return <div key={index} className="quickReplyPlainProfileLine"><p>{line}</p></div>;
                              const split = line.indexOf("：");
                              const heading = /^【(.+)】$/.exec(line);
                              if (heading)
                                return (
                                  <div key={index} className="quickReplyInputGroupHeading">
                                    <b>{heading[1]}</b>
                                  </div>
                                );
                              const label = split >= 0 ? line.slice(0, split) : "補充內容";
                              const value = split >= 0 ? line.slice(split + 1) : line;
                              const shouldAnswer = /^問題\d*$/.test(label) || /想瞭解|會不會|要不要|可不可以|能不能|是否|是不是|好不好|適不適合|該不該|怎麼辦|如何|為什麼|什麼時候|哪時候|嗎|呢|[？?]/.test(`${label}${value}`);
                              return (
                                <div key={index} className={shouldAnswer ? "quickReplyInputQuestion" : ""}>
                                  <b>
                                    {label}
                                  </b>
                                  <p>{value}</p>
                                  {shouldAnswer && adviceFieldFor(value, label, true)}
                                </div>
                              );
                              })}
                              {!section.requestLines.some((line) => /^問題\d*：/.test(line) || /想瞭解|會不會|要不要|可不可以|能不能|是否|是不是|好不好|適不適合|該不該|怎麼辦|如何|為什麼|什麼時候|哪時候|嗎|呢|[？?]/.test(line)) && adviceFieldFor("", "本項目", true)}
                            </>}
                          </section>
                        )}
                      <section className="quickReplyCategoryPicker quickReplySectionCategoryPicker">
                        <h3>【{section.label}】常用命理回覆</h3>
                        <p>先選分類，再複選多個答案。</p>
                        <div>
                          {visibleSectionTopics.map((t) => (
                            <button
                              key={t.code}
                              className={
                                sectionTopic?.code === t.code ? "active" : ""
                              }
                              onClick={() =>
                                setSectionCategory((c) => ({
                                  ...c,
                                  [sectionKey]: t.code,
                                }))
                              }
                            >
                              <span>
                                {sectionTopic?.code === t.code ? "✓" : t.icon}
                              </span>
                              {t.title}
                            </button>
                          ))}
                        </div>
                      </section>
                      {sectionTopic?.code === "naming_result" && (
                        <section className="quickReplyNamingPanel">
                          <h3>請填寫六組名字與名字助力</h3>
                          {(namingRows[sectionKey] || defaultNamingRows()).map(
                            (row, index) => (
                              <div className="quickReplyNamingRow" key={index}>
                                <b>{index + 1}</b>
                                <input
                                  value={row.name}
                                  onChange={(e) =>
                                    updateNamingRow(
                                      index,
                                      "name",
                                      e.target.value,
                                    )
                                  }
                                  placeholder={`第 ${index + 1} 個名字`}
                                />
                                <select
                                  value={row.aid}
                                  onChange={(e) => {
                                    if (e.target.value !== "未選擇" && e.target.value === row.custom) return window.alert("兩格請選擇不同的名字優點");
                                    updateNamingRow(index, "aid", e.target.value);
                                  }}
                                >
                                  <option>未選擇</option>
                                  <option>貴人運</option>
                                  <option>財運</option>
                                  <option>事業運</option>
                                  <option>工作運</option>
                                  <option>人緣</option>
                                  <option>感情運</option>
                                  <option>婚姻運</option>
                                  <option>健康運</option>
                                  <option>學業運</option>
                                  <option>智慧與判斷力</option>
                                  <option>行動力</option>
                                  <option>家庭和諧</option>
                                </select>
                                <select
                                  value={row.custom}
                                  onChange={(e) => {
                                    if (e.target.value !== "未選擇" && e.target.value === row.aid) return window.alert("兩格請選擇不同的名字優點");
                                    updateNamingRow(index, "custom", e.target.value);
                                  }}
                                >
                                  <option>未選擇</option>
                                  <option>貴人運</option>
                                  <option>財運</option>
                                  <option>事業運</option>
                                  <option>工作運</option>
                                  <option>人緣</option>
                                  <option>感情運</option>
                                  <option>婚姻運</option>
                                  <option>健康運</option>
                                  <option>學業運</option>
                                  <option>智慧與判斷力</option>
                                  <option>行動力</option>
                                  <option>家庭和諧</option>
                                </select>
                              </div>
                            ),
                          )}
                          <button
                            className="quickReplyGenerateNames"
                            onClick={generateNamingAnswer}
                          >
                            產生命名回覆
                          </button>
                        </section>
                      )}
                      {sectionTopic &&
                        sectionTopic.code !== "naming_result" && (
                          <section
                            className={`quickReplyOptions quickReplyMultiOptions${sectionTopic.code === "overall" ? " quickReplyOverallOptions" : ""}${section.itemCode === "infant-spirit" && activeInfantIndex < 0 ? " quickReplyInfantCollapsed" : ""}`}
                            onClick={togglePanel}
                          >
                            <h3>
                              {sectionTopic.icon} {sectionTopic.title}（可複選）
                            </h3>
                            {sectionTopic.code === "date_result" && (
                              <div className="quickReplyDateResult">
                                <div className="quickReplyDateHeading">
                                  <span>良辰吉日</span>
                                  <div>
                                    <h4>請填寫{section.dateResultCount === 6 ? "六" : "三"}組日期</h4>
                                    <p>每一組可分別判斷日期，並指定推薦或應避開的時辰。</p>
                                  </div>
                                </div>
                                <div className="quickReplyDateRows">
                                  {Array.from({ length: section.dateResultCount || 3 }, (_, index) => {
                                    const rows = dateResultRows[sectionKey] || [];
                                    const row = rows[index] || emptyDateResultRow();
                                    const updateRow = (changes: Partial<DateResultRow>) => setDateResultRows((current) => {
                                      const next = [...(current[sectionKey] || [])];
                                      next[index] = { ...emptyDateResultRow(), ...row, ...changes };
                                      return { ...current, [sectionKey]: next };
                                    });
                                    return (
                                      <article className="quickReplyDateCard" key={index}>
                                        <header><b>{index + 1}</b><strong>第 {index + 1} 組</strong></header>
                                        <div className="quickReplyDateMainFields">
                                          <label><span>日期</span><input type="text" placeholder="例如：10月8日" value={row.date} onChange={(event) => updateRow({ date: event.target.value })}/></label>
                                          <label><span>日期判斷</span><select value={row.verdict} onChange={(event) => updateRow({ verdict: event.target.value })}>
                                            <option value="">請選擇判斷</option><option>這個時間最適合</option><option>這個日子可以使用</option><option>需要調整時辰</option><option>這個日子要避開</option><option>這個日期可優先安排</option><option>這個日期普通可用</option><option>這個日期需要更換</option><option>上午安排比較適合</option><option>下午安排比較適合</option>
                                          </select></label>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                                <section className="quickReplyDateTimeSupplement">
                                  <div className="quickReplyDateTimeTitle"><span>時</span><div><strong>推薦／避開時辰</strong><small>額外補充，可選上午、下午或傳統時辰</small></div></div>
                                  <div className="quickReplyDateTimeFields">
                                    <label><span>時段</span><select value={dateTimeSupplements[sectionKey]?.timeChoice || ""} onChange={(event) => setDateTimeSupplements((current) => ({ ...current, [sectionKey]: { timeChoice: event.target.value, timeVerdict: current[sectionKey]?.timeVerdict || "" } }))}>
                                      <option value="">不指定時辰</option><option>上午</option><option>下午</option>
                                      <option>子時（23:00–01:00）</option><option>丑時（01:00–03:00）</option><option>寅時（03:00–05:00）</option><option>卯時（05:00–07:00）</option><option>辰時（07:00–09:00）</option><option>巳時（09:00–11:00）</option><option>午時（11:00–13:00）</option><option>未時（13:00–15:00）</option><option>申時（15:00–17:00）</option><option>酉時（17:00–19:00）</option><option>戌時（19:00–21:00）</option><option>亥時（21:00–23:00）</option>
                                    </select></label>
                                    <label><span>判斷</span><select value={dateTimeSupplements[sectionKey]?.timeVerdict || ""} disabled={!dateTimeSupplements[sectionKey]?.timeChoice} onChange={(event) => setDateTimeSupplements((current) => ({ ...current, [sectionKey]: { timeChoice: current[sectionKey]?.timeChoice || "", timeVerdict: event.target.value } }))}><option value="">請選擇</option><option>吉時</option><option>可用</option><option>避開</option></select></label>
                                  </div>
                                </section>
                                {[["①", "注意事項", dateNoticeOptions]].map(([number, title, options]) => (
                                  <section className="quickReplyDateGroup" key={String(title)}>
                                    <h4><span>{String(number)}</span>{String(title)}</h4>
                                    <div className="quickReplySpecialChoices">
                                      {(options as Option[]).map((option) => (
                                        <button key={option.id} className={sectionDraft.optionIds.includes(option.id) ? "selected" : ""} onClick={() => toggleOption(option.id)}>
                                          {sectionDraft.optionIds.includes(option.id) && <span>✓</span>}{option.label}
                                        </button>
                                      ))}
                                    </div>
                                  </section>
                                ))}
                                <button className="quickReplyApplyDateResult" onClick={applyDateResult}>帶入擇日／擇時結果</button>
                              </div>
                            )}
                            {section.itemCode === "infant-spirit" && (
                              <div className="quickReplyInfantInlineRecords">
                                {Array.from(
                                  { length: activeInfantIndex < 0 ? infantRecordCount : activeInfantIndex + 1 },
                                  (_, index) => infantRecordCard(index),
                                )}
                              </div>
                            )}
                            {[
                              "infant_spirit",
                              "deceased",
                              "deceased_pet",
                            ].includes(sectionTopic.code) && (
                              <div
                                className="quickReplyLocationChoices quickReplySpiritCard quickReplyAlwaysOpen"
                              >
                                <div className="quickReplySpiritHeading">
                                  <span>①</span>
                                  <div className="quickReplyLocationTitle">
                                    <h4>
                                      現在在哪裡
                                    </h4>
                                    {section.previousLocation && (
                                        <p>
                                          {section.previousLocation.date}
                                          諮詢結果：
                                          {section.previousLocation.name}
                                          <strong>
                                            {section.previousLocation.text}
                                          </strong>
                                        </p>
                                      )}
                                  </div>
                                </div>
                                <div className="quickReplyPrimaryChoices">
                                  {sectionTopic.code === "infant_spirit" ? (
                                    <>
                                      <button
                                        className={locationMode[sectionKey] === "bridge" ? "selected" : ""}
                                        onClick={() => applyLocation("bridge")}
                                      >奈何橋</button>
                                      <button
                                        className={locationMode[sectionKey] === "reincarnated" ? "selected" : ""}
                                        onClick={() => applyLocation("reincarnated")}
                                      >已投胎</button>
                                    </>
                                  ) : <>
                                  <button
                                    className={
                                      locationMode[sectionKey] === "hell"
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() => applyLocation("hell")}
                                  >
                                    地府
                                  </button>
                                  <button
                                    className={
                                      locationMode[sectionKey] === "city"
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() => applyLocation("city")}
                                  >
                                    枉死城
                                  </button>
                                  <button
                                    className={
                                      locationMode[sectionKey] ===
                                      "reincarnated"
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      applyLocation("reincarnated")
                                    }
                                  >
                                    已投胎
                                  </button>
                                  </>}
                                </div>
                                {sectionTopic.code === "infant_spirit" &&
                                  locationMode[sectionKey] === "bridge" && (
                                    <div className="quickReplyInfantBridgeChoices">
                                      <h5>寶寶在奈何橋的情況</h5>
                                      <div className="quickReplySpecialChoices">
                                        {infantBridgeOptions.map((o) => (
                                          <button
                                            key={o.id}
                                            className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""}
                                            onClick={() => selectSingleOption(o.id, infantBridgeOptions)}
                                          >
                                            {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}
                                            {o.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                {locationMode[sectionKey] === "hell" && (
                                  <div className="quickReplyHallChoices">
                                    {[
                                      "第一殿",
                                      "第二殿",
                                      "第三殿",
                                      "第四殿",
                                    ].map((hall) => (
                                      <button
                                        key={hall}
                                        className={
                                          locationHall[sectionKey] === hall
                                            ? "selected"
                                            : ""
                                        }
                                        onClick={() =>
                                          applyLocation("hell", hall)
                                        }
                                      >
                                        {hall}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {locationMode[sectionKey] ===
                                  "reincarnated" && (
                                  <div className="quickReplyReincarnatedField">
                                    <div className="quickReplyReincarnatedKind">
                                      <button className={reincarnatedKind[sectionKey] === "human" ? "selected" : ""} onClick={() => setReincarnatedKind((current) => ({ ...current, [sectionKey]: "human" }))}>人</button>
                                      <button className={reincarnatedKind[sectionKey] === "animal" ? "selected" : ""} onClick={() => setReincarnatedKind((current) => ({ ...current, [sectionKey]: "animal" }))}>動物</button>
                                    </div>
                                    {reincarnatedKind[sectionKey] && (
                                    <div className="quickReplyReincarnatedDetails">
                                    <label>
                                      現在是一{reincarnatedKind[sectionKey] === "animal" ? "隻" : "個"}「
                                      <input
                                        value={reincarnatedAs[sectionKey] || ""}
                                        onChange={(e) =>
                                          setReincarnatedAs((c) => ({
                                            ...c,
                                            [sectionKey]: e.target.value,
                                          }))
                                        }
                                        placeholder={reincarnatedKind[sectionKey] === "animal" ? "例如：虎斑貓" : "例如：小女孩"}
                                      />
                                      」
                                    </label>
                                    <label>
                                      已投胎到「
                                      <input value={reincarnatedPlace[sectionKey] || ""} onChange={(e) => setReincarnatedPlace((current) => ({ ...current, [sectionKey]: e.target.value }))} placeholder={reincarnatedKind[sectionKey] === "animal" ? "例如：台灣南部的某間動物之家" : "例如：靠近新竹跟苗栗附近的陳姓人家"} />
                                      」
                                    </label>
                                    {reincarnatedKind[sectionKey] === "human" && (
                                      <label>目前約「<input inputMode="numeric" value={reincarnatedAge[sectionKey] || ""} onChange={(e) => setReincarnatedAge((current) => ({ ...current, [sectionKey]: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="例如：3" />」歲</label>
                                    )}
                                    <button
                                      onClick={() =>
                                        applyLocation("reincarnated")
                                      }
                                    >
                                      帶入
                                    </button>
                                    </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {["deceased", "infant_spirit"].includes(sectionTopic.code) && (
                              <>
                                <div className="quickReplySpecialField">
                                  <div className="quickReplySpecialHeading">
                                    <span>②</span>
                                    <div>
                                      <h4>目前心情</h4>
                                    </div>
                                  </div>
                                  <div className="quickReplySpecialChoices">
                                    {deceasedMoodOptions.map((o) => (
                                      <button
                                        key={o.id}
                                        className={
                                          sectionDraft.optionIds.includes(o.id)
                                            ? "selected"
                                            : ""
                                        }
                                        onClick={() => toggleOption(o.id)}
                                      >
                                        {sectionDraft.optionIds.includes(
                                          o.id,
                                        ) && <span>✓</span>}
                                        {o.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="quickReplySpecialField quickReplyDeceasedStatus">
                                  <div className="quickReplySpecialHeading">
                                    <span>③</span>
                                    <div>
                                      <h4>現在狀況如何</h4>
                                    </div>
                                  </div>
                                  <div className="quickReplyNestedGroup">
                                    <button
                                      className={
                                        openPanels[`${sectionKey}-divine`]
                                          ? "active"
                                          : ""
                                      }
                                      onClick={() =>
                                        setOpenPanels((c) => ({
                                          ...c,
                                          [`${sectionKey}-divine`]:
                                            !c[`${sectionKey}-divine`],
                                        }))
                                      }
                                    >
                                      有神佛助力
                                    </button>
                                    {openPanels[`${sectionKey}-divine`] && (
                                      <div className="quickReplyNestedBody">
                                        <h5>選擇神佛</h5>
                                        <div className="quickReplyNestedChoices">
                                          {[
                                            "王母娘娘",
                                            "媽祖",
                                            "觀世音菩薩",
                                            "地藏王菩薩",
                                            "土地公",
                                            "玄天上帝",
                                            "王爺",
                                            "城隍爺",
                                            "保生大帝",
                                            "趙聖帝君",
                                          ].map((name) => (
                                            <button
                                              key={name}
                                              className={
                                                deceasedDetail.deity
                                                  .split("、")
                                                  .includes(name)
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                toggleDeceasedList(
                                                  "deity",
                                                  name,
                                                )
                                              }
                                            >
                                              {name}
                                            </button>
                                          ))}
                                        </div>
                                        <input
                                          value={deceasedDetail.customDeity}
                                          onChange={(e) =>
                                            updateDeceasedDetail(
                                              "customDeity",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="其他神明，自行輸入"
                                        />
                                        <h5>神佛助力情況</h5>
                                        <div className="quickReplyNestedChoices">
                                          {deceasedDivineOptions.map((o) => (
                                            <button
                                              key={o.id}
                                              className={
                                                sectionDraft.optionIds.includes(
                                                  o.id,
                                                )
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                selectSingleOption(
                                                  o.id,
                                                  deceasedDivineOptions,
                                                )
                                              }
                                            >
                                              {o.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="quickReplyNestedGroup">
                                    <button
                                      className={
                                        openPanels[`${sectionKey}-visit`]
                                          ? "active"
                                          : ""
                                      }
                                      onClick={() =>
                                        setOpenPanels((c) => ({
                                          ...c,
                                          [`${sectionKey}-visit`]:
                                            !c[`${sectionKey}-visit`],
                                        }))
                                      }
                                    >
                                      會回來探望
                                    </button>
                                    {openPanels[`${sectionKey}-visit`] && (
                                      <div className="quickReplyNestedBody">
                                        <h5>會探望誰</h5>
                                        <div className="quickReplyNestedChoices">
                                          {[
                                            "父母",
                                            "親友",
                                            "家人",
                                            "兄弟姊妹",
                                          ].map((name) => (
                                            <button
                                              key={name}
                                              className={
                                                deceasedDetail.visitTarget
                                                  .split("、")
                                                  .includes(name)
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                toggleDeceasedList(
                                                  "visitTarget",
                                                  name,
                                                  2,
                                                )
                                              }
                                            >
                                              {name}
                                            </button>
                                          ))}
                                        </div>
                                        <h5>回來探望的情況</h5>
                                        <div className="quickReplyNestedChoices">
                                          {deceasedVisitOptions.map((o) => (
                                            <button
                                              key={o.id}
                                              className={
                                                sectionDraft.optionIds.includes(
                                                  o.id,
                                                )
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                selectSingleOption(
                                                  o.id,
                                                  deceasedVisitOptions,
                                                )
                                              }
                                            >
                                              {o.label}
                                            </button>
                                          ))}
                                        </div>
                                        {[
                                          "deceased_visit_hard",
                                          "deceased_visit_rare",
                                        ].includes(selectedVisitCode) && (
                                          <>
                                            <h5>為什麼不能常回來</h5>
                                            <div className="quickReplyNestedChoices">
                                              {deceasedReasonOptions
                                                .filter(
                                                  (o) =>
                                                    o.code !==
                                                    "deceased_reason_custom",
                                                )
                                                .map((o) => (
                                                  <button
                                                    key={o.id}
                                                    className={
                                                      sectionDraft.optionIds.includes(
                                                        o.id,
                                                      )
                                                        ? "selected"
                                                        : ""
                                                    }
                                                    onClick={() =>
                                                      selectSingleOption(
                                                        o.id,
                                                        deceasedReasonOptions,
                                                      )
                                                    }
                                                  >
                                                    {o.label}
                                                  </button>
                                                ))}
                                            </div>
                                            <div className="quickReplyNestedCustom">
                                              <input
                                                value={
                                                  deceasedDetail.customVisitReason
                                                }
                                                onChange={(e) =>
                                                  updateDeceasedDetail(
                                                    "customVisitReason",
                                                    e.target.value,
                                                  )
                                                }
                                                placeholder="自行輸入原因"
                                              />
                                              <button
                                                onClick={() => {
                                                  const option =
                                                    deceasedReasonOptions.find(
                                                      (o) =>
                                                        o.code ===
                                                        "deceased_reason_custom",
                                                    );
                                                  if (
                                                    option &&
                                                    deceasedDetail.customVisitReason.trim()
                                                  )
                                                    selectSingleOption(
                                                      option.id,
                                                      deceasedReasonOptions,
                                                    );
                                                }}
                                              >
                                                帶入原因
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="quickReplyNestedGroup">
                                    <button
                                      className={
                                        openPanels[`${sectionKey}-peace`]
                                          ? "active"
                                          : ""
                                      }
                                      onClick={() =>
                                        setOpenPanels((c) => ({
                                          ...c,
                                          [`${sectionKey}-peace`]:
                                            !c[`${sectionKey}-peace`],
                                        }))
                                      }
                                    >
                                      目前平安
                                    </button>
                                    {openPanels[`${sectionKey}-peace`] && (
                                      <div className="quickReplyNestedBody">
                                        <div className="quickReplyNestedChoices">
                                          {deceasedPeaceOptions.map((o) => (
                                            <button
                                              key={o.id}
                                              className={
                                                sectionDraft.optionIds.includes(
                                                  o.id,
                                                )
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                selectSingleOption(
                                                  o.id,
                                                  deceasedPeaceOptions,
                                                )
                                              }
                                            >
                                              {o.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="quickReplyNestedGroup">
                                    <button
                                      className={
                                        openPanels[`${sectionKey}-offering`]
                                          ? "active"
                                          : ""
                                      }
                                      onClick={() =>
                                        setOpenPanels((c) => ({
                                          ...c,
                                          [`${sectionKey}-offering`]:
                                            !c[`${sectionKey}-offering`],
                                        }))
                                      }
                                    >
                                      有沒有收到家人供品
                                    </button>
                                    {openPanels[`${sectionKey}-offering`] && (
                                      <div className="quickReplyNestedBody">
                                        <div className="quickReplyNestedChoices">
                                          {deceasedOfferingOptions.map((o) => (
                                            <button
                                              key={o.id}
                                              className={
                                                sectionDraft.optionIds.includes(
                                                  o.id,
                                                )
                                                  ? "selected"
                                                  : ""
                                              }
                                              onClick={() =>
                                                selectSingleOption(
                                                  o.id,
                                                  deceasedOfferingOptions,
                                                )
                                              }
                                            >
                                              {o.label}
                                            </button>
                                          ))}
                                        </div>
                                        {selectedOfferingCode ===
                                          "deceased_offering_none" && (
                                          <>
                                            <h5>沒有收到的原因</h5>
                                            <div className="quickReplyNestedChoices">
                                              {deceasedOfferingReasonOptions.map(
                                                (o) => (
                                                  <button
                                                    key={o.id}
                                                    className={
                                                      sectionDraft.optionIds.includes(
                                                        o.id,
                                                      )
                                                        ? "selected"
                                                        : ""
                                                    }
                                                    onClick={() =>
                                                      selectSingleOption(
                                                        o.id,
                                                        deceasedOfferingReasonOptions,
                                                      )
                                                    }
                                                  >
                                                    {o.label}
                                                  </button>
                                                ),
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                            {sectionTopic.code === "infant_spirit" && infantRebirthOptions.length > 0 && (
                              <div className="quickReplySpecialField quickReplyInfantRebirth">
                                <div className="quickReplySpecialHeading">
                                  <span>④</span>
                                  <div><h4>投胎機會</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {infantRebirthOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""}
                                      onClick={() => selectSingleOption(o.id, infantRebirthOptions)}
                                    >
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sectionTopic.code === "infant_spirit" && infantYearsOption && (
                              <div className="quickReplySpecialField quickReplyInfantYears">
                                <div className="quickReplySpecialHeading">
                                  <span>⑤</span>
                                  <div><h4>大約多久可以投胎</h4></div>
                                </div>
                                <div className="quickReplyYearsInput">
                                  <input
                                    inputMode="decimal"
                                    value={infantYears[sectionKey] || ""}
                                    onChange={(e) => setInfantYears((current) => ({
                                      ...current,
                                      [sectionKey]: e.target.value.replace(/[^0-9.]/g, ""),
                                    }))}
                                    placeholder="請輸入年數"
                                  />
                                  <span>年</span>
                                  <button
                                    disabled={!infantYears[sectionKey]?.trim()}
                                    onClick={() => selectSingleOption(infantYearsOption.id, [infantYearsOption])}
                                  >帶入</button>
                                </div>
                              </div>
                            )}
                            {loveTrendOptions.length > 0 && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>①</span>
                                  <div>
                                    <h4>感情運勢</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {loveTrendOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {meetOptions.length > 0 && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>②</span>
                                  <div>
                                    <h4>容易在哪裡遇到正緣？</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {meetOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selfPersonalityOptions.length > 0 && (isPersonalLove || isFirstRelationshipSection) && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>③</span>
                                  <div>
                                    <h4>自己的個性</h4>
                                  </div>
                                </div>
                                <div className="quickReplyPersonalityGroups">
                                  {selfPersonalityGroups.map(([group, options]) => (
                                    <div key={group}>
                                      <h5>{group}</h5>
                                      <div className="quickReplySpecialChoices">
                                        {options.map((o) => (
                                          <button
                                            key={o.id}
                                            className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""}
                                            onClick={() => toggleOption(o.id)}
                                          >
                                            {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}
                                            {o.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {showPartnerPersonality &&
                              partnerPersonalityOptions.length > 0 && (
                                <div className="quickReplySpecialField">
                                  <div className="quickReplySpecialHeading">
                                    <span>{!isPersonalLove && !isFirstRelationshipSection ? "③" : "④"}</span>
                                    <div>
                                      <h4>
                                        {isPersonalLove
                                          ? "容易遇到的對象個性"
                                          : "對方的個性"}
                                      </h4>
                                    </div>
                                  </div>
                                  <div className="quickReplySpecialChoices">
                                    {partnerPersonalityOptions.map((o) => (
                                      <button
                                        key={o.id}
                                        className={
                                          sectionDraft.optionIds.includes(o.id)
                                            ? "selected"
                                            : ""
                                        }
                                        onClick={() => toggleOption(o.id)}
                                      >
                                        {sectionDraft.optionIds.includes(
                                          o.id,
                                        ) && <span>✓</span>}
                                        {o.label}
                                      </button>
                                    ))}
                                  </div>
                                  {isPersonalLove && (
                                    <div className="quickReplyPartnerTwo">
                                      {!partner2Enabled[sectionKey] ? (
                                        <button
                                          className="quickReplyAddPartner"
                                          onClick={() => setPartner2Enabled((current) => ({ ...current, [sectionKey]: true }))}
                                        >＋ 增加對象2</button>
                                      ) : (
                                        <>
                                          <div className="quickReplyPartnerTwoHeading">
                                            <h5>對象2（可另外選擇）</h5>
                                            <button onClick={() => {
                                              setPartner2Enabled((current) => ({ ...current, [sectionKey]: false }));
                                              setPartner2Selections((current) => ({ ...current, [sectionKey]: [] }));
                                              void composeSection(sectionDraft.optionIds, false, section, sectionKey, undefined, undefined, []);
                                            }}>移除對象2</button>
                                          </div>
                                          <div className="quickReplySpecialChoices">
                                            {partnerPersonalityOptions.map((o) => {
                                              const selected = (partner2Selections[sectionKey] || []).includes(o.id);
                                              return (
                                                <button
                                                  key={`partner2-${o.id}`}
                                                  className={selected ? "selected" : ""}
                                                  onClick={() => {
                                                    const current = partner2Selections[sectionKey] || [];
                                                    const next = selected ? current.filter((id) => id !== o.id) : [...current, o.id];
                                                    setPartner2Selections((values) => ({ ...values, [sectionKey]: next }));
                                                    void composeSection(sectionDraft.optionIds, false, section, sectionKey, undefined, undefined, next);
                                                  }}
                                                >
                                                  {selected && <span>✓</span>}{o.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            {isPersonalLove && (
                              <div className="quickReplySpecialField quickReplyRomanceTiming">
                                <div className="quickReplySpecialHeading">
                                  <span>⑤</span>
                                  <div className="quickReplyTimingHeading"><h4>感情時間</h4><small>{personalLoveProfileMeta.label}</small></div>
                                </div>
                                <h5>紅鸞星動時間（最多三個）</h5>
                                <div className="quickReplyAgeInputs">
                                  {[0, 1, 2].map((index) => (
                                    <label key={`romance-${index}`}><input inputMode="numeric" value={romanceAges[sectionKey]?.[index] || ""} onChange={(e) => setRomanceAges((current) => { const next = [...(current[sectionKey] || [])]; next[index] = e.target.value.replace(/\D/g, ""); return { ...current, [sectionKey]: next }; })} onBlur={() => confirmPersonalLoveAge("romance", index)} placeholder={`年齡${index + 1}`} /><span>歲</span></label>
                                  ))}
                                </div>
                                <h5>離婚或離異高風險年齡（最多兩個）</h5>
                                <div className="quickReplyAgeInputs two">
                                  {[0, 1].map((index) => (
                                    <label key={`divorce-${index}`}><input inputMode="numeric" value={divorceAges[sectionKey]?.[index] || ""} onChange={(e) => setDivorceAges((current) => { const next = [...(current[sectionKey] || [])]; next[index] = e.target.value.replace(/\D/g, ""); return { ...current, [sectionKey]: next }; })} onBlur={() => confirmPersonalLoveAge("divorce", index)} placeholder={`年齡${index + 1}`} /><span>歲</span></label>
                                  ))}
                                </div>
                                <button className="quickReplyApplyTiming" onClick={() => void composeSection(sectionDraft.optionIds)}>帶入感情時間</button>
                              </div>
                            )}
                            {sectionTopic?.code === "home" && [
                              ["①", "房子目前狀況", homeConditionOptions],
                              ["②", "對人的影響", homeImpactOptions],
                              ["③", "家裡哪個地方需要注意", homeAreaOptions],
                              ["④", "有沒有需要調整", homeAdjustOptions],
                              ["⑤", "適不適合繼續住", homeSuitableOptions],
                              ["⑥", "最近住家運勢", homeFortuneOptions],
                              ["⑦", "阿嫂最後建議", homeFinalOptions],
                            ].map(([number, title, options]) => (
                              <div className="quickReplySpecialField" key={String(title)}>
                                <div className="quickReplySpecialHeading">
                                  <span>{String(number)}</span>
                                  <div><h4>{String(title)}</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {(options as Option[]).map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {sectionTopic?.code === "spiritual" && [
                              ["①", "目前干擾程度", spiritualLevelOptions],
                              ["②", "外靈跟著哪裡", spiritualFollowOptions],
                              ["③", "容易出現什麼狀況", spiritualSymptomOptions],
                              ["④", "外靈的情況", spiritualEntityOptions],
                              ["⑤", "阿嫂建議", spiritualAdviceOptions],
                            ].map(([number, title, options]) => (
                              <div className="quickReplySpecialField" key={String(title)}>
                                <div className="quickReplySpecialHeading">
                                  <span>{String(number)}</span>
                                  <div><h4>{String(title)}</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {(options as Option[]).map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                                {String(title) === "目前干擾程度" && spiritualLevelOptions.some((option) =>
                                  option.code !== "spiritual_level_none" && sectionDraft.optionIds.includes(option.id),
                                ) && (
                                  <label className="quickReplySpiritualDetail">
                                    <b>是誰？在哪裡遇到的？</b>
                                    <textarea
                                      rows={2}
                                      value={spiritualDetails[sectionKey] || ""}
                                      placeholder="例如：有兩男一女，是從醫院跟回來的"
                                      onChange={(event) => {
                                        setSpiritualDetails((current) => ({ ...current, [sectionKey]: event.target.value }));
                                        setWritten(false);
                                      }}
                                      onBlur={() => sectionDraft.optionIds.length && void composeSection(sectionDraft.optionIds)}
                                    />
                                  </label>
                                )}
                              </div>
                            ))}
                            {statusOptions.length > 0 && (
                              <div className={`quickReplySpecialField${sectionTopic?.code === "overall" ? " quickReplyOverallStatus" : ""}`}>
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {[
                                      "infant_spirit",
                                      "deceased",
                                      "deceased_pet",
                                    ].includes(sectionTopic?.code || "")
                                      ? "②"
                                      : sectionTopic?.code === "overall"
                                        ? "②"
                                      : "①"}
                                  </span>
                                  <div>
                                    <h4>
                                      {sectionTopic?.code === "overall"
                                        ? "整體運勢"
                                        : sectionTopic?.code === "home"
                                        ? "這間房子的情況如何"
                                        : "現在狀況如何"}
                                    </h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {statusOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {adviceOptions.length > 0 && (
                              <div className={`quickReplySpecialField${sectionTopic?.code === "overall" ? " quickReplyOverallAdvice" : ""}`}>
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {sectionTopic?.code === "love"
                                      ? showPartnerPersonality
                                        ? "⑤"
                                        : "④"
                                      : sectionTopic?.code === "overall"
                                        ? "④"
                                        : "②"}
                                  </span>
                                  <div>
                                    <h4>
                                      {sectionTopic?.code === "love" ||
                                      sectionTopic?.code === "overall"
                                        ? "建議"
                                        : "建議如何處理"}
                                    </h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {adviceOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {elementOptions.length > 0 && (
                              <div
                                className={`quickReplySpecialField${sectionTopic?.code === "overall" ? " quickReplyAlwaysOpen quickReplyOverallElement" : ""}`}
                              >
                                <div className="quickReplySpecialHeading">
                                  <span>①</span>
                                  <div>
                                    <h4>本命格</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices quickReplyFiveElements">
                                  {elementOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                                <h5 className="quickReplyElementAccentTitle">帶一點什麼</h5>
                                <div className="quickReplySpecialChoices quickReplyFiveElements quickReplyElementAccent">
                                  {elementOptions.map((o) => (
                                    <button
                                      key={`accent-${o.id}`}
                                      className={(elementAccentSelections[sectionKey] || []).includes(o.id) ? "selected" : ""}
                                      onClick={() => toggleElementAccent(o.id)}
                                    >
                                      {(elementAccentSelections[sectionKey] || []).includes(o.id) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {deityOptions.length > 0 && (
                              <div className={`quickReplySpecialField${sectionTopic?.code === "overall" ? " quickReplyOverallDeity" : ""}`}>
                                <div className="quickReplySpecialHeading">
                                  <span>{sectionTopic?.code === "overall" ? "③" : "②"}</span>
                                  <div>
                                    <h4>暗貴人</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {deityOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                                {deityRelationOptions.length > 0 && (
                                  <>
                                    <h5 className="quickReplySubheading">
                                      與暗貴人的緣分／助力（可複選）
                                    </h5>
                                    <div className="quickReplySpecialChoices">
                                      {deityRelationOptions.map((o) => (
                                        <button
                                          key={o.id}
                                          className={
                                            sectionDraft.optionIds.includes(
                                              o.id,
                                            )
                                              ? "selected"
                                              : ""
                                          }
                                          onClick={() => toggleOption(o.id)}
                                        >
                                          {sectionDraft.optionIds.includes(
                                            o.id,
                                          ) && <span>✓</span>}
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {sectionTopic?.code === "overall" && (
                                  <>
                                    <h5 className="quickReplySubheading">有空要多拜（可複選）</h5>
                                    <p className="quickReplyWorshipHint">預設跟隨上方選擇的暗貴人，也可以另外選擇遇到困難時想多拜的神明。</p>
                                    <div className="quickReplySpecialChoices">
                                      {worshipDeityOptions.map((o) => (
                                        <button
                                          key={`worship-${o.id}`}
                                          className={effectiveWorshipDeities.includes(o.label) ? "selected" : ""}
                                          onClick={() => toggleWorshipDeity(o.label)}
                                        >
                                          {effectiveWorshipDeities.includes(o.label) && <span>✓</span>}
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <div className="quickReplyCustomDeity">
                                  <input
                                    value={customDeity[sectionKey] || ""}
                                    onChange={(e) =>
                                      setCustomDeity((c) => ({
                                        ...c,
                                        [sectionKey]: e.target.value,
                                      }))
                                    }
                                    placeholder="其他神明，可自行填寫"
                                  />
                                  <button onClick={applyCustomDeity}>
                                    帶入暗貴人
                                  </button>
                                </div>
                              </div>
                            )}
                            {sectionTopic?.code === "overall" &&
                              (recentPositiveOptions.length > 0 || recentNegativeOptions.length > 0) && (
                              <div className="quickReplySpecialField quickReplyOverallRecent">
                                <div className="quickReplySpecialHeading">
                                  <span>⑤</span>
                                  <div><h4>最近狀況</h4></div>
                                </div>
                                <h5 className="quickReplySubheading">正面狀況（可複選）</h5>
                                <div className="quickReplySpecialChoices">
                                  {recentPositiveOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                                <h5 className="quickReplySubheading">需要留意（可複選）</h5>
                                <div className="quickReplySpecialChoices">
                                  {recentNegativeOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                                {recentNegativeOptions.some((o) => sectionDraft.optionIds.includes(o.id)) && (
                                  <>
                                    <h5 className="quickReplySubheading">狀況程度（選擇較符合的描述）</h5>
                                    <div className="quickReplySpecialChoices">
                                      {recentDetailOptions.map((o) => (
                                        <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                          {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                        </button>
                                      ))}
                                    </div>
                                    <h5 className="quickReplySubheading">建議（醫療與安全優先，民俗方式為輔）</h5>
                                    <div className="quickReplySpecialChoices">
                                      {recentAdviceOptions.map((o) => (
                                        <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                          {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {sectionTopic?.code === "overall" && bodyOptions.length > 0 && (
                              <div className="quickReplySpecialField quickReplyOverallBody">
                                <div className="quickReplySpecialHeading">
                                  <span>⑥</span>
                                  <div><h4>身體狀況</h4></div>
                                </div>
                                <h5 className="quickReplySubheading">本身狀況不錯（可複選）</h5>
                                <div className="quickReplySpecialChoices">
                                  {bodyPositiveOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                                <h5 className="quickReplySubheading">需要留意的身體狀況－上半身（可複選）</h5>
                                <div className="quickReplySpecialChoices">
                                  {upperBodyOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                                <h5 className="quickReplySubheading">需要留意的身體狀況－下半身（可複選）</h5>
                                <div className="quickReplySpecialChoices">
                                  {lowerBodyOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sectionTopic?.code === "health" && (
                              <>
                                <div className="quickReplySpecialField quickReplyHealthGroup">
                                  <div className="quickReplySpecialHeading"><span>①</span><div><h4>身體狀況</h4></div></div>
                                  <div className="quickReplySpecialChoices">
                                    {[...bodyPositiveOptions, ...recentPositiveOptions].map((o) => (
                                      <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                        {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="quickReplySpecialField quickReplyHealthGroup">
                                  <div className="quickReplySpecialHeading"><span>②</span><div><h4>需要留意</h4></div></div>
                                  <h5 className="quickReplySubheading">上半身</h5>
                                  <div className="quickReplySpecialChoices">
                                    {upperBodyOptions.map((o) => <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>{sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}</button>)}
                                  </div>
                                  <h5 className="quickReplySubheading">下半身與全身</h5>
                                  <div className="quickReplySpecialChoices">
                                    {[...lowerBodyOptions, ...recentNegativeOptions, ...recentDetailOptions].map((o) => <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>{sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}</button>)}
                                  </div>
                                </div>
                                <div className="quickReplySpecialField quickReplyHealthGroup">
                                  <div className="quickReplySpecialHeading"><span>③</span><div><h4>建議</h4></div></div>
                                  <div className="quickReplySpecialChoices">
                                    {healthAdviceOptions.map((o) => <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>{sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}</button>)}
                                  </div>
                                </div>
                              </>
                            )}
                            {sectionTopic?.code === "lawsuit" && lawsuitOptionGroups.map(([title, options], groupIndex) => (
                              <div className="quickReplySpecialField quickReplyLawsuitGroup" key={title}>
                                <div className="quickReplySpecialHeading">
                                  <span>{groupIndex + 1}</span>
                                  <div><h4>{title}</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {options.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}
                                      {o.label.replace(/^傷害案件：/, "")}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {sectionTopic?.code === "past_life" && pastLifeOptionGroups.map((group, groupIndex) => (
                              <div className="quickReplySpecialField quickReplyPastLifeGroup" key={group.key}>
                                <div className="quickReplySpecialHeading">
                                  <span>{groupIndex + 1}</span>
                                  <div>
                                    <h4>{group.title}</h4>
                                    {group.key === "consultant" && consultantSelectedElsewhere && (
                                      <small className="quickReplyPastLifeNotice">已在「與{consultantSelectedElsewhere.targetName || "其他對象"}的前世關係」中選擇過</small>
                                    )}
                                  </div>
                                </div>
                                {group.subgroups.map(([subtitle, options]) => (
                                  <div className="quickReplyPastLifeSubgroup" key={subtitle}>
                                    <h5>{subtitle}</h5>
                                    <div className="quickReplySpecialChoices">
                                      {options.map((o) => <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>{sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}</button>)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                            {buddhistOptions.length > 0 && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {sectionTopic?.code === "infant_spirit"
                                      ? "⑥"
                                      : deceasedLayout
                                      ? "④"
                                      : "③"}
                                  </span>
                                  <div>
                                    <h4>業力／福德</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {buddhistOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && <span>✓</span>}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {helpOptions.length > 0 && (
                              <div className="quickReplyHelpCard">
                                <div className="quickReplyHelpHeading">
                                  <span>
                                    {sectionTopic?.code === "infant_spirit"
                                      ? "⑦"
                                      : deceasedLayout
                                      ? "⑤"
                                      : "④"}
                                  </span>
                                  <div>
                                    <b>需要幫助</b>
                                  </div>
                                </div>
                                <div className="quickReplyHelpChoices">
                                  {helpOptions.map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && (
                                        <span className="quickReplyInstantCheck">
                                          ✓
                                        </span>
                                      )}
                                      {o.label}
                                    </button>
                                  ))}
                                  {deceasedLayout && (
                                    <button
                                      className={
                                        scriptureOptions.some((o) =>
                                          sectionDraft.optionIds.includes(o.id),
                                        ) ||
                                        openPanels[`${sectionKey}-scripture`]
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() =>
                                        setOpenPanels((c) => ({
                                          ...c,
                                          [`${sectionKey}-scripture`]:
                                            !c[`${sectionKey}-scripture`],
                                        }))
                                      }
                                    >
                                      唸經迴向
                                    </button>
                                  )}
                                </div>
                                {deceasedLayout &&
                                  openPanels[`${sectionKey}-scripture`] && (
                                    <div className="quickReplyScripturePanel">
                                      <h5>選擇要唸的經文（可複選）</h5>
                                      <div className="quickReplyNestedChoices">
                                        {scriptureOptions.map((o) => (
                                          <button
                                            key={o.id}
                                            className={
                                              sectionDraft.optionIds.includes(
                                                o.id,
                                              )
                                                ? "selected"
                                                : ""
                                            }
                                            onClick={() => toggleOption(o.id)}
                                          >
                                            {o.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                              </div>
                            )}
                            {sectionTopic.code === "love" && !isPersonalLove && relationshipSituationOptions.length > 0 && (
                              <div className="quickReplySpecialField quickReplyRelationshipSituation">
                                <div className="quickReplySpecialHeading">
                                  <span>{isFirstRelationshipSection ? "⑤" : "④"}</span><div><h4>兩人之間容易遇到</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {relationshipSituationOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sectionTopic.code === "love" && !isPersonalLove && relationshipAdviceOptions.length > 0 && (
                              <div className="quickReplySpecialField quickReplyRelationshipAdvice">
                                <div className="quickReplySpecialHeading">
                                  <span>{isFirstRelationshipSection ? "⑥" : "⑤"}</span><div><h4>給諮詢者建議</h4></div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {relationshipAdviceOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sectionTopic.code !== "date_result" && (standardOptions.length > 0 ||
                              remainingLoveOtherOptions.length > 0) && (
                              <div className="quickReplySpecialField quickReplyOtherField">
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {sectionTopic?.code === "love"
                                      ? isPersonalLove
                                        ? "⑥"
                                        : isFirstRelationshipSection ? "⑦" : "⑥"
                                      : deceasedLayout
                                        ? "⑥"
                                        : spiritTopicCodes.includes(
                                              sectionTopic?.code || "",
                                            )
                                          ? "⑤"
                                          : [
                                                "overall",
                                                "spiritual",
                                                "home",
                                              ].includes(
                                                sectionTopic?.code || "",
                                              )
                                            ? "③"
                                            : "①"}
                                  </span>
                                  <div>
                                    <h4>其它</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {[
                                    ...standardOptions,
                                    ...remainingLoveOtherOptions,
                                  ].map((o) => (
                                    <button
                                      key={o.id}
                                      className={
                                        sectionDraft.optionIds.includes(o.id)
                                          ? "selected"
                                          : ""
                                      }
                                      aria-pressed={sectionDraft.optionIds.includes(
                                        o.id,
                                      )}
                                      onClick={() => toggleOption(o.id)}
                                    >
                                      {sectionDraft.optionIds.includes(
                                        o.id,
                                      ) && (
                                        <span className="quickReplyInstantCheck">
                                          ✓
                                        </span>
                                      )}
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {section.itemCode === "infant-spirit" && activeInfantIndex >= 0 && activeInfantIndex < infantRecordCount - 1 && (
                              <div className="quickReplyInfantInlineRecords quickReplyInfantFollowingRecords">
                                {Array.from(
                                  { length: infantRecordCount - activeInfantIndex - 1 },
                                  (_, offset) => infantRecordCard(activeInfantIndex + offset + 1),
                                )}
                              </div>
                            )}
                          </section>
                        )}
                      <section className="quickReplyPreview">
                        <div>
                          <h3>{section.itemCode.startsWith("past-life-") ? "綜觀今生" : `【${section.label}】回覆預覽`}</h3>
                          {sectionDraft.answer && (
                            <span>{editing ? "直接修改中" : "可繼續複選"}</span>
                          )}
                        </div>
                        {editing ? (
                          <textarea
                            value={sectionDraft.answer}
                            onChange={(e) => {
                              const answer = e.target.value;
                              setSectionDrafts((c) => ({
                                ...c,
                                [sectionKey]: {
                                  ...sectionDraft,
                                  answer,
                                  completed: !!answer.trim(),
                                },
                              }));
                            }}
                            autoFocus
                          />
                        ) : (
                          <p>
                            {sectionPending[sectionKey]
                              ? "帶入內容中請稍後..."
                              : sectionDraft.answer ||
                                "請先複選上方的常用命理回覆。"}
                          </p>
                        )}
                        <div className="quickReplyPreviewActions">
                          <button
                            disabled={
                              !sectionDraft.answer ||
                              !sectionDraft.optionIds.length ||
                              sectionPending[sectionKey]
                            }
                            onClick={() =>
                              void composeSection(sectionDraft.optionIds, true)
                            }
                          >
                            ↻ 換一種說法
                          </button>
                          <button
                            disabled={
                              !sectionDraft.answer || sectionPending[sectionKey]
                            }
                            onClick={() => setEditing((v) => !v)}
                          >
                            ✎ {editing ? "完成修改" : "自行修改"}
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
              {view === "question" && (
                <>
                  <section className="quickReplyQuestions">
                    <h3>先點選要回答的問題</h3>
                    <div>
                        {questionGroups.map((group, i) => {
                          const q = group.questions[0];
                          const done =
                            drafts[String(q.slotIndex)]?.completed === true;
                          return (
                            <button
                              key={group.key}
                            className={i === activeQuestion ? "selected" : ""}
                            onClick={() => pickTarget("question", i)}
                            >
                              <span>{done ? "✓" : group.questions.length > 1 ? group.questions.length : `Q${q.questionNumber}`}</span>
                              <b>
                                <em>{group.title}</em>
                                {group.questions.length > 1 ? `${group.questions.length} 個問題` : q.question}
                            </b>
                            <small>
                              {done
                                ? "已完成回答"
                                : i === activeQuestion
                                  ? "目前選取"
                                  : "點此回答"}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  {question && (
                    <>
                      {question.profileLines?.length > 0 && (
                        <section className="quickReplyProfileCard">
                          <h3>本項目諮詢者資料</h3>
                          {question.profileLines.map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </section>
                      )}
                      {question.requestLines?.length > 0 && (
                        <section className="quickReplyInputCard">
                          <h3>用戶填寫的內容</h3>
                          {question.requestLines.map((line, index) => {
                            if (question.itemCode === "past-life-relationship" && question.profileLines.includes(line))
                              return <div key={index} className="quickReplyPlainProfileLine"><p>{line}</p></div>;
                            const split = line.indexOf("：");
                            const heading = /^【(.+)】$/.exec(line);
                            if (heading)
                              return <div key={index} className="quickReplyInputGroupHeading"><b>{heading[1]}</b></div>;
                            const label = split >= 0 ? line.slice(0, split) : "補充內容";
                            const value = split >= 0 ? line.slice(split + 1) : line;
                            const shouldAnswer = /^問題\d*$/.test(label) || /想瞭解|會不會|要不要|可不可以|能不能|是否|是不是|好不好|適不適合|該不該|怎麼辦|如何|為什麼|什麼時候|哪時候|嗎|呢|[？?]/.test(`${label}${value}`);
                            return (
                              <div key={index} className={shouldAnswer ? "quickReplyInputQuestion" : ""}>
                                <b>{label}</b>
                                <p>{value}</p>
                                {shouldAnswer && adviceFieldFor(value, label, false, { itemCode: question.itemCode, profileName: question.profileName })}
                              </div>
                            );
                          })}
                        </section>
                      )}
                      {!question.manualOnly && category && (
                        <section className="quickReplyOptions quickReplyQuestionGroups">
                          <h3>
                            {category.icon} {category.title}
                          </h3>
                          <p>每一個分類最多可複選 3 個選項。</p>
                          {questionOptionGroups.map(([groupLabel, options], groupIndex) => {
                            const panelKey = `question-${questionKey}-${category.code}-${groupLabel}`;
                            const selectedCodes = asCodes(
                              draft.selections[category.code],
                            );
                            return (
                              <div className={`quickReplySpecialField quickReplyQuestionGroup${openPanels[panelKey] ? " expanded" : ""}`} key={groupLabel}>
                                <div
                                  className="quickReplySpecialHeading"
                                  onClick={() =>
                                    setOpenPanels((current) => ({
                                      ...current,
                                      [panelKey]: !current[panelKey],
                                    }))
                                  }
                                >
                                  <span>{["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"][groupIndex] || groupIndex + 1}</span>
                                  <div><h4>{groupLabel}</h4></div>
                                </div>
                                {openPanels[panelKey] && (
                                  <div className="quickReplySpecialChoices">
                                    {options.map((o) => (
                                      <button
                                        key={o.code}
                                        className={
                                          selectedCodes.includes(o.code)
                                            ? "selected"
                                            : ""
                                        }
                                        onClick={() => choose(o.code)}
                                      >
                                        {selectedCodes.includes(o.code) && (
                                          <span>✓</span>
                                        )}
                                        {o.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {asCodes(draft.selections[category.code]).length > 0 && (
                            <button
                              className="quickReplyRemoveCategory"
                              onClick={removeCategory}
                            >
                              移除這一類判斷
                            </button>
                          )}
                        </section>
                      )}
                      <section className="quickReplyPreview">
                        <div>
                          <h3>{question.itemCode.startsWith("past-life-") ? "綜觀今生" : `Q${question.questionNumber} 回覆預覽`}</h3>
                        </div>
                        {editing || question.manualOnly ? (
                          <textarea
                            value={draft.answer}
                            onChange={(e) => {
                              const answer = e.target.value;
                              setDrafts((c) => ({
                                ...c,
                                [questionKey]: {
                                  ...draft,
                                  answer,
                                  completed: !!answer.trim(),
                                },
                              }));
                            }}
                            autoFocus
                          />
                        ) : (
                          <p>
                            {draft.answer ||
                              `${question.profileName || "諮詢者"}：${question.question}`}
                          </p>
                        )}
                        <div className="quickReplyPreviewActions">
                          {!question.manualOnly && (
                            <button
                              disabled={!draft.answer || busy}
                              onClick={() =>
                                void compose(draft.selections, true)
                              }
                            >
                              ↻ 換一種說法
                            </button>
                          )}
                          <button
                            disabled={!draft.answer || busy}
                            onClick={() => setEditing((v) => !v)}
                          >
                            ✎ {editing ? "完成修改" : "自行修改"}
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
              {error && <div className="quickReplyError">{error}</div>}
              {written && (
                <div className="quickReplySuccess">
                  ✅ 已成功寫入 Google 諮詢單
                </div>
              )}
              {locationConfirm && (
                <div className="quickReplyConfirmBackdrop">
                  <div className="quickReplyConfirmDialog">
                    <h3>請再次確認位置</h3>
                    <p>
                      {locationConfirm.previous.date}諮詢結果：
                      {locationConfirm.previous.name}
                      <strong>{locationConfirm.previous.text}</strong>
                      ，請確認是否現在在<b>{locationConfirm.nextLabel}</b>
                    </p>
                    <div>
                      <button onClick={() => setLocationConfirm(null)}>
                        返回檢查
                      </button>
                      <button
                        className="confirm"
                        onClick={() =>
                          applyLocation(
                            locationConfirm.mode,
                            locationConfirm.hall,
                            true,
                          )
                        }
                      >
                        確認變更位置
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <footer className="quickReplyWriteBar">
                <button
                  className="quickReplyWrite"
                  disabled={!hasAnswer && !hasPending}
                  onClick={() => void write()}
                >
                  {busy || sectionIsPending
                    ? "帶入內容中…"
                    : written
                      ? "再次寫入更新"
                      : "確認寫入全部回答"}
                </button>
                <button
                  type="button"
                  className="quickReplyBackToItems"
                  aria-label="回到最上方項目選單"
                  title="回到項目選單"
                  onClick={() => itemMenuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  ↑
                </button>
                {footerProfileLines.length > 0 && (
                  <div className="quickReplyFooterProfile" aria-label="本項目諮詢者資料">
                    <div>
                      {footerProfileLines.map((line, index) => <span key={index}>{line}</span>)}
                    </div>
                  </div>
                )}
                {(written || !standalone) && (
                  <div className="quickReplyFooterActions">
                    {written && (
                      <a href={data.documentUrl} target="_blank" rel="noreferrer">
                        查看 Google 文件
                      </a>
                    )}
                    {!standalone && (
                      <button className="quickReplyCancel" onClick={onClose}>
                        返回預約後台
                      </button>
                    )}
                  </div>
                )}
              </footer>
            </div>
          )
        )}
      </section>
    </div>
  );
}
