const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function load(file,context){vm.runInContext(stripTypeScriptTypes(fs.readFileSync(file,'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''),context);}
const context=vm.createContext({console,Date,Intl,Set,process,URLSearchParams,AbortSignal});
load('lib/taipei-time.ts',context);load('lib/staff-pending.ts',context);load('lib/sync-returned-status.ts',context);
const booking=(patch={})=>({id:'b',payment_status:'paid',status:'confirmed',paid_at:'2026-10-07T15:59:00Z',consultation_methods:{code:'text'},...patch});
const pending=(b,date)=>context.pendingBookings([b],Date.parse(date));
test('text deadline is next Taiwan calendar day noon, including UTC midnight boundaries',()=>{
  const b=booking();
  assert.equal(pending(b,'2026-10-08T03:59:59Z').length,0);
  assert.equal(pending(b,'2026-10-08T04:00:00Z')[0].kind,'text');
  b.paid_at='2026-10-07T16:01:00Z';
  assert.equal(pending(b,'2026-10-08T04:00:00Z').length,0);
  assert.equal(pending(b,'2026-10-09T04:00:00Z').length,1);
});
test('video begins seven calendar dates before appointment, retains overdue missing data',()=>{
  const b=booking({consultation_methods:{code:'video'},slot_start:'2026-10-20T18:30:00+08:00'});
  assert.equal(pending(b,'2026-10-12T15:59:59Z').length,0);
  assert.equal(pending(b,'2026-10-12T16:00:00Z')[0].kind,'video');
  assert.equal(pending(b,'2026-10-21T00:00:00Z').length,1);
});
test('manual receipt removes missing-data task and becomes result task only after fourteen days',()=>{
  const b=booking({data_submission_source:'manual_line',data_submitted_at:'2026-10-08T02:30:00Z'});
  assert.equal(pending(b,'2026-10-22T02:29:59Z').length,0);
  assert.equal(pending(b,'2026-10-22T02:30:00Z')[0].kind,'result');
  for(const field of ['consultation_result_returned_at','consultation_result_detected_at'])
    assert.equal(pending({...b,[field]:'2026-10-22T00:00:00Z'},'2026-10-23T02:30:00Z').length,0);
});
test('cancelled, refunded, unpaid and unknown payment time are not outstanding tasks',()=>{
  for(const patch of [{status:'cancelled'},{status:'refunded'},{payment_status:'pending'},{paid_at:null},{paid_at:'invalid'}])
    assert.equal(pending(booking(patch),'2026-11-01T00:00:00Z').length,0);
});
function mockDb(){const writes=[];return {writes,from(){let patch;const q={update(p){patch=p;return this},eq(){return this},is(){return this},select(){return this},async maybeSingle(){writes.push(patch);return {data:patch}}};return q}}}
test('folder requires all current documents; first detection is preserved and actual delivery never overwritten',async()=>{
  const db=mockDb(),b=booking({data_submitted_at:'2026-10-01',booking_details:[{google_document_id:'d1'},{google_document_id:'d2'}]});
  await context.syncReturnedStatus(db,[b],async()=>new Set(['d1']),'2026-10-20T00:00:00Z');assert.equal(db.writes.length,0);
  await context.syncReturnedStatus(db,[b],async()=>new Set(['d1','d2']),'2026-10-21T00:00:00Z');assert.equal(db.writes.length,1);
  assert.equal(b.consultation_result_detected_at,'2026-10-21T00:00:00Z');assert.equal(b.consultation_result_returned_at,undefined);
  await context.syncReturnedStatus(db,[b],async()=>{throw Error('must not recheck')},'2026-10-22T00:00:00Z');
  assert.equal(db.writes.length,1);
  await context.syncReturnedStatus(db,[{...b,consultation_result_detected_at:null,consultation_result_returned_at:'2026-10-19T00:00:00Z'}],async()=>{throw Error('must not recheck')});
});
test('folder failures propagate; old document history and no documents cannot mark returned',async()=>{
  const db=mockDb(),b=booking({data_submitted_at:'2026-10-01',booking_details:[{google_document_id:'new'}],document_history:[{document_id:'old'}]});
  await context.syncReturnedStatus(db,[b],async()=>new Set(['old']));assert.equal(db.writes.length,0);
  await assert.rejects(()=>context.syncReturnedStatus(db,[b],async()=>{throw Error('unavailable')}),/unavailable/);
  await context.syncReturnedStatus(db,[{...b,booking_details:[]}],async()=>new Set(['old']));assert.equal(db.writes.length,0);
});
test('Drive traversal includes second page, nested documents and shortcuts, but not unrelated file types',async()=>{
  const c=vm.createContext({process:{env:{}},console,URLSearchParams,AbortSignal,Set});load('lib/google-consultation-docs.ts',c);
  c.accessToken=async()=> 'token';const requests=[];
  c.google=async(url)=>{requests.push(url);if(url.includes('/files/'))return {mimeType:'application/vnd.google-apps.folder'};
    const params=new URL(url).searchParams;
    if(params.get('pageToken'))return {files:[{id:'shortcut',shortcutDetails:{targetId:'d2',targetMimeType:'application/vnd.google-apps.document'}}]};
    if(params.get('q').includes("'nested'"))return {files:[{id:'d3',mimeType:'application/vnd.google-apps.document'}]};
    return {nextPageToken:'next',files:[{id:'d1',mimeType:'application/vnd.google-apps.document'},{id:'nested',mimeType:'application/vnd.google-apps.folder'},{id:'photo',mimeType:'image/png'}]};};
  assert.deepEqual([...await c.listReturnedConsultationDocumentIds()].sort(),['d1','d2','d3']);assert.equal(requests.length,4);
});
test('deceased relatives: old order is refreshed after split; submission refuses only one filled answer',async()=>{
  let reads=0;const calls=[];const original={id:'b',payment_status:'paid',booking_details:[{id:'d1',quantity:2}]};
  const refreshed={...original,booking_details:[{id:'d1',unit_number:1,unit_count:2},{id:'d2',unit_number:2,unit_count:2}]};
  const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:1}},from(table){const q={select(){return this},eq(){return this},in(){return Promise.resolve({data:[{booking_detail_id:'d1'}]})},async single(){if(table==='customers')return {data:{id:'c'}};return {data:reads++%2===0?original:refreshed}}};return q}};
  const c=vm.createContext({console,cookies:async()=>({get:()=>({value:'session'})}),verifyLineSession:()=> 'uid',adminSupabase:()=>db,NextResponse:{json:(body,options)=>({body,status:options?.status||200})}});
  load('app/api/booking-data/route.ts',c);
  const resolved=await c.context('ORDER');assert.equal(resolved.b.booking_details.length,2);
  assert.equal(calls[0][0],'ensure_deceased_relative_units');
  const result=await c.POST({json:async()=>({order:'ORDER',action:'submit'})});
  assert.equal(result.status,400);assert.match(result.body.error,/每一個項目/);
});
test('result UI distinguishes actual delivery time from first folder detection, and unknown from missing',()=>{
  const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const exports={};
  const c=vm.createContext({exports,Date,Intl,require:(id)=>id==='@/lib/staff-pending'?{resultReturnedAt:context.resultReturnedAt,pendingBookings:context.pendingBookings}:id==='@/lib/taipei-time'?{parseTaipeiDateTime:context.parseTaipeiDateTime}:id.endsWith('.css')?{}:require(id)});
  vm.runInContext(ts.transpileModule(fs.readFileSync('app/staff/PendingWork.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,c);
  const render=(b,warning)=>renderToStaticMarkup(React.createElement(exports.ResultReturnStatus,{booking:b,warning}));
  const actual=render({consultation_result_returned_at:'2026-10-07T10:00:00Z'});
  assert.match(actual,/系統發送時間/);assert.match(actual,/18:00/);
  assert.match(render({consultation_result_detected_at:'2026-10-07T10:00:00Z'}),/資料夾首次偵測時間/);
  assert.match(render({consultation_result_manual_at:'2026-10-07T10:00:00Z'}),/已手動回傳諮詢結果/);
  assert.match(render({consultation_result_manual_at:'2026-10-07T10:00:00Z'}),/手動註記時間/);
  assert.match(render({},'failed'),/待確認/);assert.doesNotMatch(render({},'failed'),/尚未回傳/);
  assert.match(render({}),/尚未回傳/);
});
