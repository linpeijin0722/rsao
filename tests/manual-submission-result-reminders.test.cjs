const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const crypto=require('node:crypto');
test('staff manual receipt is authenticated and only stamps an unsubmitted paid booking',async()=>{
 let signedIn=true,patch,filters=[];
 const query={update(value){patch=value;return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},select(){return this},maybeSingle:async()=>({data:{id:'B'}})};
 const context=vm.createContext({console,NextResponse:{json:(body,init)=>({body,status:init?.status||200})},cookies:async()=>({get:()=>({value:'session'})}),isAdminSession:()=>signedIn,adminSupabase:()=>({from:()=>query})});
 const source=stripTypeScriptTypes(fs.readFileSync('app/api/staff/bookings/route.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
 vm.runInContext(source,context);
 const request={json:async()=>({bookingNo:'B1',action:'mark_manual_submission'})};
 assert.equal((await context.POST(request)).status,200);
 assert.equal(patch.data_submission_source,'manual_line');assert.ok(patch.data_submitted_at);
 assert.deepEqual(filters,[['booking_no','B1'],['payment_status','paid'],['data_submitted_at',null]]);
 patch=null;signedIn=false;
 assert.equal((await context.POST(request)).status,401);assert.equal(patch,null);
});
function docs(text,namedRanges={}){
 const source=fs.readFileSync('lib/google-consultation-docs.ts','utf8');
 const writes=[];
 const context=vm.createContext({crypto,process:{env:{}},console});
 vm.runInContext(stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''),context);
 context.accessToken=async()=>'';
 context.google=async(url,token,options)=>{
  if(options){writes.push(...JSON.parse(options.body).requests);return {}}
  return {namedRanges,body:{content:[{startIndex:1,endIndex:text.length+1,paragraph:{elements:[{startIndex:1,endIndex:text.length+1,textRun:{content:text}}]}}]}};
 };
 return {context,writes};
}
test('manual reply writes Q/A, royal blue 12px, and is included in return preview',async()=>{
 const text='項目 1（共 1 個項目）\n外靈干擾\n姓名：甲\n想問的問題\n最近睡不好\n\n';
 const {context,writes}=docs(text);
 await context.upsertQuickConsultationManualReplies('DOC',[{answer:'第一段\n第二段',label:'想問的問題',question:'最近睡不好',itemCode:'spirit',itemLabel:'外靈干擾',targetName:'甲',profileName:'甲'}]);
 const insert=writes.find(r=>r.insertText).insertText;
 assert.match(insert.text,/Q1: 最近睡不好\nA1: 第一段\n第二段/);
 const style=writes.find(r=>r.updateTextStyle).updateTextStyle;
 assert.equal(style.textStyle.fontSize.magnitude,9);
 assert.equal(style.textStyle.foregroundColor.color.rgbColor.blue,0.882353);
 assert.ok(writes.some(r=>r.createNamedRange));
 const updated=text.slice(0,insert.location.index-1)+insert.text+text.slice(insert.location.index-1);
 const preview=await docs(updated).context.getConsultationReturnPreview('DOC');
 assert.match(preview[0].content,/A1: 第一段\n第二段/);
 assert.doesNotMatch(preview[0].content,/姓名：甲/);
});
test('existing named reply is replaced, not appended with a second Q1',async()=>{
 const text='項目 1（共 1 個項目）\n外靈干擾\n姓名：甲\n想問的問題\n最近睡不好\nQ1: 最近睡不好\nA1: 舊答案\n\n';
 const entry={answer:'新答案',label:'想問的問題',question:'最近睡不好',itemCode:'spirit',itemLabel:'外靈干擾',targetName:'甲',profileName:'甲'};
 const key='quick_manual_'+crypto.createHash('sha256').update(['spirit','甲','甲','外靈干擾','想問的問題','最近睡不好'].join('|')).digest('hex').slice(0,32);
 const start=text.indexOf('Q1:')+1,end=text.indexOf('舊答案')+3+1+1;
 const {context,writes}=docs(text,{[key]:{namedRanges:[{namedRangeId:'R',ranges:[{startIndex:start,endIndex:end}]}]}});
 await context.upsertQuickConsultationManualReplies('DOC',[entry]);
 assert.equal(writes.find(r=>r.deleteNamedRange).deleteNamedRange.namedRangeId,'R');
 assert.equal(writes.find(r=>r.insertText).insertText.location.index,start);
 assert.match(writes.find(r=>r.insertText).insertText.text,/^Q1:/);
});
function iterator(items){let n=0;return {hasNext:()=>n<items.length,next:()=>items[n++]}}
function reminders(orders,files){
 const sent=[],folder={getId:()=> 'returned',getFiles:()=>iterator(files),getFolders:()=>iterator([])};
 const context=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},DriveApp:{getFolderById:()=>folder},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({orders})})},Utilities:{formatDate:(date,zone,pattern)=>{
  const d=new Date(date.getTime()+8*3600000),h=d.getUTCHours();return ({'H':String(h),'mm':String(d.getUTCMinutes()).padStart(2,'0'),'M/d':`${d.getUTCMonth()+1}/${d.getUTCDate()}`,'u':String(d.getUTCDay()||7)})[pattern];
 }}});
 vm.runInContext(fs.readFileSync('google-apps-script/VideoCalendarNotifications.gs','utf8'),context);
 context.pushToUsers=(ids,text)=>sent.push(text);
 return {context,sent};
}
test('returned document IDs suppress reminders; remaining orders are merged',()=>{
 const orders=[1,2,3].map(i=>({bookingNo:'B'+i,slotStart:'2026-10-06T09:00:00Z',name:'姓名'+i,lineName:'LINE'+i,documentIds:['D'+i]}));
 const file={getId:()=> 'D1',isTrashed:()=>false,getMimeType:()=> 'application/vnd.google-apps.document'};
 const {context,sent}=reminders(orders,[file]);context.checkThreeDaysBeforeVideoEvents();
 assert.equal(sent.length,1);assert.match(sent[0],/^⚠️ 請確認「諮詢結果」是否已經回傳\n⏰ 10\/6（二）下午 5:00 LINE2（姓名2）/);
 assert.match(sent[0],/LINE3/);assert.doesNotMatch(sent[0],/LINE1|B2|台灣時間/);
});
test('Drive access error aborts notification instead of treating it as not returned',()=>{
 const {context,sent}=reminders([],[]);context.DriveApp.getFolderById=()=>{throw Error('permission')};
 assert.throws(()=>context.checkThreeDaysBeforeVideoEvents(),/permission/);assert.equal(sent.length,0);
});
