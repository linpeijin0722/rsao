"use client";
import { useEffect, useMemo, useRef, useState } from "react";
const asCodes = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : value
      ? [String(value)]
      : [];
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
}: {
  bookingNo: string;
  documentId: string;
  onClose: () => void;
  standalone?: boolean;
  initialAccessToken?: string;
}) {
  const emptyNames = () =>
    Array.from({ length: 6 }, () => ({ name: "", aid: "貴人運", custom: "" }));
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
    [customDeity, setCustomDeity] = useState<Record<string, string>>({}),
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
    [sectionPending, setSectionPending] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [written, setWritten] = useState(false),
    [editing, setEditing] = useState(false);
  const sectionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
      {},
    ),
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
      `/api/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}&token=${encodeURIComponent(initialAccessToken)}`,
    )
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error || "讀取失敗");
        setData(x);
        setAccessToken(x.accessToken || initialAccessToken);
        setDrafts(x.questionReplies || {});
        setSectionDrafts(x.sectionReplies || {});
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
  }, [bookingNo, documentId, initialAccessToken]);
  const topicMap = useMemo(
      () => new Map((data?.topics || []).map((t) => [t.code, t])),
      [data],
    ),
    sections = (data?.sections || []).filter((s) => !s.manualOnly),
    section = sections[activeSection],
    sectionKey = String(section?.slotIndex ?? 0),
    sectionDraft = sectionDrafts[sectionKey] || {
      optionIds: [],
      phraseIds: [],
      answer: "",
      completed: false,
    },
    sectionTopic = topicMap.get(sectionCategory[sectionKey] || ""),
    sectionTopicCodes = data?.recommendedBySection?.[sectionKey] || [],
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
    spiritPlainOptions =
      sectionTopic && spiritTopicCodes.includes(sectionTopic.code)
        ? sectionTopic.options.filter(
            (o) =>
              o.code !== "location" &&
              !o.code.startsWith("assistance_") &&
              !o.code.startsWith("buddhist_") &&
              !o.code.startsWith("status_") &&
              !o.code.startsWith("condition_") &&
              !o.code.startsWith("deceased_"),
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
    bodyOptions =
      sectionTopic?.options.filter((o) => {
        if (!o.code.startsWith("body_")) return false;
        if (o.code.startsWith("body_female_"))
          return section?.genderPronoun === "她";
        if (o.code.startsWith("body_male_"))
          return section?.genderPronoun !== "她";
        return true;
      }) || [],
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
          !o.code.startsWith("status_") &&
          !o.code.startsWith("condition_") &&
          !o.code.startsWith("advice_") &&
          !o.code.startsWith("recent_") &&
          !o.code.startsWith("body_") &&
          !o.code.startsWith("home_") &&
          !o.code.startsWith("spiritual_") &&
          !o.code.startsWith("element_") &&
          !o.code.startsWith("deity_") &&
          !o.code.startsWith("buddhist_") &&
          !o.code.startsWith("deceased_") &&
          !spiritTopicCodes.includes(sectionTopic?.code || ""),
      ) || [],
    isPersonalLove =
      section?.itemCode === "personal-romance" ||
      /個人感情運|僅看自己/.test(section?.label || ""),
    showPartnerPersonality = sectionTopic?.code === "love";
  const deceasedLayout = ["deceased", "infant_spirit"].includes(sectionTopic?.code || "");
  const question = data?.questions[activeQuestion],
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
          label = text === "容易受到工作影響"
            ? "其它"
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
      visitTarget: "親友",
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
  async function post(payload: any) {
    const r = await fetch("/api/staff/quick-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingNo,
          documentId,
          accessToken,
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
            : "",
      targetIsPersonalLove =
        targetSection.itemCode === "personal-romance" ||
        /個人感情運|僅看自己/.test(targetSection.label || "");
    setSectionPending((c) => ({ ...c, [targetKey]: true }));
    setError("");
    setWritten(false);
    try {
      const x = await post({
        mode: "compose_section",
        sectionSlotIndex: Number(targetKey),
        optionIds,
        locationMode: mode,
        customLocation,
        reincarnatedAs: reincarnatedAs[targetKey] || "",
        reincarnatedKind: reincarnatedKind[targetKey] || "",
        reincarnatedPlace: reincarnatedPlace[targetKey] || "",
        reincarnatedAge: reincarnatedAge[targetKey] || "",
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
        visitTarget: deceasedDetails.current[targetKey]?.visitTarget || "親友",
        customVisitReason:
          deceasedDetails.current[targetKey]?.customVisitReason || "",
        locationSubject: targetSection.locationSubject,
        genderPronoun: targetSection.genderPronoun,
        selfName: targetSection.profileName || data?.customerName || "",
        partnerName: targetSection.profileName || "",
        personalLove: targetIsPersonalLove,
        previousPhraseIds: reroll
          ? sectionDrafts[targetKey]?.phraseIds || []
          : [],
      });
      if (
        sectionRequestVersions.current[targetKey] === version &&
        sectionSelections.current[targetKey]?.join("|") === optionIds.join("|")
      )
        setSectionDrafts((c) => ({
          ...c,
          [targetKey]: {
            optionIds,
            phraseIds: x.phraseIds || [],
            answer: x.answer || "",
            completed: true,
          },
        }));
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
      visitTarget: "親友",
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
      visitTarget: "親友",
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
      const rows = [...(current[sectionKey] || emptyNames())];
      rows[index] = { ...rows[index], [field]: value };
      return { ...current, [sectionKey]: rows };
    });
  }
  function generateNamingAnswer() {
    const rows = (namingRows[sectionKey] || emptyNames()).filter((row) =>
      row.name.trim(),
    );
    if (!rows.length) {
      window.alert("請至少填寫一個名字");
      return;
    }
    const answer = rows
      .map(
        (row) =>
          `${row.name.trim()}：這個名字可以增加${(row.custom || row.aid).trim()}，對之後的發展有正面的助力。`,
      )
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
        mode === "city"
          ? 0
          : mode === "reincarnated"
            ? 5
            : mode === "hell" && hall
              ? ranks[hall]
              : -1,
      previous = section?.previousLocation,
      nextLabel =
        mode === "city"
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
    const current =
        sectionSelections.current[sectionKey] || sectionDraft.optionIds,
      next = current.includes(locationOption.id)
        ? current
        : [locationOption.id, ...current];
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
    if (mode === "reincarnated" && !reincarnatedKind[sectionKey]) return;
    clearTimeout(sectionTimers.current[sectionKey]);
    setSectionPending((c) => ({ ...c, [sectionKey]: true }));
    const customLocation =
      mode === "hell" ? `地府${hall}` : mode === "city" ? "枉死城" : "";
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
  async function write() {
    if (busy || sectionIsPending) {
      window.alert("帶入內容中請勿跳轉畫面");
      return;
    }
    for (let index = 0; index < sections.length; index++) {
      const target = sections[index],
        targetDraft = sectionDrafts[String(target.slotIndex)] || {
          optionIds: [],
          phraseIds: [],
          answer: "",
        },
        topic = topicMap.get(
          data?.recommendedBySection?.[String(target.slotIndex)]?.[0] || "",
        );
        if (["infant-spirit", "deceased-relative", "deceased-pet"].includes(target.itemCode)) {
          const hasLocation = targetDraft.optionIds.some((id) =>
            topic?.options.some(
              (option) => option.id === id && option.code === "location",
            ),
          );
          const mode = locationMode[String(target.slotIndex)] || "";
          const locationComplete =
            mode === "city" ||
            (mode === "hell" &&
              !!locationHall[String(target.slotIndex)]?.trim()) ||
            (mode === "reincarnated" &&
              !!reincarnatedKind[String(target.slotIndex)]);
          if (!hasLocation || !locationComplete) {
          setView("section");
          setActiveSection(index);
          window.alert(`【${target.label}】的「現在在哪裡」為必填，請先選擇完整位置。`);
          return;
        }
      }
      if (target.itemCode === "overall-fortune") {
        const hasElement = targetDraft.optionIds.some((id) =>
          topic?.options.some(
            (option) => option.id === id && option.code.startsWith("element_"),
          ),
        );
        if (!hasElement) {
          setView("section");
          setActiveSection(index);
          window.alert("【整體運勢】的「本命格」為必填，請至少選擇一項。");
          return;
        }
      }
    }
    if (!hasAnswer) return;
    setBusy(true);
    setError("");
    try {
      await post({
        mode: "write",
        questionReplies: drafts,
        sectionReplies: sectionDrafts,
      });
      setWritten(true);
      setEditing(false);
      window.location.assign(
        data?.documentUrl ||
          `https://docs.google.com/document/d/${documentId}/edit`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "寫入失敗，內容已保留");
      setBusy(false);
    }
  }
  const hasAnswer =
      Object.values(drafts).some((r) => r.answer?.trim()) ||
      Object.values(sectionDrafts).some((r) => r.answer?.trim()),
    hasPending = Object.values(sectionDrafts).some(
      (r) => r.optionIds?.length && !r.answer?.trim(),
    ),
    sectionIsPending = Object.values(sectionPending).some(Boolean);
  const pickTarget = (kind: "section" | "question", index: number) => {
    setView(kind);
    kind === "section" ? setActiveSection(index) : setActiveQuestion(index);
    setEditing(false);
    setError("");
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
              <nav className="quickReplyModeTabs">
                <button
                  className={view === "section" ? "active" : ""}
                  onClick={() => setView("section")}
                >
                  項目標籤回覆
                </button>
                <button
                  className={view === "question" ? "active" : ""}
                  onClick={() => setView("question")}
                >
                  客人問題 Q&amp;A
                </button>
              </nav>
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
                    <section className="quickReplyQuestions">
                      <h3>先點選要填寫的項目標籤</h3>
                      <div>
                        {sections.map((s, i) => {
                          const done =
                            sectionDrafts[String(s.slotIndex)]?.completed ===
                            true;
                          return (
                            <button
                              key={s.slotIndex}
                              className={i === activeSection ? "selected" : ""}
                              onClick={() => pickTarget("section", i)}
                            >
                              <span>{done ? "✓" : "項目"}</span>
                              <b>【{s.label}】</b>
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
                      {section.profileLines?.length > 0 && (
                        <section className="quickReplyProfileCard">
                          <h3>本項目諮詢者資料</h3>
                          {section.profileLines.map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </section>
                      )}
                      {section.requestLines?.length > 0 &&
                        sectionTopic?.code !== "naming_result" && (
                          <section className="quickReplyInputCard">
                            <h3>用戶填寫的內容</h3>
                            {section.requestLines.map((line, index) => {
                              const split = line.indexOf("：");
                              return (
                                <div key={index}>
                                  <b>
                                    {split >= 0
                                      ? line.slice(0, split)
                                      : "補充內容"}
                                  </b>
                                  <p>
                                    {split >= 0 ? line.slice(split + 1) : line}
                                  </p>
                                </div>
                              );
                            })}
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
                          <div className="quickReplyNamingNeeds">
                            <h3>客人的命名需求</h3>
                            {section.requestLines?.length ? (
                              section.requestLines.map((line, index) => (
                                <p key={index}>{line}</p>
                              ))
                            ) : (
                              <p>客人沒有另外填寫命名偏好。</p>
                            )}
                          </div>
                          <h3>請填寫六組名字與名字助力</h3>
                          {(namingRows[sectionKey] || emptyNames()).map(
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
                                  onChange={(e) =>
                                    updateNamingRow(
                                      index,
                                      "aid",
                                      e.target.value,
                                    )
                                  }
                                >
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
                                <input
                                  value={row.custom}
                                  onChange={(e) =>
                                    updateNamingRow(
                                      index,
                                      "custom",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="或自行填寫助力"
                                />
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
                            className={`quickReplyOptions quickReplyMultiOptions${sectionTopic.code === "overall" ? " quickReplyOverallOptions" : ""}`}
                            onClick={togglePanel}
                          >
                            <h3>
                              {sectionTopic.icon} {sectionTopic.title}（可複選）
                            </h3>
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
                                      <em>必填</em>
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
                                </div>
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
                                            "親友",
                                            "家人",
                                            "另一半",
                                            "兄弟姊妹",
                                            "朋友",
                                            "子女",
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
                            {selfPersonalityOptions.length > 0 && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>③</span>
                                  <div>
                                    <h4>自己的個性</h4>
                                  </div>
                                </div>
                                <div className="quickReplySpecialChoices">
                                  {selfPersonalityOptions.map((o) => (
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
                            {showPartnerPersonality &&
                              partnerPersonalityOptions.length > 0 && (
                                <div className="quickReplySpecialField">
                                  <div className="quickReplySpecialHeading">
                                    <span>④</span>
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
                                    <h4>
                                      本命格
                                      {sectionTopic?.code === "overall" && (
                                        <em>必填</em>
                                      )}
                                    </h4>
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
                                <div className="quickReplyHealthNotice">可複選；內容僅作日常提醒，實際狀況仍應以合格醫療人員的檢查為準。</div>
                                <div className="quickReplySpecialChoices">
                                  {bodyOptions.map((o) => (
                                    <button key={o.id} className={sectionDraft.optionIds.includes(o.id) ? "selected" : ""} onClick={() => toggleOption(o.id)}>
                                      {sectionDraft.optionIds.includes(o.id) && <span>✓</span>}{o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {buddhistOptions.length > 0 && (
                              <div className="quickReplySpecialField">
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {deceasedLayout
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
                                    {deceasedLayout
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
                            {(standardOptions.length > 0 ||
                              loveOtherOptions.length > 0) && (
                              <div className="quickReplySpecialField quickReplyOtherField">
                                <div className="quickReplySpecialHeading">
                                  <span>
                                    {sectionTopic?.code === "love"
                                      ? showPartnerPersonality
                                        ? "⑥"
                                        : "⑤"
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
                                    ...loveOtherOptions,
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
                          </section>
                        )}
                      <section className="quickReplyPreview">
                        <div>
                          <h3>【{section.label}】回覆預覽</h3>
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
                      {data.questions.map((q, i) => {
                        const done =
                          drafts[String(q.slotIndex)]?.completed === true;
                        return (
                          <button
                            key={q.slotIndex}
                            className={i === activeQuestion ? "selected" : ""}
                            onClick={() => pickTarget("question", i)}
                          >
                            <span>{done ? "✓" : `Q${q.questionNumber}`}</span>
                            <b>
                              <em>{q.itemTitle}</em>
                              {q.question}
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
                          <h3>Q{question.questionNumber} 回覆預覽</h3>
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
              <footer>
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
              </footer>
            </div>
          )
        )}
      </section>
    </div>
  );
}
