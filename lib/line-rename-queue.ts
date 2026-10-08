const one = (v: any) => Array.isArray(v) ? v[0] : v;
export function buildRenameQueue(bookings: any[], now = Date.now()) {
  const staffIds=new Set(bookings.map(b=>one(b.customers)).filter(c=>{
    const name=String(c?.full_name||'').trim(),line=String(c?.line_display_name||'').trim().toLowerCase();
    return (name==='林珮均'&&line==='peggy')||(name==='林啟恩'&&line==='nnn');
  }).map(c=>c.line_user_id).filter(Boolean));
  const documents = bookings.filter(b => one(b.consultation_methods)?.code !== 'video')
    .flatMap(b => (b.booking_details || []).filter((d:any) => d.google_document_id).map((d:any) => ({id:d.google_document_id,created:d.google_document_created_at||b.created_at})))
    .filter((d:any,i:number,all:any[]) => all.findIndex(x=>x.id===d.id)===i)
    .sort((a:any,b:any)=>String(a.created).localeCompare(String(b.created)));
  const rows:any[] = [], skipped:any[] = [];
  for (const b of bookings) {
    const customer=one(b.customers), method=one(b.consultation_methods)?.code;
    if(staffIds.has(customer?.line_user_id))continue;
    if (b.payment_status!=='paid'||['cancelled','canceled','expired','refunded'].includes(b.status)||!['text','video'].includes(method)) continue;
    if (method==='video' && (!b.slot_start || !Number.isFinite(Date.parse(b.slot_start)) || Date.parse(b.slot_start)<now)) continue;
    if (method==='text' && (b.consultation_result_returned_at||b.consultation_result_manual_at||b.consultation_result_detected_at)) continue;
    const reject=(reason:string)=>skipped.push({bookingNo:b.booking_no,reason});
    if (!/^U[0-9a-f]{32}$/i.test(customer?.line_user_id||'')) {reject('缺少個人 LINE 帳號');continue;}
    if (!customer.full_name?.trim()) {reject('基本資料尚未填本名');continue;}
    let alias='';
    if(method==='video') {
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(b.slot_start));
      const p=(key:string)=>parts.find(x=>x.type===key)?.value;
      alias=`視訊 ${Number(p('month'))}/${Number(p('day'))} ${p('hour')}:${p('minute')} ${customer.full_name.trim()}`;
    } else {
      const id=(b.booking_details||[]).find((d:any)=>d.google_document_id)?.google_document_id;
      const i=documents.findIndex(d=>d.id===id);
      if(i<0||i>=26*99){reject('尚無可用諮詢單編號，請先建立諮詢單');continue;}
      // 文字預約沿用客人原本的 LINE 顯示名稱，讓後台複製搜尋名稱與改名後一致。
      alias=`${String.fromCharCode(65+Math.floor(i/99))}${String(i%99+1).padStart(2,'0')}-${(customer.line_display_name||customer.full_name).trim()}`;
    }
    rows.push({bookingId:b.id,bookingNo:b.booking_no,lineUserId:customer.line_user_id,fullName:customer.full_name,displayName:customer.line_display_name||'',pictureUrl:customer.line_picture_url||'',method,slotStart:b.slot_start,alias});
  }
  rows.sort((a,b)=>String(a.slotStart||'').localeCompare(String(b.slotStart||'')));
  const seen=new Set();
  return {rows:rows.filter(r=>{const key=r.method+':'+r.lineUserId;if(seen.has(key)){skipped.push({bookingNo:r.bookingNo,reason:'同一用戶已有較早預約，保留較早一筆'});return false;}seen.add(key);return true;}),skipped};
}
