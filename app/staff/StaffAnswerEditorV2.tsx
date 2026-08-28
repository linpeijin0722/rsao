"use client";
import { lunarProfile } from "@/lib/lunar-profile";

const text = (value: unknown) => String(value ?? "");
const times=["子時（23:00–01:00）","丑時（01:00–03:00）","寅時（03:00–05:00）","卯時（05:00–07:00）","辰時（07:00–09:00）","巳時（09:00–11:00）","午時（11:00–13:00）","未時（13:00–15:00）","申時（15:00–17:00）","酉時（17:00–19:00）","戌時（19:00–21:00）","亥時（21:00–23:00）","不確定"];

export default function StaffAnswerEditorV2({ value, profiles, change, close, save }: any) {
  const ids: string[] = value.targetProfileIds?.length
    ? value.targetProfileIds
    : [value.targetProfileId].filter(Boolean);
  const extra = value.extra_data || {};
  const code = text(value.item_code);
  const title = text(value.item_title);
  const sub = (value.sub_items || []).join("、");
  const relation = title.includes("與他人前世關係");
  const personalLove = title.includes("個人感情運") || sub.includes("個人感情運");
  const love = (title.includes("感情運勢") || title.includes("關係合盤") || title.includes("合八字") || title.includes("合婚")) && !personalLove;
  const newborn = title.includes("新生兒命名");
  const personalRename = title.includes("個人改名") || sub.includes("個人改名");
  const naming = title.includes("命名") || title.includes("改名") || sub.includes("命名") || sub.includes("改名");
  const company = title.includes("公司命名") || title.includes("公司改名") || sub.includes("公司命名") || sub.includes("公司改名");
  const datePick = title.includes("擇日") || title.includes("擇時") || title.includes("則日") || title.includes("則時");
  const deceased = code === "deceased-relative" || title.includes("過世親") || title.includes("往生親");
  const deceasedPet = code.includes("pet") || title.includes("過世寵物") || title.includes("往生寵物");
  const health = code === "health" || code === "physical-health" || title.includes("身體健康");
  const overall = code === "overall-fortune" || title.includes("整體運勢");
  const spiritual = title.includes("外靈干擾");
  const home = title.includes("陽宅");
  const infant = title.includes("嬰靈");
  const lawsuit = title.includes("官司") || title.includes("貴人");
  const noGenericQuestions = naming || lawsuit || relation || love || overall || spiritual || home || deceased || deceasedPet;

  const setExtra = (key: string, next: any) =>
    change({ ...value, extra_data: { ...extra, [key]: next } });
  const setIds = (next: string[]) =>
    change({ ...value, targetProfileId: next[0] || "", targetProfileIds: next });
  const optionLabel = (profile: any) => {
    const category = profile.relationship === "本人" && !profile.relationship_detail
      ? "本人"
      : profile.profile_type === "person" ? "親友"
      : profile.profile_type === "pet" ? "往生寵物" : "過世親友";
    return `${profile.name}（${profile.relationship_detail || category}）`;
  };
  const personSelect = (id: string, index: number, label: string, filter?: (p: any) => boolean, extraKey?: string) => (
    <label key={`${label}-${index}`}>{label}
      <select value={id || ""} onChange={(event) => {
        const next = [...ids]; next[index] = event.target.value;
        if (extraKey) change({ ...value, targetProfileId: next[0] || "", targetProfileIds: next, extra_data: { ...extra, [extraKey]: event.target.value } });
        else setIds(next);
      }}>
        <option value="">請選擇資料</option>
        {profiles.filter(filter || (() => true)).map((profile: any) => (
          <option key={profile.id} value={profile.id} disabled={profile.id !== id && ids.includes(profile.id)}>{optionLabel(profile)}</option>
        ))}
      </select>
    </label>
  );
  const input = (label: string, key: string, placeholder = "") => (
    <label>{label}<input value={text(extra[key])} placeholder={placeholder} onChange={(e) => setExtra(key, e.target.value)} /></label>
  );
  const area = (label: string, key: string, placeholder = "") => (
    <label>{label}<textarea value={text(extra[key])} placeholder={placeholder} onChange={(e) => setExtra(key, e.target.value)} /></label>
  );
  const select = (label: string, key: string, options: string[]) => (
    <label>{label}<select value={text(extra[key])} onChange={(e) => setExtra(key, e.target.value)}><option value="">請選擇</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
  );
  const setQuestion = (index: number, next: string) => {
    const questions = [...(value.questions || [])]; questions[index] = next;
    change({ ...value, questions });
  };
  const targetIds = (relation || love) ? ids.slice(1) : [];
  const targetQuestions = extra.target_questions || {};
  const relationshipDetails = extra.relationship_details || {};
  const setTargetData = (root: "target_questions" | "relationship_details", id: string, next: any) =>
    setExtra(root, { ...(extra[root] || {}), [id]: next });

  return <div className="modalBackdrop returnedEditBackdrop"><div className="modal staffFrontEditor staffAnswerEditor">
    <button className="staffModalClose" onClick={close}>×</button>
    <h2>修改問事資料</h2>
    <h3 className="staffAnswerItem">{title}{sub ? `－${sub}` : ""}</h3>
    <div className="staffFrontFields staffExactAnswerFields">
      {newborn ? <>
        {personSelect(extra.mother_id || ids[0], 0, "請選擇寶寶的媽媽", (p) => p.profile_type === "person" && p.gender === "女", "mother_id")}
        {personSelect(extra.father_id || ids[1], 1, "請選擇寶寶的爸爸", (p) => p.profile_type === "person" && p.gender === "男", "father_id")}
        {personSelect(extra.baby_id || ids[2], 2, "請選擇寶寶", undefined, "baby_id")}
      </> : <>
        {personSelect(ids[0], 0, deceased ? "請選擇過世親友" : deceasedPet ? "請選擇往生寵物" : infant ? "請選擇孩子的媽媽" : "這個項目是為誰諮詢？", infant ? (p) => p.profile_type === "person" && p.gender === "女" : deceasedPet ? (p) => p.profile_type === "pet" : undefined)}
        {(relation || love) && <div className="staffAnswerTargetGroup"><b>請選擇要觀看的對象（共 {targetIds.length} 位）</b>{targetIds.map((id, n) => personSelect(id, n + 1, `第 ${n + 1} 位`))}</div>}
      </>}

      {love && targetIds.map((id) => {
        const person = profiles.find((p: any) => p.id === id);
        const details = relationshipDetails[id] || {};
        const primary = profiles.find((p: any) => p.id === ids[0]);
        return <section className="staffAnswerSection" key={`love-${id}`}><h4>請選擇「{primary?.name || "諮詢者"}」與「{person?.name || "這位對象"}」的關係狀態</h4>
          <label>目前關係狀態<select value={text(details.relationship_status)} onChange={(e) => setTargetData("relationship_details", id, { ...details, relationship_status: e.target.value })}><option value="">請選擇</option>{["單戀中","交往中","情侶吵架","分手想復合","曖昧卡住","複雜關係","其他"].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>這段關係多久了？<input value={text(details.relationship_duration)} onChange={(e) => setTargetData("relationship_details", id, { ...details, relationship_duration: e.target.value })}/></label>
          <label>這次最想解決的事件？<textarea value={text(details.main_event)} placeholder="最近發生了什麼具體的事情，讓你決定來尋求建議？" onChange={(e) => setTargetData("relationship_details", id, { ...details, main_event: e.target.value })}/></label>
          <label>你最希望達成的目標？<textarea value={text(details.relationship_goal)} placeholder="例如：想挽回、想知道要不要停損、想改善溝通、想了解對方的真實想法" onChange={(e) => setTargetData("relationship_details", id, { ...details, relationship_goal: e.target.value })}/></label>
          <TargetQuestions primary={primary} profile={person} kind="感情問題" questions={targetQuestions[id] || []} update={(next: string[]) => setTargetData("target_questions", id, next)} />
        </section>;
      })}
      {relation && targetIds.map((id) => <TargetQuestions key={`past-${id}`} primary={profiles.find((p: any) => p.id === ids[0])} profile={profiles.find((p: any) => p.id === id)} kind="前世關係" questions={targetQuestions[id] || []} update={(next: string[]) => setTargetData("target_questions", id, next)} />)}

      {personalLove && <section className="staffAnswerSection">{area("目前感情狀態", "love_status", "例如：單身多久、剛分手沉澱中、空窗期較長等")}{area("目前的社交與生活型態", "social_lifestyle", "例如：生活圈固定不太出門、正積極使用交友軟體或參加活動等")}</section>}
      {overall && <section className="staffAnswerSection"><h4>目前最想聚焦、最關心的具體事件</h4><div className="staffHealthChecks">{(extra.overall_focuses || []).map((focus: string) => <label key={focus}><input type="checkbox" checked readOnly/>{focus}</label>)}</div>{(extra.overall_focuses || []).map((focus: string) => <div className="staffNestedFields" key={focus}><h4>{focus}</h4>{Object.entries(extra.overall_focus_details?.[focus] || {}).map(([field, answer]) => <label key={field}>{field}<textarea value={text(answer)} onChange={(event) => setExtra("overall_focus_details", {...(extra.overall_focus_details || {}), [focus]: {...(extra.overall_focus_details?.[focus] || {}), [field]: event.target.value}})}/></label>)}</div>)}</section>}
      {spiritual && <section className="staffAnswerSection">{area("請簡述受到干擾的情況", "interference_situation", "例如：反覆做相似的夢、莫名不安，或在特定時間與地點感到異常")}{input("這樣的情況持續多久了？", "interference_duration", "例如：約三個月，或從搬家後開始")}</section>}
      {newborn && <section className="staffAnswerSection">{input("希望寶寶姓氏", "baby_surname")}{area("是否有特別想用的字或喜歡的讀音？", "preferred_characters", "例如：喜歡『安』字、希望讀音溫柔好念")}{area("對名字的風格有沒有什麼想像？", "name_style", "例如：想要響亮一點、優雅一點，還是有想避開的感覺？")}{area("是否有禁忌或避諱的字或諧音？", "name_taboo", "例如：避開長輩同名、特定字或容易產生誤會的諧音")}{area("其他備註", "naming_notes")}</section>}
      {personalRename && <section className="staffAnswerSection">{area("是否有特別想用的字或喜歡的讀音？", "preferred_characters", "例如：喜歡『安』字、希望讀音溫柔好念")}{area("對名字的風格有沒有什麼想像？", "name_style", "例如：希望名字較穩重、清新或好記")}{area("是否有禁忌或避諱的字或諧音？", "name_taboo", "例如：希望避開的字、長輩同名或不喜歡的諧音")}{area("其他備註", "naming_notes")}</section>}
      {company && <section className="staffAnswerSection">{sub.includes("公司改名") && input("公司目前名字（或舊名）", "old_name")}{area("主要業務與產品", "business", "簡單說明公司是做什麼的、主要賣什麼或提供什麼服務即可")}<label>公司經營模式<select value={text(extra.mode)} onChange={(e)=>setExtra("mode",e.target.value)}><option value="">請選擇</option><option value="sole">獨資（自己一人開）</option><option value="partners">合夥（有其他股東）</option></select></label>{extra.mode === "partners" && <label>請選擇其他合夥人<select value={text(extra.partner)} onChange={(e)=>setExtra("partner",e.target.value)}><option value="">請選擇</option>{profiles.filter((p:any)=>p.profile_type==="person").map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{area("命名喜好與禁忌", "preferences", "例如：希望名稱穩重、親切、現代，或想避開的風格")}{area("有沒有特別喜歡或想放進去的字？", "favorite_words", "例如：希望放入『安』、『盛』等字，或喜歡特定讀音")}{area("其他備註", "notes", "例如：產業特色、品牌理念，或其他希望老師留意的事項")}</section>}
      {datePick && <section className="staffAnswerSection">{select("這次是要擇什麼日子呢？", "purpose", ["結婚／登記","手術／開刀","開工／開業","搬家／入宅","動土／修造","簽約／交易","提車／交車","安神／立壇","出行／遠行","喪葬／安葬","其他"])}{extra.purpose === "其他" && input("其他用途", "other_purpose")}{area("請說明您目前的狀況", "situation")}{area("是否有指定的日期範圍？有沒有特別忌諱或需要注意的？", "date_range")}{input("地點在哪裡？（若無則不需填寫）", "location")}{area("其他想補充的說明或狀況？", "notes")}</section>}
      {(deceased || deceasedPet) && <section className="staffAnswerSection">{area("目前的困擾或遺憾", "current_regret", deceasedPet ? "例如：近期常夢到牠、擔心牠離開時是否安心，或仍對牠的離開感到掛念" : "例如：夢到對方感到不安、執著於某句沒說出口的話")}{area("這次諮詢最希望獲得什麼", "consultation_goal", deceasedPet ? "例如：想了解牠目前是否安好，以及自己還能為牠做些什麼" : "例如：確認對方現在過得好不好？")}</section>}
      {health && <section className="staffAnswerSection"><h4>當前關注的健康問題（可複選）</h4><div className="staffHealthChecks">{["睡眠／精神","腸胃／消化","心血管／頭痛","骨骼／關節","呼吸／過敏","婦科／備孕","情緒／壓力"].map((name) => <label key={name}><input type="checkbox" checked={(extra.health_concerns || []).includes(name)} onChange={(event) => setExtra("health_concerns", event.target.checked ? [...(extra.health_concerns || []), name] : (extra.health_concerns || []).filter((item: string) => item !== name))}/>{name}</label>)}</div>{select("近期是否有手術或重大治療規劃？", "major_treatment_planned", ["是","否"])}{extra.major_treatment_planned === "是" && <>{select("想瞭解的問題", "treatment_question", ["目前的醫療團隊／主治醫師跟我有緣嗎？過程會不會順利？","手術後的恢復期運勢如何？能不能如期康復？","這段治療期間，命盤上有沒有什麼特別要注意的卡關或併發風險？","其他（自填）"])}{extra.treatment_question === "其他（自填）" && area("其他想瞭解的問題", "treatment_question_other")}</>}{area("備註", "health_notes", "若已有預定的『醫療機構／醫院名稱』與『主治醫師』，可以一併提供（例：台大醫院／陳宣醫師）。")}</section>}
      {home && <section className="staffAnswerSection">{area("欲觀看陽宅的所在地址", "home_address")}{area("本次諮詢的主要目的", "home_purpose", "例如：購屋前評估、裝修格局調整、搬入後想改善運勢")}{area("目前住起來最困擾的問題", "home_problem", "例如：睡眠不好、頻繁吵架、財運受阻、身體欠安")}</section>}
      {infant && <section className="staffAnswerSection">{(extra.pregnancy_losses || []).map((loss: any, i: number) => <div className="staffNestedFields" key={i}><label>國曆流產日期<input type="date" value={text(loss.date).slice(0,10)} onChange={(e) => { const next=[...(extra.pregnancy_losses||[])],date=e.target.value; next[i]={...loss,date,lunar:date?lunarProfile(date).lunar_birth_text:""};setExtra("pregnancy_losses",next)}}/></label><label>農曆流產日期<input disabled value={text(loss.lunar)}/></label><label>流產時辰<select value={text(loss.shichen)} onChange={(e) => { const next=[...(extra.pregnancy_losses||[])]; next[i]={...loss,shichen:e.target.value};setExtra("pregnancy_losses",next)}}><option value="">請選擇</option>{times.map(x=><option key={x}>{x}</option>)}</select></label><label>備註<textarea value={text(loss.notes)} onChange={(e) => { const next=[...(extra.pregnancy_losses||[])]; next[i]={...loss,notes:e.target.value};setExtra("pregnancy_losses",next)}}/></label></div>)}{area("目前的心理或生活狀況", "current_condition")}{area("過去是否曾處理過", "previous_handling")}</section>}
      {lawsuit && <section className="staffAnswerSection">{select("官司／糾紛類型", "lawsuit_type", ["詐騙","債務","離婚","合約","侵權","傷害","交通事故","其他"])}{extra.lawsuit_type === "其他" && input("其他官司／糾紛類型", "other_lawsuit_type")}{select("目前訴訟進度", "lawsuit_progress", ["偵查中","收到傳票","準備開庭","其他"])}{extra.lawsuit_progress === "其他" && input("其他訴訟進度", "other_lawsuit_progress")}<label>下次開庭或調解日期<input type="date" value={text(extra.next_court_date)} onChange={(e) => setExtra("next_court_date", e.target.value)}/></label>{area("事件簡述與爭議點", "dispute_summary", "請用 2-3 句話簡單說明事情經過，以及雙方目前卡住的地方")}{area("目前是否有專業人士或他人協助", "professional_help")}{area("本次最想解答的核心問題", "core_question")}</section>}
      {!noGenericQuestions && <section className="staffAnswerSection"><h4>想詢問的問題</h4>{(value.questions?.length ? value.questions : [""]).map((q: string, i: number) => <textarea aria-label={`問題 ${i+1}`} key={i} value={q || ""} onChange={(e) => setQuestion(i, e.target.value)}/>)}</section>}
    </div>
    <div className="returnedEditActions"><button onClick={() => void save()} disabled={!ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length}>儲存問事資料</button><button className="cancel" onClick={close}>取消</button></div>
  </div></div>;
}

function TargetQuestions({ primary, profile, kind, questions, update }: any) {
  const list: string[] = questions.length ? questions : [""];
  return <section className="staffAnswerSection targetQuestionSection"><h4>關於「{primary?.name || "諮詢者"}」與「{profile?.name || "這位對象"}」的{kind}，我想問</h4>{list.map((question, index) => <textarea aria-label={`問題 ${index+1}`} key={index} value={question} onChange={(e) => { const next=[...list];next[index]=e.target.value;update(next)}}/>)}</section>;
}
