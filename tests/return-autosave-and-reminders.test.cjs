const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function load(file,imports={},globals={}){const c=vm.createContext({exports:{},require:n=>imports[n],...globals});vm.runInContext(compile(file),c);return c.exports}
const time=load('lib/taipei-time.ts');
test('single and merged urgent reminder keep Taiwan time, omit orders, sort earliest first',()=>{
 const {staffReminderText}=load('lib/staff-data-reminders.ts',{'./taipei-time':time});
 const a={slot_start:'2026-10-06T06:30:00Z',booking_no:'SECRET-ORDER',customers:{full_name:'甲'}},b={...a,slot_start:'2026-10-05T16:40:00Z',customers:[{full_name:'乙'}]};
 const single=staffReminderText(a,'https://example.com/');assert.match(single,/🚨【視訊將至，資料尚未回傳】/);assert.match(single,/視訊時間快到了！以下客人仍未回傳問事資料，請聯繫催填：/);assert.match(single,/視訊時間：2026\/10\/06 14:30/);assert.doesNotMatch(single,/SECRET|台灣時間|優先處理/);
 const multi=staffReminderText([a,b],'https://example.com');assert.ok(multi.indexOf('00:40')<multi.indexOf('14:30'));assert.equal((multi.match(/前往後台確認/g)||[]).length,1);assert.match(multi,/② ⏰ 2026\/10\/06 14:30/);
});
const sample=content=>({versions:{1:[{id:'original',label:'原始',content,changeSummary:[],suspectedIssues:[]}]},activeVersionIds:{1:'original'},selected:[1],sourceItems:[{index:1,content:'source'}]});
test('restore edited draft on reload and retain edits when Google source changes',()=>{
 const {restoreReturnDraft,validReturnDraft}=load('lib/consultation-return-draft.ts');const saved=sample('我的修改'),fresh=sample('Google 內容');
 assert.equal(restoreReturnDraft(fresh,saved).payload.versions[1][0].content,'我的修改');
 fresh.sourceItems[0].content='更新後的文件';const merged=restoreReturnDraft(fresh,saved);assert.equal(merged.changed,true);assert.equal(merged.payload.versions[1][0].content,'我的修改');assert.equal(merged.payload.versions[1][1].content,'Google 內容');assert.equal(merged.payload.activeVersionIds[1],'original');assert.equal(validReturnDraft({...saved,versions:{1:[{}]}}),false);
});
function hookHarness(fetcher){const slots=[],effects=[],listeners={};let cursor=0,result;const react={useState(init){const i=cursor++;if(!(i in slots))slots[i]=init;return[slots[i],x=>{slots[i]=typeof x==='function'?x(slots[i]):x}]},useRef(init){const i=cursor++;return slots[i]||(slots[i]={current:init})},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((x,j)=>x!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>slots[i].cleanup=fn())}}};
 const {useReturnDraft}=load('app/staff/useReturnDraft.ts',{react},{fetch:fetcher,setTimeout:()=>1,clearTimeout(){},window:{addEventListener:(n,fn)=>listeners[n]=fn,removeEventListener:n=>delete listeners[n]}});
 return{render(payload){cursor=0;result=useReturnDraft({bookingNo:'B',documentId:'D'},payload,true,0,JSON.stringify(sample('initial')));while(effects.length)effects.shift()();return result},listeners};
}
test('outside-save flushes latest content, serializes in-flight edits, then marks saved',async()=>{
 const calls=[],releases=[];const h=hookHarness(async(url,options)=>{calls.push(JSON.parse(options.body));await new Promise(r=>releases.push(r));return{ok:true,json:async()=>({revision:calls.length})}});
 let view=h.render(sample('first'));const saving=view.save();assert.equal(calls.length,1);h.render(sample('second'));releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);assert.equal(calls[1].payload.versions[1][0].content,'second');assert.equal(calls[1].revision,1);releases.shift()();await saving;view=h.render(sample('second'));assert.equal(view.status,'saved');let prevented=false;h.listeners.beforeunload({preventDefault(){prevented=true}});assert.equal(prevented,false);
});
test('conflicting save retains edits, displays failure, and warns before leaving',async()=>{
 const h=hookHarness(async()=>({ok:false,json:async()=>({error:'另一頁已修改'})}));let v=h.render(sample('未儲存修改'));await v.save();v=h.render(sample('未儲存修改'));assert.equal(v.status,'failed');assert.equal(v.problem,'另一頁已修改');let prevented=false;h.listeners.beforeunload({preventDefault(){prevented=true}});assert.equal(prevented,true);
});
test('editor finishes outside, but clicking a suspected issue keeps editing',()=>{
 let done=0;const listeners={};class Element{constructor(kind){this.kind=kind}closest(){return this.kind==='issue'}};
 const {default:Editor}=load('app/staff/ConsultationIssueEditor.tsx',{react:{...React,useRef:x=>({current:x}),useEffect:fn=>fn(),useMemo:fn=>fn()},'@/lib/consultation-polish':{consultationIssueRanges:()=>[]}},{React,Element,document:{addEventListener:(n,fn)=>listeners[n]=fn,removeEventListener(){}}});
 const markup=renderToStaticMarkup(React.createElement(Editor,{value:'文字',issues:[],onChange(){},onDone(){done++}}));assert.doesNotMatch(markup,/完成編輯/);listeners.pointerdown({target:new Element('issue')});assert.equal(done,0);listeners.pointerdown({target:new Element('outside')});assert.equal(done,1);
});
test('schedule status distinguishes pending from actual sent time in Taiwan',()=>{
 const {default:Status}=load('app/staff/ReturnScheduleStatus.tsx',{'@/lib/taipei-time':time},{React});
 const html=renderToStaticMarkup(React.createElement(Status,{schedules:[{id:'1',status:'pending',scheduled_for:'2026-10-06T06:30:00Z'},{id:'2',status:'sent',scheduled_for:'2026-10-06T06:30:00Z',sent_at:'2026-10-06T06:31:00Z'}]}));assert.match(html,/等待發送/);assert.match(html,/2026-10-06 14:30/);assert.match(html,/實際送出：<!-- -->2026-10-06 14:31|實際送出：2026-10-06 14:31/);
});
test('draft API requires login, validates document ownership, and reports revision conflicts',async()=>{
 let admin=false,documentId='D',rpcCalls=0,conflict=false;const route=load('app/api/staff/consultation-return/draft/route.ts',{
  'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}},'next/headers':{cookies:async()=>({get:()=>({value:'session'})})},'@/lib/admin-session':{isAdminSession:()=>admin},'@/lib/consultation-return-draft':load('lib/consultation-return-draft.ts'),
  '@/lib/consultation-return-delivery':{bookingForConsultationReturn:async()=>({detail:{google_document_id:documentId}})},'@/lib/supabase':{adminSupabase:()=>({rpc:async()=>{rpcCalls++;return{data:conflict?[]:[{revision:1,updated_at:'now'}]}}})}
 });
 const request={json:async()=>({bookingNo:'B',documentId:'D',revision:0,payload:sample('content')})};assert.equal((await route.PUT(request)).status,401);admin=true;documentId='OTHER';assert.equal((await route.PUT(request)).status,400);assert.equal(rpcCalls,0);documentId='D';conflict=true;assert.equal((await route.PUT(request)).status,409);conflict=false;assert.equal((await route.PUT(request)).body.revision,1);
});
test('AI request uses lower effort without changing model or bypassing structural validation',async()=>{
 let sent;const response={segments:[{id:1,content:'潤飾文字'}],changeSummary:[],suspectedIssues:[]};
 const route=load('app/api/staff/consultation-return/polish/route.ts',{
  'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}},'next/headers':{cookies:async()=>({get:()=>({value:'session'})})},'@/lib/admin-session':{isAdminSession:()=>true},'@/lib/consultation-polish':{planConsultationPolish:()=>({segments:[{id:1,content:'原文'}],removedEmptyAges:[]}),mergeConsultationPolish:()=> '潤飾文字'},'@/lib/consultation-text':{normalizeConsultationText:x=>x,consultationStructure:()=>['固定標題']}
 },{process:{env:{OPENAI_API_KEY:'fake-test-only'}},fetch:async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]})}}});
 const result=await route.POST({json:async()=>({content:'原文'})});assert.equal(result.status,200);assert.equal(sent.model,'gpt-5-mini');assert.equal(sent.reasoning.effort,'low');assert.equal(result.body.polished,'潤飾文字');assert.ok(result.body.elapsedMs>=0);
});
