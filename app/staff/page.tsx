"use client";
import { useEffect, useMemo, useState } from "react";
import StaffAnswerEditorV2 from "./StaffAnswerEditorV2";
const key = (v: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date(v),
  );
const shiftMonth = (value: string, amount: number) => {
  const [year, month] = value.split("-").map(Number),
    serial = year * 12 + month - 1 + amount;
  return `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
};
const asArray = (value: any): any[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const profileIdentity = (profile: any) => {
  const type = profile?.profile_type || "person";
  const name = String(profile?.name || "").trim().toLowerCase();
  const relationship = String(profile?.relationship || profile?.relationship_detail || "").trim().toLowerCase();
  if (type === "person" && (relationship === "本人" || profile?.is_self)) return "person|self";
  return [type, name, relationship, profile?.owner_profile_id || ""].join("|");
};
const uniquePeople = (profiles: any[]) =>
  profiles.filter((profile: any, index: number, all: any[]) => profile && all.findIndex((candidate: any) => profileIdentity(candidate) === profileIdentity(profile)) === index);
const isComplete = (x: any) => Boolean(x.data_submitted_at);
const sheetLinks = (x: any) => asArray(x.booking_details).map((detail: any) => ({...detail,consultation_url:detail.google_document_url||detail.google_sheet_url})).filter((detail: any) => detail.consultation_url);
const returnedData = (x: any) =>
  asArray(x.booking_details).flatMap((detail: any) => {
    const answerProfiles = asArray(detail.booking_consultation_answers).flatMap((answer: any) => {
      const direct = asArray(answer.consultation_profiles);
      const participants = asArray(answer.booking_answer_participants)
        .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
        .flatMap((participant: any) => asArray(participant.consultation_profiles));
      const profiles = [...direct, ...participants].filter(
        (profile: any, index: number, all: any[]) =>
          profile && all.findIndex((candidate: any) => candidate?.id === profile.id) === index,
      );
      const primaryProfileId = direct[0]?.id || answer.profile_id || profiles[0]?.id || "";
      const orderedProfileIds = [
        primaryProfileId,
        ...participants.map((profile: any) => profile?.id),
        ...profiles.map((profile: any) => profile?.id),
      ].filter((id: any, index: number, all: any[]) => id && all.indexOf(id) === index);
      return profiles.map((profile: any) => ({
        ...profile,
        answerId: answer.id,
        targetProfileId: primaryProfileId,
        targetProfileIds: orderedProfileIds,
        questions: asArray(answer.questions),
        extra_data: answer.extra_data || {},
        item_code: detail.booking_items?.code || "",
        item_title: detail.item_title,
        sub_items: asArray(detail.booking_detail_sub_items).map((sub: any) => sub.sub_item_title).filter(Boolean),
      }));
    });
    const linkedProfiles = asArray(detail.booking_detail_profiles)
      .flatMap((link: any) => asArray(link.consultation_profiles))
      .filter(Boolean)
      .map((profile: any) => ({
        ...profile,
        answerId: null,
        questions: [],
        extra_data: {},
        item_code: detail.booking_items?.code || "",
        item_title: detail.item_title,
        sub_items: asArray(detail.booking_detail_sub_items).map((sub: any) => sub.sub_item_title).filter(Boolean),
      }));
    return [...answerProfiles, ...linkedProfiles].filter(
      (entry: any, index: number, all: any[]) =>
        all.findIndex((candidate: any) =>
          candidate.id === entry.id && candidate.answerId === entry.answerId,
        ) === index,
    );
  });
const statusKey = (x: any) =>
  x.status === "cancelled"
    ? x.cancellation_reason === "自行取消"
      ? "cancelled"
      : "expired"
    : x.payment_status === "paid"
      ? "paid"
      : "pending";
const statusText = (x: any) =>
  ({
    paid: "已付款",
    pending: "待付款",
    cancelled: "已取消",
    expired: "已失效",
  })[statusKey(x)];
const shortText = (value: unknown, limit = 20) => {
  const chars = Array.from(String(value || ""));
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : chars.join("");
};
const bookingItemLines = (booking: any) => asArray(booking.booking_details).map((detail: any) => {
  const subs = asArray(detail.booking_detail_sub_items).map((sub: any) => sub.sub_item_title).filter(Boolean);
  return shortText([detail.item_title, ...subs].filter(Boolean).join(" "));
});
export default function Staff() {
  const [password, setPassword] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [items, setItems] = useState<any[]>([]),
    [manualCustomers, setManualCustomers] = useState<any[]>([]),
    [manualUserSearch, setManualUserSearch] = useState(""),
    [customerProfiles, setCustomerProfiles] = useState<any[]>([]),
    [manualOpen, setManualOpen] = useState(false),
    [manualMethod, setManualMethod] = useState<"video"|"text">("text"),
    [manualCustomerId, setManualCustomerId] = useState(""),
    [manualSlotStart, setManualSlotStart] = useState(""),
    [manualLines, setManualLines] = useState<any[]>([]),
    [manualNotifyPayment, setManualNotifyPayment] = useState(true),
    [manualSaving, setManualSaving] = useState(false),
    [error, setError] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [selectedDate, setSelectedDate] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [userView, setUserView] = useState<any>(null),
    [dataView, setDataView] = useState<any[]>([]),
    [dataBooking, setDataBooking] = useState<any>(null),
    [dataViewMode, setDataViewMode] = useState<"menu"|"view"|"user"|"answers">("menu"),
    [returnedEdit, setReturnedEdit] = useState<any>(null),
    [returnedEditMode, setReturnedEditMode] = useState<"user"|"answers">("user"),
    [profileEditor, setProfileEditor] = useState<any>(null),
    [answerEditor, setAnswerEditor] = useState<any>(null),
    [editTime, setEditTime] = useState(""),
    [editLines, setEditLines] = useState<any[]>([]),
    [statusFilter, setStatusFilter] = useState("all"),
    [dataFilter, setDataFilter] = useState("all"),
    [sortBy, setSortBy] = useState("paid_desc"),
    [customerSearch,setCustomerSearch]=useState(""),
    [bookingSearch,setBookingSearch]=useState(""),
    [documentSearch,setDocumentSearch]=useState(""),
    [textDateFrom,setTextDateFrom]=useState(""),
    [textDateTo,setTextDateTo]=useState(""),
    [showTextItems,setShowTextItems]=useState(false),
    [showTextAmount,setShowTextAmount]=useState(false),
    [showDocumentNumber,setShowDocumentNumber]=useState(false),
    [videoStatusFilter,setVideoStatusFilter]=useState("all"),
    [videoDataFilter,setVideoDataFilter]=useState("all"),
    [videoSortBy,setVideoSortBy]=useState("paid_desc"),
    [videoCustomerSearch,setVideoCustomerSearch]=useState(""),
    [videoBookingSearch,setVideoBookingSearch]=useState(""),
    [videoDocumentSearch,setVideoDocumentSearch]=useState(""),
    [videoDateFrom,setVideoDateFrom]=useState(""),
    [videoDateTo,setVideoDateTo]=useState(""),
    [showVideoItems,setShowVideoItems]=useState(false),
    [showVideoAmount,setShowVideoAmount]=useState(false),
    [showVideoDocumentNumber,setShowVideoDocumentNumber]=useState(false),
    [showUpcomingVideo,setShowUpcomingVideo]=useState(false),
    [showNewVideo,setShowNewVideo]=useState(false),
    [rememberPassword, setRememberPassword] = useState(false),
    [generatingDocument, setGeneratingDocument] = useState(""),
    [addPicker, setAddPicker] = useState<any>(null),
    [pickedSubId, setPickedSubId] = useState(""),
    [documentLinkEdit,setDocumentLinkEdit]=useState<any>(null),
    [documentLinkValue,setDocumentLinkValue]=useState(""),
    [documentRebuild,setDocumentRebuild]=useState<any>(null),
    [teacherOverwrite,setTeacherOverwrite]=useState<any>(null),
    [overwritePhrase,setOverwritePhrase]=useState(""),
    [lineContact,setLineContact]=useState<any>(null),
    [lineMessage,setLineMessage]=useState(""),
    [savedMessages,setSavedMessages]=useState<string[]>([]),
    [editingSavedMessage,setEditingSavedMessage]=useState<number|null>(null),
    [videoReminderConfirm,setVideoReminderConfirm]=useState(false),
    [priceEdit,setPriceEdit]=useState<any>(null),
    [priceValue,setPriceValue]=useState("");
  async function staffPost(body:any,retry=true){
    let response=await fetch("/api/staff/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    if(response.status===401&&retry){
      const savedPassword=localStorage.getItem("lin_a_sao_staff_password");
      if(savedPassword){
        const loginResponse=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:savedPassword,remember:true})});
        if(loginResponse.ok)return staffPost(body,false);
      }
    }
    return response;
  }
  async function generateDocument(x:any,createMode:"replace"|"new"="replace",confirmedTeacherEdit=false){
    const exists=sheetLinks(x).length>0;
    if(exists&&createMode==="replace"&&!confirmedTeacherEdit){
      const checkResponse=await staffPost({action:"check_document_edited",bookingNo:x.booking_no}),check=await checkResponse.json();
      if(!checkResponse.ok)return alert(check.error||"無法檢查諮詢單狀態");
      if(check.teacherEdited){setDocumentRebuild(null);setTeacherOverwrite(x);setOverwritePhrase("");return}
    }
    setDocumentRebuild(null);
    setGeneratingDocument(x.booking_no);
    try{
      const response=await staffPost({action:"generate_document",bookingNo:x.booking_no,force:exists,createMode}),result=await response.json();
      if(!response.ok)throw new Error(result.error||"建立文件失敗");
      const lineName=x.customers?.line_display_name||"LINE 用戶";
      const customerName=x.customers?.full_name||"未填姓名";
      const documentNumber=consultationNumberFor(x)||"未編號";
      alert(createMode==="new"?`【${documentNumber}｜${lineName}．${customerName}】新諮詢單已建立，連結已更新。`:exists?`【${documentNumber}｜${lineName}．${customerName}】諮詢單已重新建立`:`【${documentNumber}｜${lineName}．${customerName}】諮詢單已建立完成。`);
      await load();
    }catch(error){alert(error instanceof Error?error.message:"建立文件失敗")}finally{setGeneratingDocument("")}
  }
  async function saveDocumentLink(){
    if(!documentLinkEdit||!documentLinkValue.trim())return alert("請貼上 Google 文件連結");
    const response=await staffPost({action:"change_document_link",bookingNo:documentLinkEdit.booking_no,documentUrl:documentLinkValue.trim()}),result=await response.json();
    if(!response.ok)return alert(result.error||"更改連結失敗");
    setDocumentLinkEdit(null);setDocumentLinkValue("");await load();alert("諮詢單連結已更新");
  }
  function documentActions(x:any,showNumber=showDocumentNumber){
    if(!isComplete(x))return <span className="sheetPending">—</span>;
    const links=sheetLinks(x),busy=generatingDocument===x.booking_no;
    return <span className="consultationSheetLinks">
      <button className="consultationSheetLink documentGenerateButton" disabled={busy} onClick={()=>links.length?setDocumentRebuild(x):generateDocument(x)} title={links.length?"重新建立諮詢單":"建立諮詢單"} aria-label={links.length?"重新建立諮詢單":"建立諮詢單"}>{busy?"…":"📄"}</button>
      <button className="consultationSheetLink documentRelinkButton" onClick={()=>{setDocumentLinkEdit(x);setDocumentLinkValue(links[0]?.consultation_url||"")}} title="更改為現有 Google 文件連結" aria-label="更改諮詢單連結">🔄</button>
      {links.map((detail:any)=><a key={detail.id} className="consultationSheetLink consultationDocumentLink" href={detail.consultation_url} target="_blank" rel="noreferrer" title={`開啟：${detail.item_title}`} aria-label={`開啟${detail.item_title}諮詢單`}>🔗{showNumber&&<small>{consultationNumberFor(x)}</small>}</a>)}
    </span>
  }
  function consultationNumberFor(booking:any){
    const docs=rows.flatMap((row:any)=>asArray(row.booking_details).filter((detail:any)=>detail.google_document_id).map((detail:any)=>({id:detail.google_document_id,created:detail.google_document_created_at||row.created_at}))).filter((doc:any,index:number,all:any[])=>all.findIndex((candidate:any)=>candidate.id===doc.id)===index).sort((a:any,b:any)=>String(a.created).localeCompare(String(b.created)));
    const documentId=asArray(booking.booking_details).find((detail:any)=>detail.google_document_id)?.google_document_id;
    const position=docs.findIndex((doc:any)=>doc.id===documentId)+1;
    if(position<1)return "";
    return `${String.fromCharCode(65+Math.floor((position-1)/99))}${String(((position-1)%99)+1).padStart(2,"0")}`;
  }
  async function savePrice(){
    if(!priceEdit)return;
    if(priceEdit.payment_status==="paid")return alert("已付款訂單不能修改金額");
    const amount=Number(priceValue.replace(/,/g,""));
    if(!Number.isInteger(amount)||amount<0)return alert("請輸入正確的整數金額");
    if(!confirm(`是否確認將訂單 ${priceEdit.booking_no} 的總金額修改為 NT$ ${amount.toLocaleString("en-US")}？`))return;
    const response=await staffPost({action:"update_price",bookingNo:priceEdit.booking_no,totalPrice:amount}),result=await response.json();
    if(!response.ok)return alert(result.error||"修改價格失敗");
    setPriceEdit(null);setPriceValue("");setEditing(null);await load();alert("訂單價格已更新，並已發送 LINE 通知");
  }
  async function load() {
    const r = await fetch("/api/staff/bookings"),
      j = await r.json();
    if(r.ok){setRows(j.bookings);setManualCustomers(j.customers||[]);setCustomerProfiles(j.consultationProfiles||[])}else setError(j.error);
  }
  useEffect(() => {
    const saved=localStorage.getItem("lin_a_sao_staff_password");if(saved){setPassword(saved);setRememberPassword(true)}
    const savedSort=localStorage.getItem("lin_a_sao_staff_paid_sort");if(savedSort==="paid_asc"||savedSort==="paid_desc")setSortBy(savedSort);
    try{setSavedMessages(JSON.parse(localStorage.getItem("lin_a_sao_staff_line_messages")||"[]"))}catch{}
    load();
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((j) => setItems(j.items || []));
  }, []);
  function toggleManualItem(item:any,checked:boolean){
    setManualLines(value=>checked?[...value,{itemId:item.id,subId:item.sub_items?.length===1?item.sub_items[0].id:"",qty:1}]:value.filter(line=>line.itemId!==item.id));
  }
  function openReturnedData(booking:any){
    const submitted=returnedData(booking),customerId=booking.customers?.id;
    const savedProfiles=customerProfiles.filter((profile:any)=>profile.customer_id===customerId).map((profile:any)=>({...profile,answerId:null,questions:[],extra_data:{},item_code:"",item_title:"",sub_items:[]}));
    const merged=[...submitted,...savedProfiles].filter((entry:any,index:number,all:any[])=>entry?.id&&all.findIndex((candidate:any)=>candidate.id===entry.id&&candidate.answerId===entry.answerId)===index);
    setDataViewMode("menu");setDataView(merged);setDataBooking(booking);
  }
  async function createManualBooking(){
    if(!manualCustomerId)return alert("請選擇用戶");
    if(!manualLines.length)return alert("請至少選擇一個諮詢項目");
    if(manualMethod==="video"&&!manualSlotStart)return alert("請選擇視訊日期與時間");
    const missing=manualLines.find(line=>items.find(item=>item.id===line.itemId)?.option_mode==="single_required"&&!line.subId);
    if(missing)return alert(`請完成「${items.find(item=>item.id===missing.itemId)?.title||"諮詢項目"}」的子項目選擇`);
    setManualSaving(true);
    try{
      const slotStart=manualSlotStart?`${manualSlotStart}:00+08:00`:null,
        response=await staffPost({action:"create_manual_booking",customerId:manualCustomerId,methodCode:manualMethod,slotStart,lines:manualLines,notifyPayment:manualNotifyPayment}),result=await response.json();
      if(!response.ok)throw new Error(result.error||"建立預約失敗");
      alert(`預約已建立\n訂單編號：${result.bookingNo}\n${result.paymentNotified?"已傳送付款資訊給用戶":"未傳送付款資訊；可在訂單設為已付款後，通知用戶填寫資料"}`);
      setManualOpen(false);setManualCustomerId("");setManualSlotStart("");setManualLines([]);setManualNotifyPayment(true);await load();
    }catch(error){alert(error instanceof Error?error.message:"建立預約失敗")}finally{setManualSaving(false)}
  }
  async function sendLineContact(message:string,action:"text"|"video_reminder"="text"){
    if(!lineContact)return;
    if(action==="text"&&!message.trim())return alert("請輸入要傳送的內容");
    const response=await fetch("/api/staff/line-contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lineUserId:lineContact.line_user_id,message:message.trim(),action,bookingNo:lineContact._booking?.booking_no})}),result=await response.json();
    if(!response.ok)return alert(result.error||"訊息傳送失敗");
    alert(action==="video_reminder"?"視訊提醒已傳送":"LINE 訊息已傳送");setVideoReminderConfirm(false);setLineContact(null);setLineMessage("");setEditingSavedMessage(null);
  }
  function saveLineMessage(){
    const value=lineMessage.trim();if(!value)return alert("請先輸入訊息內容");
    const next=editingSavedMessage===null?[value,...savedMessages.filter(x=>x!==value)].slice(0,12):savedMessages.map((x,index)=>index===editingSavedMessage?value:x);
    setSavedMessages(next);localStorage.setItem("lin_a_sao_staff_line_messages",JSON.stringify(next));setEditingSavedMessage(null);alert("自訂訊息已儲存");
  }
  function deleteLineMessage(index:number){
    if(!confirm("確定刪除這則自訂訊息嗎？刪除後無法復原。"))return;
    const next=savedMessages.filter((_,messageIndex)=>messageIndex!==index);setSavedMessages(next);localStorage.setItem("lin_a_sao_staff_line_messages",JSON.stringify(next));
    if(editingSavedMessage===index){setEditingSavedMessage(null);setLineMessage("")}
  }
  async function login() {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, remember: rememberPassword }),
    });
    if (r.ok) {
      if(rememberPassword)localStorage.setItem("lin_a_sao_staff_password",password);else localStorage.removeItem("lin_a_sao_staff_password");
      setError("");
      load();
    } else setError("密碼錯誤");
  }
  async function remind(no: string, customer?: any) {
    if(customer&&!confirm(`是否確定發送 LINE 通知 ${customer.line_display_name || "LINE 用戶"} (${customer.full_name || "尚未填寫姓名"}) 填寫資料？`))return;
    const r = await fetch("/api/staff/remind", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: no }),
    });
    alert(r.ok ? "已發送提醒" : "發送失敗");
  }
  async function markPaid(no: string) {
    if (!confirm("確定已收到這筆款項，並將訂單標記為已付款嗎？")) return;
    const r = await fetch("/api/staff/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingNo: no, action: "mark_paid" }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "設定失敗");
    setEditing(null); await load();
    alert(j.lineNotified ? "已標記為手動收款，並已傳送已付款 LINE 訊息" : `已標記為手動收款，但 LINE 訊息未送出：${j.lineError || "請檢查 LINE 設定"}`);
  }
  async function saveReturned() {
    if(!returnedEdit?.id)return;
    if(!confirm("是否確認要修改用戶資料並儲存？"))return;
    const r=await fetch("/api/staff/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_consultation_profile",profileId:returnedEdit.id,answerId:returnedEdit.answerId,profile:returnedEdit,questions:returnedEdit.questions||[]})});
    const j=await r.json(); if(!r.ok)return alert(j.error||"儲存失敗"); alert("資料已更新");setReturnedEdit(null);setDataView([]);await load();
  }
  async function saveProfileEditor() {
    if(!confirm("是否確認要修改用戶資料並儲存？"))return;
    const r=await fetch("/api/staff/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_consultation_profile",profileId:profileEditor.id,profile:profileEditor})}),j=await r.json();if(!r.ok)return alert(j.error||"儲存失敗");alert("用戶資料已更新");setProfileEditor(null);setDataView([]);await load();
  }
  async function saveAnswerEditor() {
    if(!confirm("是否確認要修改問事資料並儲存？"))return;
    const r=await fetch("/api/staff/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_answer",answerId:answerEditor.answerId,profileId:answerEditor.targetProfileId,profileIds:answerEditor.targetProfileIds,questions:answerEditor.questions,extraData:answerEditor.extra_data||{}})}),j=await r.json();if(!r.ok)return alert(j.error||"儲存失敗");alert("問事資料已更新");setAnswerEditor(null);setDataView([]);await load();
  }
  const filtered = useMemo(() => {
      const result = rows.filter((x) => {
        if (statusFilter !== "all" && statusKey(x) !== statusFilter)
          return false;
        if (dataFilter !== "all") {
          if (x.payment_status !== "paid") return false;
          if (dataFilter === "returned" && !isComplete(x)) return false;
          if (dataFilter === "missing" && isComplete(x)) return false;
        }
        if(x.consultation_methods?.code === "text"){
          const customerQuery=customerSearch.trim().toLocaleLowerCase();
          const bookingQuery=bookingSearch.trim().toLocaleLowerCase();
          const documentQuery=documentSearch.trim().toLocaleLowerCase();
          const customerValue=`${x.customers?.line_display_name||""} ${x.customers?.full_name||""}`.toLocaleLowerCase();
          if(customerQuery&&!customerValue.includes(customerQuery))return false;
          if(bookingQuery&&!String(x.booking_no||"").toLocaleLowerCase().includes(bookingQuery))return false;
          if(documentQuery&&!consultationNumberFor(x).toLocaleLowerCase().includes(documentQuery))return false;
          const paidDate=key(x.paid_at||x.created_at);
          if(textDateFrom&&paidDate<textDateFrom)return false;
          if(textDateTo&&paidDate>textDateTo)return false;
        }
        return true;
      });
      return result.sort((a, b) => {
        const av = a.paid_at || a.created_at,
          bv = b.paid_at || b.created_at,
          comparison=String(av).localeCompare(String(bv));
        return sortBy==="paid_asc"?comparison:-comparison;
      });
    }, [rows, statusFilter, dataFilter, sortBy, customerSearch, bookingSearch, documentSearch, textDateFrom, textDateTo]),
    video = useMemo(() => {
      const result=rows.filter((x)=>{
        if(x.consultation_methods?.code!=="video")return false;
        if(videoStatusFilter!=="all"&&statusKey(x)!==videoStatusFilter)return false;
        if(videoDataFilter!=="all"){
          if(x.payment_status!=="paid")return false;
          if(videoDataFilter==="returned"&&!isComplete(x))return false;
          if(videoDataFilter==="missing"&&isComplete(x))return false;
        }
        const customerQuery=videoCustomerSearch.trim().toLocaleLowerCase();
        const bookingQuery=videoBookingSearch.trim().toLocaleLowerCase();
        const documentQuery=videoDocumentSearch.trim().toLocaleLowerCase();
        const customerValue=`${x.customers?.line_display_name||""} ${x.customers?.full_name||""}`.toLocaleLowerCase();
        if(customerQuery&&!customerValue.includes(customerQuery))return false;
        if(bookingQuery&&!String(x.booking_no||"").toLocaleLowerCase().includes(bookingQuery))return false;
        if(documentQuery&&!consultationNumberFor(x).toLocaleLowerCase().includes(documentQuery))return false;
        const paidDate=key(x.paid_at||x.created_at);
        if(videoDateFrom&&paidDate<videoDateFrom)return false;
        if(videoDateTo&&paidDate>videoDateTo)return false;
        return true;
      });
      return result.sort((a,b)=>{
        const comparison=String(a.paid_at||a.created_at).localeCompare(String(b.paid_at||b.created_at));
        return videoSortBy==="paid_asc"?comparison:-comparison;
      });
    },[rows,videoStatusFilter,videoDataFilter,videoSortBy,videoCustomerSearch,videoBookingSearch,videoDocumentSearch,videoDateFrom,videoDateTo]),
    text = useMemo(
      () => filtered.filter((x) => x.consultation_methods?.code === "text"),
      [filtered],
    ),
    bookedDates = new Set(
      video.filter((x) => x.slot_start).map((x) => key(x.slot_start)),
    ),
    daily = video.filter((x) => {
      if (!x.slot_start) return false;
      const slotTime = new Date(x.slot_start).getTime();
      if (showUpcomingVideo) return ["paid", "pending"].includes(statusKey(x)) && slotTime >= Date.now();
      if (showNewVideo) {
        const twoWeeksLater = Date.now() + 14 * 24 * 60 * 60 * 1000;
        return ["paid", "pending"].includes(statusKey(x)) && slotTime >= Date.now() && slotTime <= twoWeeksLater;
      }
      return key(x.slot_start) === selectedDate;
    })
      .sort((a,b)=>new Date(a.slot_start).getTime()-new Date(b.slot_start).getTime()),
    cal = useMemo(() => {
      const [y, m] = month.split("-").map(Number),
        pad = (new Date(y, m - 1, 1).getDay() + 6) % 7,
        n = new Date(y, m, 0).getDate();
      return [
        ...Array(pad).fill(null),
        ...Array.from(
          { length: n },
          (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
        ),
      ];
    }, [month]);
  function openEdit(x: any) {
    setEditing(x);
    setEditTime(
      x.slot_start
        ? new Date(
            new Date(x.slot_start).getTime() -
              new Date(x.slot_start).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    );
    setEditLines(
      (x.booking_details || []).map((d: any) => ({
        lineKey: d.id,
        itemId: d.item_id,
        subId: d.booking_detail_sub_items?.[0]?.sub_item_id || "",
        qty: d.quantity || 1,
      })),
    );
  }
  function qty(itemId: string, amount: number, lineKey?: string) {
    setEditLines((v) => {
      const old = lineKey
        ? v.find((x) => x.lineKey === lineKey)
        : v.find((x) => x.itemId === itemId && !x.subId);
      if (!old && amount > 0)
        return [
          ...v,
          { lineKey: crypto.randomUUID(), itemId, subId: "", qty: 1 },
        ];
      if (!old) return v;
      const n = old.qty + amount;
      return n < 1
        ? v.filter((x) => x.lineKey !== old.lineKey)
        : v.map((x) => (x.lineKey === old.lineKey ? { ...x, qty: n } : x));
    });
  }
  function startAdd(item: any) {
    if (!item.sub_items?.length) return qty(item.id, 1);
    setPickedSubId("");
    setAddPicker(item);
  }
  function confirmAdd() {
    if (!pickedSubId) return alert("請先選擇子項目");
    setEditLines((value) => {
      const old = value.find(
        (line) => line.itemId === addPicker.id && line.subId === pickedSubId,
      );
      return old
        ? value.map((line) =>
            line.lineKey === old.lineKey
              ? { ...line, subId: pickedSubId, qty: line.qty + 1 }
              : line,
          )
        : [
            ...value,
            {
              lineKey: crypto.randomUUID(),
              itemId: addPicker.id,
              subId: pickedSubId,
              qty: 1,
            },
          ];
    });
    setAddPicker(null);
  }
  async function saveEdit() {
    if (!editLines.length) return alert("請至少選擇一個項目");
    if (
      editLines.some(
        (l) =>
          items.find((i) => i.id === l.itemId)?.sub_items?.length && !l.subId,
      )
    )
      return alert("請完成子項目選擇");
    const r = await fetch("/api/staff/bookings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingNo: editing.booking_no,
        slotStart: editTime || null,
        lines: editLines,
      }),
    });
    if (r.ok) {
      setEditing(null);
      load();
      alert("已儲存並發送 LINE 變更通知");
    } else alert((await r.json()).error);
  }
  const filteredManualCustomers = useMemo(() => {
    const keyword = manualUserSearch.trim().toLocaleLowerCase("zh-TW");
    if (!keyword) return manualCustomers;
    return manualCustomers.filter((customer) =>
      `${customer.line_display_name || ""} ${customer.full_name || ""}`
        .toLocaleLowerCase("zh-TW")
        .includes(keyword),
    );
  }, [manualCustomers, manualUserSearch]);
  if (error === "未登入")
    return (
      <main className="adminLogin staffLogin"><div>
        <h1>預約工作後台</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密碼"
        />
        <label className="rememberStaff"><input type="checkbox" checked={rememberPassword} onChange={e=>setRememberPassword(e.target.checked)}/> 記住我的密碼</label><button onClick={login}>登入</button></div>
      </main>
    );
  return (
    <main className={`staffPage returned-edit-${returnedEditMode}`}>
      <div className="staffPageHeading"><h1>預約工作後台</h1><button className="manualBookingEntry" onClick={()=>setManualOpen(true)}>＋ 手動建立預約</button></div>
      {error && <div className="error">{error}</div>}
      <section className="staffBookingSection videoBookingSection">
        <h2 className="staffSectionTitle">視訊預約</h2>
        <div className="textBookingTools videoBookingTools">
          <div className="staffFilters staffPrimaryFilters">
            <label>訂單狀態<select value={videoStatusFilter} onChange={e=>setVideoStatusFilter(e.target.value)}><option value="all">全部</option><option value="paid">已付款</option><option value="pending">待付款</option><option value="cancelled">已取消</option><option value="expired">已失效</option></select></label>
            <label>資料回傳<select value={videoDataFilter} onChange={e=>setVideoDataFilter(e.target.value)}><option value="all">全部</option><option value="returned">已回傳</option><option value="missing">尚未回傳</option></select></label>
            <label>排序<select value={videoSortBy} onChange={e=>setVideoSortBy(e.target.value)}><option value="paid_desc">由新到舊</option><option value="paid_asc">由舊到新</option></select></label>
            <div className="staffSearchGroup" role="search" aria-label="搜尋視訊預約"><span className="staffSearchIcon" aria-hidden="true">⌕</span><label className="staffSearchField"><input value={videoCustomerSearch} onChange={e=>setVideoCustomerSearch(e.target.value)} placeholder="LINE名或姓名" aria-label="LINE名或姓名"/></label><label className="staffSearchField"><input value={videoBookingSearch} onChange={e=>setVideoBookingSearch(e.target.value)} placeholder="訂單編號" aria-label="訂單編號"/></label><label className="staffSearchField"><input value={videoDocumentSearch} onChange={e=>setVideoDocumentSearch(e.target.value)} placeholder="諮詢單號" aria-label="諮詢單號"/></label></div>
          </div>
          <div className="staffSecondaryFilters">
            <div className="staffDateRange"><b>付款日期</b><label><span>從</span><input type="date" value={videoDateFrom} onChange={e=>setVideoDateFrom(e.target.value)}/></label><label><span>到</span><input type="date" value={videoDateTo} min={videoDateFrom||undefined} onChange={e=>setVideoDateTo(e.target.value)}/></label>{(videoDateFrom||videoDateTo)&&<button onClick={()=>{setVideoDateFrom("");setVideoDateTo("")}}>清除日期</button>}</div>
            <div className="staffDisplayOptions"><b>表格顯示</b><label><input type="checkbox" checked={showVideoItems} onChange={e=>setShowVideoItems(e.target.checked)}/><span>預約項目</span></label><label><input type="checkbox" checked={showVideoAmount} onChange={e=>setShowVideoAmount(e.target.checked)}/><span>訂單金額</span></label><label><input type="checkbox" checked={showVideoDocumentNumber} onChange={e=>setShowVideoDocumentNumber(e.target.checked)}/><span>諮詢單編號</span></label></div>
          </div>
        </div>
        <div className="staffMonthNav">
          <button
            onClick={() => {
              setMonth(shiftMonth(month, -1));
              setSelectedDate("");
            }}
          >
            ‹
          </button>
          <b>{month.replace("-", " 年 ")} 月</b>
          <button
            onClick={() => {
              setMonth(shiftMonth(month, 1));
              setSelectedDate("");
            }}
          >
            ›
          </button>
        </div>
        <div className="staffCalendar">
          <div className="staffWeek">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <b key={d}>{d}</b>
            ))}
          </div>
          <div className="staffDays">
            {cal.map((d, i) =>
              d ? (
                <button
                  key={d}
                  disabled={!bookedDates.has(d)}
                  className={`${bookedDates.has(d) ? (d < key(new Date().toISOString()) ? "booked pastBooked" : "booked") : "empty"} ${selectedDate === d && !showUpcomingVideo && !showNewVideo ? "selected" : ""}`}
                  onClick={() => {setSelectedDate(d);setShowUpcomingVideo(false);setShowNewVideo(false)}}
                >
                  {Number(d.slice(-2))}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </div>
        <div className="videoViewToolbar">
          <button className={showUpcomingVideo?"active":""} onClick={()=>{setShowUpcomingVideo(true);setShowNewVideo(false);setSelectedDate("")}}>即將來臨的視訊</button>
          <button className={showNewVideo?"active":""} onClick={()=>{setShowNewVideo(true);setShowUpcomingVideo(false);setSelectedDate("")}}>查看新訂單</button>
        </div>
        {(selectedDate || showUpcomingVideo || showNewVideo) && (
          <div className="dailyBookings">
            <h3>目前顯示：{showUpcomingVideo?"即將來臨的視訊":showNewVideo?"兩週內的新訂單":selectedDate}</h3>
            <div className="staffBookingTable">
              <div className="staffTableHead">
                <b>付款時間</b>
                <b>視訊時間</b>
                <b>用戶</b>
                <b>付款狀態</b>
                <b>資料回傳</b>
                <b>訂單編號</b>
                <b>操作</b>
                <b>諮詢單</b>
              </div>
              {daily.map((x) => {
                const complete = isComplete(x),
                  paid = x.payment_status === "paid",
                  status = statusText(x),
                  profiles = returnedData(x);
                return (
                  <article className={`staffTableRow ${new Date(x.slot_start).getTime()<Date.now()?"pastVideoRow":""}`} key={x.id}>
                    <span className="staffPaidTime">{x.paid_at ? new Date(x.paid_at).toLocaleString("zh-TW", {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "尚未付款"}</span>
                    <span className="staffVideoTime">
                      {new Date(x.slot_start).toLocaleTimeString("zh-TW", {
                        timeZone: "Asia/Taipei",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      className="customerButton"
                      onClick={() => setUserView({...x.customers,_booking:x})}
                    >
                      {x.customers?.line_picture_url && (
                        <img src={x.customers.line_picture_url} alt="" />
                      )}
                      <span>{[x.customers?.line_display_name,x.customers?.full_name].filter(Boolean).join("｜")}</span>
                    </button>
                    <b className={`staffState ${statusKey(x)}`}><span>{paid && x.collection_source === "manual" ? "手動收款" : status}</span>{showVideoAmount&&<small className="staffOrderAmount">${Number(x.total_price||0).toLocaleString("en-US")}</small>}</b>
                    {paid ? (
                      complete ? (
                        <button
                          className="returned"
                          onClick={() => openReturnedData(x)}
                        >
                          已回傳
                        </button>
                      ) : (
                        <button
                          className="missing"
                          onClick={() => remind(x.booking_no,x.customers)}
                        >
                          尚未回傳
                        </button>
                      )
                    ) : (
                      <span>—</span>
                    )}
                    <div className="staffOrderCell"><small>{x.booking_no}</small>{showVideoItems&&<div className="staffOrderItems">{bookingItemLines(x).map((line:string,index:number)=><div key={`${x.id}-video-item-${index}`}>{line}</div>)}</div>}</div>
                    <button onClick={() => openEdit(x)}>修改</button>
                    {documentActions(x,showVideoDocumentNumber)}
                  </article>
                );
              })}
              {!daily.length&&<div className="staffEmptyState">目前沒有符合條件的視訊預約</div>}
            </div>
          </div>
        )}
      </section>
      {userView && (
        <div className="modalBackdrop priorityModal" onClick={() => setUserView(null)}>
          <div
            className="modal userInfoModal"
            onClick={(e) => e.stopPropagation()}
          >
            {userView.line_picture_url && (
              <img src={userView.line_picture_url} alt="" />
            )}
            <h2>{userView.line_display_name}</h2>
            <div className="staffCustomerProfile">
              <div><span>姓名</span><b>{userView.full_name || "尚未填寫"}</b></div>
              <div><span>性別</span><b>{userView.gender || "尚未填寫"}</b></div>
              <div><span>地址</span><b>{userView.full_address || "尚未填寫"}</b></div>
              <div><span>國曆生日</span><b>{userView.birth_date || "尚未填寫"}</b></div>
              <div><span>農曆生日</span><b>{userView.lunar_birth_text || "尚未填寫"}</b></div>
              <div><span>生肖</span><b>{userView.zodiac || "尚未填寫"}</b></div>
              <div><span>出生時辰</span><b>{userView.birth_shichen || "尚未填寫"}</b></div>
            </div>
            <div className="userInfoActions">
              <button className="lineContactButton" onClick={()=>{setLineContact(userView);setLineMessage("");setEditingSavedMessage(null)}}>💬 LINE 聯絡</button>
              <button className="userInfoClose" onClick={() => setUserView(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
      {dataBooking && (
        <div className="modalBackdrop" onClick={() => {setDataView([]);setDataBooking(null)}}>
          <div
            className={`modal returnedDataModal mode-${dataViewMode}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="staffModalClose" aria-label="關閉" onClick={() => {setDataView([]);setDataBooking(null)}}>×</button>
            <h2>已回傳的諮詢者資料</h2>
            {dataViewMode==="menu"&&<div className="returnedActionMenu"><button disabled={!dataView.length} onClick={()=>setDataViewMode("user")}>修改用戶資料</button><button disabled={!dataView.some((p:any)=>Boolean(p.answerId))} onClick={()=>setDataViewMode("answers")}>修改問事資料</button>{!dataView.length&&<p className="staffEmptyReturnedAnswers">此訂單標示為已回傳，但資料庫內找不到可編輯的諮詢者資料。請重新整理；若仍出現此訊息，代表該筆舊資料未正確寫入。</p>}</div>}
            {dataViewMode!=="menu"&&<button className="returnedMenuBack" onClick={()=>setDataViewMode("menu")}>‹ 返回功能選單</button>}
            {dataViewMode==="user"&&<div className="staffProfileTags">{uniquePeople(dataView).map((p:any)=>{const category=p.relationship==="本人"&&!p.relationship_detail?"本人":p.profile_type==="person"?"親友":p.profile_type==="pet"?"往生寵物":"過世親友";return <button key={p.id} className="staffProfileTag" onClick={()=>setProfileEditor({...p})}>{p.profile_type==="pet"&&p.photo_data&&<img src={p.photo_data} alt=""/>}<span><b>{p.name}</b><small>{category}{p.relationship_detail?`・${p.relationship_detail}`:""}</small></span></button>})}</div>}
            {dataViewMode==="answers"&&<div className="staffAnswerCards">{dataView.filter((p:any)=>Boolean(p.answerId)).filter((p:any,i:number,all:any[])=>all.findIndex(x=>x.answerId===p.answerId)===i).map((p:any)=>{const people=uniquePeople(dataView.filter((person:any)=>person.answerId===p.answerId));const orderedIds=asArray(p.targetProfileIds).length?asArray(p.targetProfileIds):people.map((person:any)=>person.id);return <article key={p.answerId}><div className="answerProfileTags">{people.map((person:any)=><div className="answerProfileTag" key={person.id}>{person.profile_type==="pet"&&person.photo_data&&<img src={person.photo_data} alt=""/>}<span><b>{person.name}</b><small>{person.relationship_detail||person.relationship}</small></span></div>)}</div><h3>{p.item_title}{p.sub_items?.length?`－${p.sub_items.join("、")}`:""}</h3><button className="editAnswerButton" onClick={()=>setAnswerEditor({...p,targetProfileId:p.targetProfileId||orderedIds[0]||p.id,targetProfileIds:orderedIds,questions:asArray(p.questions)})}>修改該項目問事資料</button></article>})}{!dataView.some((p:any)=>Boolean(p.answerId))&&<p className="staffEmptyReturnedAnswers">這筆預約目前沒有可編輯的問事答案；可返回修改用戶資料。</p>}</div>}
            {dataViewMode==="view"&&<div className="staffAnswerCards">{dataView.filter((p:any,i:number,all:any[])=>all.findIndex(x=>x.answerId===p.answerId)===i).map((p:any)=><article key={p.answerId}><h3>{p.item_title}{p.sub_items?.length?`－${p.sub_items.join("、")}`:""}</h3>{p.questions?.filter(Boolean).map((q:string,n:number)=><p key={n}>問題 {n+1}：{q}</p>)}</article>)}</div>}
            <button onClick={() => {setDataView([]);setDataBooking(null)}}>關閉</button>
          </div>
        </div>
      )}
      {lineContact&&<div className="modalBackdrop priorityModal" onClick={()=>setLineContact(null)}><div className="modal lineContactModal" onClick={e=>e.stopPropagation()}>
        <button className="staffModalClose" onClick={()=>setLineContact(null)}>×</button>
        <h2>💬 LINE 聯絡</h2>
        <p className="lineContactCustomer">{lineContact.line_display_name}・{lineContact.full_name||"尚未填寫姓名"}</p>
        {lineContact._booking?.consultation_methods?.code==="video"&&lineContact._booking?.payment_status==="paid"&&<button className="videoReminderPreset" onClick={()=>setVideoReminderConfirm(true)}>視訊提醒</button>}
        <section className="lineComposeSection">
          <div className="lineComposeHeading"><span aria-hidden="true">＋</span><div><h3>新增自訂訊息</h3><p>輸入常用內容後可儲存，下次點一下就能快速帶入。</p></div></div>
          <label className="lineMessageEditor"><span>訊息內容</span><textarea value={lineMessage} onChange={e=>setLineMessage(e.target.value)} placeholder="請輸入要傳送給用戶的訊息"/></label>
          <button className="saveLineMessageButton lineComposeSave" onClick={saveLineMessage}>{editingSavedMessage===null?"＋ 儲存為常用訊息":"儲存這次修改"}</button>
        </section>
        {savedMessages.length>0&&<section className="savedMessagesSection"><h3>已儲存訊息</h3><div className="savedLineMessages">{savedMessages.map((message,index)=><div className="savedLineMessage" key={`${message}-${index}`}><button className="savedMessageText" onClick={()=>{setLineMessage(message);setEditingSavedMessage(null)}}>{message}</button><button className="savedMessageEdit" aria-label="編輯" onClick={()=>{setLineMessage(message);setEditingSavedMessage(index)}}>編輯</button><button className="savedMessageDelete" aria-label="刪除" onClick={()=>deleteLineMessage(index)}>刪除</button></div>)}</div></section>}
        <div className="lineContactActions single"><button className="sendLineMessageButton" onClick={()=>void sendLineContact(lineMessage)}>傳送訊息</button></div>
      </div></div>}
      {videoReminderConfirm&&lineContact&&<div className="modalBackdrop priorityModal" onClick={()=>setVideoReminderConfirm(false)}><div className="modal videoReminderConfirmModal" onClick={e=>e.stopPropagation()}><h2>傳送視訊提醒</h2><p>是否確定要傳送提醒通知給 <strong>{lineContact.line_display_name}・{lineContact.full_name||"尚未填寫姓名"}</strong>？</p><div><button onClick={()=>void sendLineContact("","video_reminder")}>確定傳送</button><button className="cancel" onClick={()=>setVideoReminderConfirm(false)}>取消</button></div></div></div>}
      {returnedEdit && <div className="modalBackdrop returnedEditBackdrop"><div className="modal returnedEditPage"><button className="staffModalClose" onClick={()=>setReturnedEdit(null)}>×</button><header><div><h2>編輯回傳資料</h2><p>{returnedEdit.item_title}{returnedEdit.sub_items?.length?`－${returnedEdit.sub_items.join("、")}`:""}</p></div></header><div className="returnedEditGrid"><label>姓名<input value={returnedEdit.name||""} onChange={e=>setReturnedEdit({...returnedEdit,name:e.target.value})}/></label><label>關係<input value={returnedEdit.relationship_detail||returnedEdit.relationship||""} onChange={e=>setReturnedEdit({...returnedEdit,relationship_detail:e.target.value})}/></label><label>性別<select value={returnedEdit.gender||""} onChange={e=>setReturnedEdit({...returnedEdit,gender:e.target.value})}><option value="">未填</option><option>男</option><option>女</option><option>其他</option></select></label><label>國曆生日<input type="date" value={returnedEdit.birth_date||""} onChange={e=>setReturnedEdit({...returnedEdit,birth_date:e.target.value})}/></label><label>農曆生日<input value={returnedEdit.lunar_birth_text||""} onChange={e=>setReturnedEdit({...returnedEdit,lunar_birth_text:e.target.value})}/></label><label>生肖<input value={returnedEdit.zodiac||""} onChange={e=>setReturnedEdit({...returnedEdit,zodiac:e.target.value})}/></label><label>出生時辰<input value={returnedEdit.birth_shichen||""} onChange={e=>setReturnedEdit({...returnedEdit,birth_shichen:e.target.value})}/></label><label className="wide">地址<textarea value={returnedEdit.address||""} onChange={e=>setReturnedEdit({...returnedEdit,address:e.target.value})}/></label><label>國曆往生日期<input type="date" value={returnedEdit.death_date||""} onChange={e=>setReturnedEdit({...returnedEdit,death_date:e.target.value})}/></label><label>農曆往生日期<input value={returnedEdit.lunar_death_text||""} onChange={e=>setReturnedEdit({...returnedEdit,lunar_death_text:e.target.value})}/></label><label>往生時辰<input value={returnedEdit.death_shichen||""} onChange={e=>setReturnedEdit({...returnedEdit,death_shichen:e.target.value})}/></label><label className="wide">備註<textarea value={returnedEdit.notes||""} onChange={e=>setReturnedEdit({...returnedEdit,notes:e.target.value})}/></label>{returnedEdit.questions.map((q:string,i:number)=><label className="wide" key={i}>問題 {i+1}<textarea value={q} onChange={e=>setReturnedEdit({...returnedEdit,questions:returnedEdit.questions.map((v:string,n:number)=>n===i?e.target.value:v)})}/></label>)}</div><div className="returnedEditActions"><button onClick={()=>void saveReturned()}>儲存所有修改</button><button className="cancel" onClick={()=>setReturnedEdit(null)}>取消</button></div></div></div>}
      {profileEditor&&<StaffProfileEditor value={profileEditor} profiles={uniquePeople(dataView)} change={setProfileEditor} close={()=>setProfileEditor(null)} save={saveProfileEditor}/>}
      {answerEditor&&<StaffAnswerEditorV2 value={answerEditor} profiles={uniquePeople(dataView)} change={setAnswerEditor} close={()=>setAnswerEditor(null)} save={saveAnswerEditor}/>}
      <section className="staffBookingSection textBookingSection">
        <h2 className="staffSectionTitle">文字預約</h2>
        <div className="textBookingTools">
          <div className="staffFilters staffPrimaryFilters">
            <label>
            訂單狀態
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="paid">已付款</option>
              <option value="pending">待付款</option>
              <option value="cancelled">已取消</option>
              <option value="expired">已失效</option>
            </select>
            </label>
            <label>
            資料回傳
            <select
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="returned">已回傳</option>
              <option value="missing">尚未回傳</option>
            </select>
            </label>
            <label>
            排序
            <select value={sortBy} onChange={(e) => {setSortBy(e.target.value);localStorage.setItem("lin_a_sao_staff_paid_sort",e.target.value)}}>
              <option value="paid_desc">由新到舊</option>
              <option value="paid_asc">由舊到新</option>
            </select>
            </label>
            <div className="staffSearchGroup" role="search" aria-label="搜尋文字預約">
              <span className="staffSearchIcon" aria-hidden="true">⌕</span>
              <label className="staffSearchField"><input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="LINE名或姓名" aria-label="LINE名或姓名"/></label>
              <label className="staffSearchField"><input value={bookingSearch} onChange={e=>setBookingSearch(e.target.value)} placeholder="訂單編號" aria-label="訂單編號"/></label>
              <label className="staffSearchField"><input value={documentSearch} onChange={e=>setDocumentSearch(e.target.value)} placeholder="諮詢單號" aria-label="諮詢單號"/></label>
            </div>
          </div>
          <div className="staffSecondaryFilters">
            <div className="staffDateRange"><b>付款日期</b><label><span>從</span><input type="date" value={textDateFrom} onChange={e=>setTextDateFrom(e.target.value)}/></label><label><span>到</span><input type="date" value={textDateTo} min={textDateFrom||undefined} onChange={e=>setTextDateTo(e.target.value)}/></label>{(textDateFrom||textDateTo)&&<button onClick={()=>{setTextDateFrom("");setTextDateTo("")}}>清除日期</button>}</div>
            <div className="staffDisplayOptions"><b>表格顯示</b><label><input type="checkbox" checked={showTextItems} onChange={e=>setShowTextItems(e.target.checked)}/><span>預約項目</span></label><label><input type="checkbox" checked={showTextAmount} onChange={e=>setShowTextAmount(e.target.checked)}/><span>訂單金額</span></label><label><input type="checkbox" checked={showDocumentNumber} onChange={e=>setShowDocumentNumber(e.target.checked)}/><span>諮詢單編號</span></label></div>
          </div>
        </div>
        <div className="staffBookingTable">
          <div className="staffTableHead">
            <b>付款時間</b>
            <b>用戶</b>
            <b>付款狀態</b>
            <b>資料回傳</b>
            <b>訂單編號</b>
            <b>操作</b>
            <b>諮詢單</b>
          </div>
          {text.map((x) => {
            const complete = isComplete(x),
              paid = x.payment_status === "paid";
            return (
              <article className="staffTableRow" key={x.id}>
                <span>
                  {new Date(x.paid_at || x.created_at).toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                  })}
                </span>
                <button
                  className="customerButton"
                  onClick={() => setUserView({...x.customers,_booking:x})}
                >
                  {x.customers?.line_picture_url && (
                    <img src={x.customers.line_picture_url} alt="" />
                  )}
                  <span>{[x.customers?.line_display_name,x.customers?.full_name].filter(Boolean).join("｜")}</span>
                </button>
                <b className={`staffState ${statusKey(x)}`}><span>{paid && x.collection_source === "manual" ? "手動收款" : statusText(x)}</span>{showTextAmount&&<small className="staffOrderAmount">${Number(x.total_price||0).toLocaleString("en-US")}</small>}</b>
                {paid ? (
                  complete ? (
                    <button
                      className="returned"
                      onClick={() => openReturnedData(x)}
                    >
                      已回傳
                    </button>
                  ) : (
                    <button
                      className="missing"
                      onClick={() => remind(x.booking_no,x.customers)}
                    >
                      尚未回傳
                    </button>
                  )
                ) : (
                  <span>—</span>
                )}
                <div className="staffOrderCell"><small>{x.booking_no}</small>{showTextItems&&<div className="staffOrderItems">{bookingItemLines(x).map((line:string,index:number)=><div key={`${x.id}-item-${index}`}>{line}</div>)}</div>}</div>
                <button onClick={() => openEdit(x)}>修改</button>
                {documentActions(x)}
              </article>
            );
          })}
        </div>
      </section>
      {manualOpen && (
        <div className="modalBackdrop" onClick={()=>setManualOpen(false)}>
          <div className="modal manualBookingModal" onClick={event=>event.stopPropagation()}>
            <button className="staffModalClose" aria-label="關閉" onClick={()=>setManualOpen(false)}>×</button>
            <h2>手動建立預約</h2>
            <p>僅列出已經登入 LINE 並完成本人資料的用戶。</p>
            <div className="manualMethodTabs">
              <button className={manualMethod==="text"?"active":""} onClick={()=>setManualMethod("text")}>文字諮詢</button>
              <button className={manualMethod==="video"?"active":""} onClick={()=>setManualMethod("video")}>視訊諮詢</button>
            </div>
            <div className="manualUserPicker">
              <label htmlFor="manual-user-search">選擇用戶</label>
              <div className="manualUserSearchBox"><span aria-hidden="true">⌕</span><input id="manual-user-search" type="search" value={manualUserSearch} onChange={event=>setManualUserSearch(event.target.value)} placeholder="搜尋 LINE 名稱或姓名" autoComplete="off" /></div>
              <small>{manualUserSearch.trim() ? `找到 ${filteredManualCustomers.length} 位符合的用戶` : `共 ${manualCustomers.length} 位可選用戶`}</small>
            </div>
            <div className="manualUserResults" role="listbox" aria-label="符合條件的 LINE 用戶">
              {filteredManualCustomers.map(customer=><div key={customer.id} className={`manualUserResult ${manualCustomerId===customer.id?"selected":""}`}>
                <button type="button" className="manualUserSelect" onClick={()=>setManualCustomerId(customer.id)}>
                  {customer.line_picture_url?<img src={customer.line_picture_url} alt="LINE 頭像"/>:<span className="avatarFallback">LINE</span>}
                  <span><b>{customer.line_display_name||"LINE 用戶"}｜{customer.full_name}</b><small>{manualCustomerId===customer.id?"已選取":"點此選取"}</small></span>
                </button>
                <button type="button" className="manualUserProfileButton" onClick={()=>setUserView(customer)}>查看資料</button>
              </div>)}
              {!filteredManualCustomers.length&&<p className="manualUserEmpty">找不到符合條件的用戶</p>}
            </div>
            {manualMethod==="video"&&<label className="manualMainField">視訊日期與時間<input type="datetime-local" value={manualSlotStart} onChange={event=>setManualSlotStart(event.target.value)}/><small>後台可依實際需要建立 4 天內的視訊預約；時間為台灣時間。</small></label>}
            <section className="manualItems"><h3>選擇諮詢項目</h3>{items.map(item=>{const line=manualLines.find(candidate=>candidate.itemId===item.id);return <article key={item.id} className={line?"selected":""}>
              <label><input type="checkbox" checked={Boolean(line)} onChange={event=>toggleManualItem(item,event.target.checked)}/><b>{item.title}</b><span>NT$ {Number(item.price||0).toLocaleString("zh-TW")}</span></label>
              {line&&item.sub_items?.length>0&&<select value={line.subId} onChange={event=>setManualLines(value=>value.map(candidate=>candidate.itemId===item.id?{...candidate,subId:event.target.value}:candidate))}><option value="">請選擇子項目</option>{item.sub_items.map((sub:any)=><option key={sub.id} value={sub.id}>{sub.title}　NT$ {Number(sub.price||0).toLocaleString("zh-TW")}</option>)}</select>}
              {line&&<label className="manualQuantity">數量<input type="number" min="1" max="20" value={line.qty} onChange={event=>setManualLines(value=>value.map(candidate=>candidate.itemId===item.id?{...candidate,qty:Math.max(1,Number(event.target.value)||1)}:candidate))}/></label>}
            </article>})}</section>
            <fieldset className="manualPaymentChoice"><legend>建立後是否傳送付款資訊？</legend><label><input type="radio" checked={manualNotifyPayment} onChange={()=>setManualNotifyPayment(true)}/><span><b>傳送付款資訊</b><small>用戶會收到「待付款」訊息，可直接前往付款。</small></span></label><label><input type="radio" checked={!manualNotifyPayment} onChange={()=>setManualNotifyPayment(false)}/><span><b>暫不傳送付款資訊</b><small>適合另外轉帳；後台設為已付款後仍可通知用戶填寫資料。</small></span></label></fieldset>
            <button className="manualCreateButton" disabled={manualSaving} onClick={createManualBooking}>{manualSaving?"建立中，請稍候…":"確認建立預約"}</button>
          </div>
        </div>
      )}
      {editing && (
        <div className="modalBackdrop" onClick={() => setEditing(null)}>
          <div
            className="modal staffEditModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="staffModalClose"
              aria-label="關閉"
              onClick={() => setEditing(null)}
            >
              ×
            </button>
            <header>
              {editing.customers?.line_picture_url ? (
                <img src={editing.customers.line_picture_url} alt="LINE頭像" />
              ) : (
                <div className="avatarFallback">LINE</div>
              )}
              <div>
                <h2>{editing.customers?.line_display_name || "LINE 用戶"}</h2>
                <p>{editing.booking_no}</p>
              </div>
            </header>
            <div className="bookingStatus">
              <b>{editing.payment_status === "paid" ? (editing.collection_source === "manual" ? "手動收款" : "已付款") : "未付款"}</b>
              {editing.payment_status === "paid" && (
                <b>
                  {isComplete(editing)
                    ? "諮詢者資料已填"
                    : "諮詢者資料未填"}
                </b>
              )}
            </div>
            {editing.payment_status !== "paid" && <button className="manualPaidButton" onClick={() => markPaid(editing.booking_no)}>設為已付款（手動收款）</button>}
            {editing.payment_status === "paid" &&
              !isComplete(editing) && (
                <button
                  className="remindButton"
                  onClick={() => remind(editing.booking_no, editing.customers)}
                >
                  通知客人填寫資料
                </button>
              )}
            {editing.consultation_methods?.code === "video" && (
              <label className="editTime">
                預約時間
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </label>
            )}
            <h3>修改諮詢項目與數量</h3>
            <div className="staffEditColumns">
              <section className="staffCurrentItems">
                <h3>目前已有項目</h3>
                {editLines.map((line) => {
                  const i = items.find((item) => item.id === line.itemId);
                  if (!i) return null;
                  return (
                    <article key={line.lineKey}>
                      <div>
                        <b>{i.title}</b>
                        {i.sub_items?.length > 0 && (
                          <select
                            value={line.subId}
                            onChange={(e) =>
                              setEditLines((v) =>
                                v.map((x) =>
                                  x.lineKey === line.lineKey
                                    ? { ...x, subId: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="">請選子項目</option>
                            {i.sub_items.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.title}　NT$ {s.price}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="staffQty">
                        <button onClick={() => qty(i.id, -1, line.lineKey)}>
                          −
                        </button>
                        <b>{line.qty}</b>
                        <button onClick={() => qty(i.id, 1, line.lineKey)}>
                          ＋
                        </button>
                        <button
                          className="removeLine"
                          onClick={() =>
                            setEditLines((v) =>
                              v.filter((x) => x.lineKey !== line.lineKey),
                            )
                          }
                        >
                          刪除
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!editLines.length && <p className="emptyHint">尚未選擇項目</p>}
              </section>
              <section className="staffCatalogItems">
                <h3>新增諮詢項目</h3>
                {items.map((i) => {
                  return (
                    <article key={i.id}>
                      <b>{i.title}</b>
                      <button
                        className="staffAddButton"
                        onClick={() => startAdd(i)}
                      >
                        ＋
                      </button>
                    </article>
                  );
                })}
              </section>
            </div>
            <div className="staffTotalPrice"><b>總金額</b><strong>NT$ {Number(editing.total_price||0).toLocaleString("en-US")}</strong>{editing.payment_status!=="paid"&&editing.status!=="cancelled"&&editing.status!=="expired"&&<button onClick={()=>{setPriceEdit(editing);setPriceValue(String(editing.total_price||0))}}>修改</button>}</div>
            <button onClick={saveEdit}>儲存並發送 LINE 通知</button>
            <button className="cancel" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {documentLinkEdit&&<div className="modalBackdrop documentLinkBackdrop" onClick={()=>setDocumentLinkEdit(null)}><div className="modal documentLinkModal" onClick={e=>e.stopPropagation()}><button className="staffModalClose" onClick={()=>setDocumentLinkEdit(null)}>×</button><h2>更改諮詢單連結</h2><p>先到 Google 雲端硬碟開啟要使用的文件，複製網址後貼到下方。</p><a className="openGoogleDrive" href="https://drive.google.com/drive/folders/1jajjmq_vxySLJBVWleIGrmkRI0TykJgI?usp=drive_link" target="_blank" rel="noreferrer">開啟<strong>阿嫂諮詢單</strong>資料夾</a><label>Google 文件連結<input autoFocus placeholder="https://docs.google.com/document/d/..." value={documentLinkValue} onChange={e=>setDocumentLinkValue(e.target.value)}/></label><div className="documentLinkActions"><button onClick={()=>void saveDocumentLink()}>確認更改連結</button><button className="cancel" onClick={()=>setDocumentLinkEdit(null)}>取消</button></div></div></div>}
      {documentRebuild&&<div className="modalBackdrop" onClick={()=>setDocumentRebuild(null)}><div className="modal rebuildDocumentModal" onClick={e=>e.stopPropagation()}><button className="staffModalClose" onClick={()=>setDocumentRebuild(null)}>×</button><h2>重新建立諮詢單</h2><p>請選擇這次要如何建立：</p><button onClick={()=>void generateDocument(documentRebuild,"replace")}><b>覆蓋原諮詢單</b><small>更新連結，原本的文件會移至垃圾桶</small></button><button onClick={()=>void generateDocument(documentRebuild,"new")}><b>建立新的諮詢單</b><small>保留原文件，新檔名會依序加上 .新01、.新02</small></button><button className="cancel" onClick={()=>setDocumentRebuild(null)}>取消</button></div></div>}
      {teacherOverwrite&&<div className="modalBackdrop" onClick={()=>setTeacherOverwrite(null)}><div className="modal teacherOverwriteModal" onClick={e=>e.stopPropagation()}><button className="staffModalClose" onClick={()=>setTeacherOverwrite(null)}>×</button><h2>阿嫂已編輯過此諮詢單</h2><p>覆蓋後，阿嫂已輸入的內容可能無法復原。若仍要覆蓋，請在下方輸入：</p><b>確定覆蓋諮詢單</b><input value={overwritePhrase} onChange={e=>setOverwritePhrase(e.target.value)} placeholder="請輸入指定文字"/><button disabled={overwritePhrase!=="確定覆蓋諮詢單"} onClick={()=>{const target=teacherOverwrite;setTeacherOverwrite(null);void generateDocument(target,"replace",true)}}>確認覆蓋諮詢單</button><button className="cancel" onClick={()=>setTeacherOverwrite(null)}>取消</button></div></div>}
      {priceEdit&&<div className="modalBackdrop" onClick={()=>setPriceEdit(null)}><div className="modal staffPriceModal" onClick={e=>e.stopPropagation()}><button className="staffModalClose" onClick={()=>setPriceEdit(null)}>×</button><h2>修改訂單價格</h2><p>訂單編號：{priceEdit.booking_no}</p><label>新的總金額<div className="priceInput"><span>NT$</span><input autoFocus inputMode="numeric" value={priceValue} onChange={e=>setPriceValue(e.target.value.replace(/[^0-9]/g,""))}/></div></label><button onClick={()=>void savePrice()}>確認修改</button><button className="cancel" onClick={()=>setPriceEdit(null)}>取消</button></div></div>}
      {addPicker && (
        <div
          className="modalBackdrop addSubBackdrop"
          onClick={() => setAddPicker(null)}
        >
          <div
            className="modal staffSubPicker"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="staffModalClose"
              aria-label="關閉"
              onClick={() => setAddPicker(null)}
            >
              ×
            </button>
            <h2>{addPicker.title}</h2>
            <p>請選擇子項目</p>
            <div className="staffSubOptions">
              {addPicker.sub_items.map((sub: any) => (
                <button
                  key={sub.id}
                  className={pickedSubId === sub.id ? "selected" : ""}
                  onClick={() => setPickedSubId(sub.id)}
                >
                  <b>{sub.title}</b>
                  <span>NT$ {Number(sub.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <button className="confirmSubAdd" onClick={confirmAdd}>
              確認加入
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
function StaffProfileEditor({value,profiles,change,close,save}:any){const person=value.profile_type==="person",pet=value.profile_type==="pet";return <div className="modalBackdrop returnedEditBackdrop"><div className="modal staffFrontEditor"><button className="staffModalClose" onClick={close}>×</button><h2>編輯諮詢者資料</h2><div className="staffProfileKinds"><b className="selected">{person?"親友":pet?"往生寵物":"過世親友"}</b></div><div className="staffFrontFields">{pet&&<label>寵物主人<select value={value.owner_profile_id||""} onChange={e=>change({...value,owner_profile_id:e.target.value})}><option value="">請選擇</option>{profiles.filter((p:any)=>p.profile_type==="person").map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{pet&&value.photo_data&&<img className="staffPetPhoto" src={value.photo_data} alt="寵物照片"/>}<label>{pet?"寵物姓名":"姓名"}<input value={value.name||""} onChange={e=>change({...value,name:e.target.value})}/></label>{!pet&&<label>他是我的…<input value={value.relationship_detail||""} onChange={e=>change({...value,relationship_detail:e.target.value})}/></label>}{!pet&&<label>性別<select value={value.gender||""} onChange={e=>change({...value,gender:e.target.value})}><option value="">請選擇</option><option>男</option><option>女</option><option>其他</option></select></label>}<label>{pet?"出生日期":"國曆生日"}<input type="date" value={value.birth_date||""} onChange={e=>change({...value,birth_date:e.target.value})}/></label><label>農曆生日<input value={value.lunar_birth_text||""} onChange={e=>change({...value,lunar_birth_text:e.target.value})}/></label>{!pet&&<><label>生肖<input value={value.zodiac||""} onChange={e=>change({...value,zodiac:e.target.value})}/></label><label>出生時辰<input value={value.birth_shichen||""} onChange={e=>change({...value,birth_shichen:e.target.value})}/></label><label>地址<textarea value={value.address||""} onChange={e=>change({...value,address:e.target.value})}/></label></>}{!person&&<><label>國曆往生日期<input type="date" value={value.death_date||""} onChange={e=>change({...value,death_date:e.target.value})}/></label><label>農曆往生日期<input value={value.lunar_death_text||""} onChange={e=>change({...value,lunar_death_text:e.target.value})}/></label><label>往生時辰<input value={value.death_shichen||""} onChange={e=>change({...value,death_shichen:e.target.value})}/></label></>}<label>備註<textarea value={value.notes||""} onChange={e=>change({...value,notes:e.target.value})}/></label></div><div className="returnedEditActions"><button onClick={()=>void save()}>儲存</button><button className="cancel" onClick={close}>取消</button></div></div></div>}
function StaffAnswerEditor({value,profiles,change,close,save}:any){return <div className="modalBackdrop returnedEditBackdrop"><div className="modal staffFrontEditor"><button className="staffModalClose" onClick={close}>×</button><h2>修改問事資料</h2><p className="staffAnswerItem">{value.item_title}{value.sub_items?.length?`－${value.sub_items.join("、")}`:""}</p><div className="staffFrontFields"><label>這個項目是為誰諮詢？<select value={value.targetProfileId||""} onChange={e=>change({...value,targetProfileId:e.target.value})}>{profiles.map((p:any)=><option key={p.id} value={p.id}>{p.name}（{p.relationship_detail||p.relationship}）</option>)}</select></label>{value.questions.map((q:string,i:number)=><label key={i}>問題 {i+1}<textarea value={q} onChange={e=>change({...value,questions:value.questions.map((v:string,n:number)=>n===i?e.target.value:v)})}/></label>)}</div><div className="returnedEditActions"><button onClick={()=>void save()}>儲存</button><button className="cancel" onClick={close}>取消</button></div></div></div>}
