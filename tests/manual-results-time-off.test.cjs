const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function load(file,c){vm.runInContext(stripTypeScriptTypes(fs.readFileSync(file,'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''),c);}
const c=vm.createContext({console,Date,Intl});load('lib/taipei-time.ts',c);load('lib/video-time-off.ts',c);load('lib/staff-pending.ts',c);
const off={id:'one',off_date:'2026-10-18',start_time:'13:00:00',end_time:'15:00:00',note:null};
test('13–15 holiday blocks 12–16; full consultation interval is checked, endpoints can touch',()=>{
  const w=c.timeOffWindow(off);assert.equal(new Date(w.start).toISOString(),'2026-10-18T04:00:00.000Z');assert.equal(new Date(w.end).toISOString(),'2026-10-18T08:00:00.000Z');
  const overlaps=(start,end)=>c.overlapsTimeOff(Date.parse(`2026-10-18T${start}:00+08:00`),Date.parse(`2026-10-18T${end}:00+08:00`),off);
  assert.equal(overlaps('11:10','12:00'),false);assert.equal(overlaps('11:20','12:10'),true);
  assert.equal(overlaps('12:00','12:50'),true);assert.equal(overlaps('15:50','16:40'),true);assert.equal(overlaps('16:00','16:50'),false);
});
test('Taiwan buffer correctly crosses to previous and next dates',()=>{
  const early=c.timeOffWindow({...off,start_time:'00:30',end_time:'01:00'});
  assert.equal(early.start,Date.parse('2026-10-17T23:30:00+08:00'));
  const late=c.timeOffWindow({...off,start_time:'22:30',end_time:'23:45'});
  assert.equal(late.end,Date.parse('2026-10-19T00:45:00+08:00'));
});
test('dates and times reject invalid values, backwards intervals and past Taiwan dates',()=>{
  const now=new Date('2026-10-17T16:00:00Z');
  assert.equal(c.validateTimeOff('2026-10-18','13:00','15:00',now),'');
  for(const args of [['2026-10-17','13:00','15:00'],['2026-02-30','13:00','15:00'],['2026-10-18','13:00','13:00'],['2026-10-18','15:00','13:00'],['2026-10-18','25:00','26:00']])assert.ok(c.validateTimeOff(...args,now));
});
test('only the two staff name pairs are hidden; ordinary customers and same first names remain',()=>{
  const base={id:'b',payment_status:'paid',status:'confirmed',consultation_methods:{code:'text'},paid_at:'2026-10-01T00:00:00Z'};
  for(const [full_name,line_display_name] of [['林珮均','Peggy'],['林啟恩','Nnn']])assert.equal(c.pendingBookings([{...base,customers:{full_name,line_display_name}}],Date.parse('2026-10-20')).length,0);
  for(const [full_name,line_display_name] of [['其他人','Peggy'],['其他人','Nnn'],['林珮均','另一位']])assert.equal(c.pendingBookings([{...base,customers:{full_name,line_display_name}}],Date.parse('2026-10-20')).length,1);
  assert.equal(c.pendingBookings([{...base,consultation_result_manual_at:'2026-10-10'}],Date.parse('2026-10-20')).length,0);
});
test('manual result action is authorized, conditional, timestamped and idempotent',async()=>{
  let authorized=true,stored,existing=false;const filters=[];
  const q={update(value){stored=value;return this},eq(k,v){filters.push([k,v]);return this},not(k,op,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},select(){return this},async maybeSingle(){return {data:existing?null:{id:'b'}}}};
  const cx=vm.createContext({console,cookies:async()=>({get:()=>({value:'x'})}),isAdminSession:()=>authorized,adminSupabase:()=>({from:()=>q}),NextResponse:{json:(body,init)=>({body,status:init?.status||200})}});load('app/api/staff/bookings/route.ts',cx);
  const request={json:async()=>({action:'mark_manual_result',bookingNo:'B1'})};
  assert.equal((await cx.POST(request)).status,200);assert.ok(Date.parse(stored.consultation_result_manual_at));assert.equal(stored.consultation_result_returned_at,undefined);
  assert.ok(filters.some(([k,v])=>k==='payment_status'&&v==='paid'));assert.ok(filters.some(([k,v])=>k==='status'&&v.includes('cancelled')));assert.ok(filters.some(([k,v])=>k==='consultation_result_manual_at'&&v===null));
  existing=true;assert.equal((await cx.POST(request)).status,409);
  authorized=false;stored=null;assert.equal((await cx.POST(request)).status,401);assert.equal(stored,null);
});
test('admin cannot reopen blocked slot; closing is allowed, RPC failure does not open anything',async()=>{
  let blocked=true,rpcError=null,writes=0,checks=0;
  const cx=vm.createContext({console,cookies:async()=>({get:()=>({value:'x'})}),isAdminSession:()=>true,parseTaipeiDateTime:value=>new Date(value),adminSupabase:()=>({rpc:async()=>{checks++;return {data:blocked,error:rpcError}},from:()=>({upsert:async()=>{writes++;return {}}})}),NextResponse:{json:(body,init)=>({body,status:init?.status||200})}});load('app/api/admin/slots/route.ts',cx);
  const request=(isOpen)=>({json:async()=>({methodId:'video',slotStart:'2026-10-18T13:00:00+08:00',isOpen})});
  assert.equal((await cx.POST(request(true))).status,409);assert.equal(writes,0);
  assert.equal((await cx.POST(request(false))).status,200);assert.equal(checks,1);
  blocked=false;assert.equal((await cx.POST(request(true))).status,200);
  rpcError={message:'missing function'};assert.equal((await cx.POST(request(true))).status,500);assert.equal(writes,2);
});
test('time off update targets one ID and validates before writes; deleting requires admin',async()=>{
  let authorized=true,writes=[],ids=[];
  const q={insert(value){writes.push(value);return this},update(value){writes.push(value);return this},delete(){writes.push('delete');return this},eq(k,v){ids.push(v);return this},select(){return this},async maybeSingle(){return {data:{id:'x'}}},then(resolve){resolve({})}};
  const cx=vm.createContext({console,cookies:async()=>({get:()=>({value:'x'})}),isAdminSession:()=>authorized,validateTimeOff:(...args)=>c.validateTimeOff(...args.slice(0,3),new Date('2026-10-07')),adminSupabase:()=>({from:()=>q}),NextResponse:{json:(body,init)=>({body,status:init?.status||200})}});load('app/api/admin/time-off/route.ts',cx);
  const id='00000000-0000-4000-a000-000000000001',valid={id,date:'2026-10-18',start:'13:00',end:'15:00'};
  assert.equal((await cx.POST({json:async()=>({...valid,end:'12:00'})})).status,400);assert.equal(writes.length,0);
  assert.equal((await cx.POST({json:async()=>valid})).status,200);assert.equal(ids[0],id);assert.equal(writes[0].start_time,'13:00');
  authorized=false;assert.equal((await cx.DELETE({nextUrl:new URL('https://example.test/?id='+id)})).status,401);assert.equal(writes.length,1);
  authorized=true;assert.equal((await cx.DELETE({nextUrl:new URL('https://example.test/?id='+id)})).status,200);assert.equal(writes[1],'delete');assert.equal(ids[1],id);
});
