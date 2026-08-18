import crypto from "node:crypto";

const folderId=process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID||"1JbS9-gncEOS4BW74pI-9NKSN8RYsokPp";
const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||"";
const privateKey=(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||"").replace(/\\n/g,"\n");
const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");

async function token(){
 if(!email||!privateKey)throw new Error("尚未設定 Google 服務帳號環境變數");
 const now=Math.floor(Date.now()/1000),unsigned=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:email,scope:"https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
 const sign=crypto.createSign("RSA-SHA256");sign.update(unsigned);sign.end();
 const assertion=`${unsigned}.${sign.sign(privateKey,"base64url")}`;
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 const j=await r.json();if(!r.ok)throw new Error(j.error_description||"無法連線 Google");return j.access_token as string;
}
async function google(path:string,accessToken:string,init:RequestInit={}){const r=await fetch(path,{...init,headers:{authorization:`Bearer ${accessToken}`,"content-type":"application/json",...(init.headers||{})}});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||"Google API 操作失敗");return j}
const text=(v:unknown)=>String(v??"").trim();
function extraRows(value:unknown,prefix=""):Array<[string,string]>{
 if(value==null||value==="")return[];
 if(Array.isArray(value))return value.flatMap((v,i)=>extraRows(v,`${prefix}${prefix?" ":""}${i+1}`));
 if(typeof value==="object")return Object.entries(value as Record<string,unknown>).flatMap(([k,v])=>extraRows(v,`${prefix}${prefix?"－":""}${k}`));
 return [[prefix||"其他資料",text(value)]];
}
const row=(label:string,value:string)=>({values:[{userEnteredValue:{stringValue:label},userEnteredFormat:{textFormat:{bold:true}}},{userEnteredValue:{stringValue:value},userEnteredFormat:{textFormat:{bold:false}}}]});

export async function createConsultationSheets(db:any,bookingId:string,bookingNo:string){
 const {data:details,error}=await db.from("booking_details").select("id,item_title,google_sheet_id,booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(*),booking_answer_participants(position,consultation_profiles(*)))").eq("booking_id",bookingId);
 if(error)throw error;const accessToken=await token();
 for(const detail of details||[]){
  if(detail.google_sheet_id)continue;
  const escaped=text(detail.item_title).replace(/'/g,"\\'");
  const found=await google(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and name='${escaped}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,accessToken);
  const template=found.files?.[0];if(!template)throw new Error(`找不到同名試算表模板：${detail.item_title}`);
  const copied=await google(`https://www.googleapis.com/drive/v3/files/${template.id}/copy?supportsAllDrives=true`,accessToken,{method:"POST",body:JSON.stringify({name:`${bookingNo}－${detail.item_title}`,parents:[folderId]})});
  const meta=await google(`https://sheets.googleapis.com/v4/spreadsheets/${copied.id}?fields=sheets.properties`,accessToken),sheetId=meta.sheets?.[0]?.properties?.sheetId??0;
  const answer=detail.booking_consultation_answers?.[0],people=[answer?.consultation_profiles,...(answer?.booking_answer_participants||[]).sort((a:any,b:any)=>a.position-b.position).map((x:any)=>x.consultation_profiles)].filter(Boolean).filter((p:any,i:number,a:any[])=>a.findIndex(x=>x.id===p.id)===i);
  const rows:any[]=[];
  people.forEach((p:any,i:number)=>{if(i)rows.push(row("", ""));rows.push(row(people.length>1?`諮詢者 ${i+1}－姓名`:"姓名",text(p.name)),row("農曆生日",`${text(p.lunar_birth_text)}${p.zodiac?`（${p.zodiac}）`:""}`),row("居住地址",text(p.address)));for(const [k,v] of extraRows(Object.fromEntries(Object.entries(p).filter(([k])=>!["id","customer_id","created_at","updated_at","name","lunar_birth_text","zodiac","address"].includes(k)))))if(v)rows.push(row(k,v))});
  (answer?.questions||[]).map(text).filter(Boolean).forEach((q:string,i:number)=>{rows.push(row(`Q${i+1}`,q),row(`A${i+1}`,""))});
  for(const [k,v] of extraRows(answer?.extra_data||{}))if(v)rows.push(row(k,v));
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${copied.id}:batchUpdate`,accessToken,{method:"POST",body:JSON.stringify({requests:[{appendCells:{sheetId,rows,fields:"userEnteredValue,userEnteredFormat.textFormat.bold"}}]})});
  await db.from("booking_details").update({google_sheet_id:copied.id,google_sheet_url:`https://docs.google.com/spreadsheets/d/${copied.id}/edit`,google_sheet_created_at:new Date().toISOString()}).eq("id",detail.id);
 }
}
