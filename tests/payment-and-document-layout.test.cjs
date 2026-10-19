const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function load(file){const c=vm.createContext({console,process});vm.runInContext(compile(fs.readFileSync(file,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'')),c);return c;}
const docs=load('lib/google-consultation-docs.ts'),auth=load('lib/payment-auth.ts');
test('payment expired session is authenticated and original request retried once',async()=>{
 const calls=[],responses=[{status:401},{ok:true},{status:200}];
 const result=await auth.paymentFetch('/api/bank-transfer?bookingNo=ORDER',undefined,{fetch:async(...args)=>{calls.push(args);return responses.shift()},init:async()=>{},loggedIn:()=>true,token:()=>'test-token',login:()=>assert.fail()});
 assert.equal(result.status,200);assert.equal(calls[0][0],calls[2][0]);assert.equal(calls[1][0],'/api/line/auth');
});
test('payment errors other than 401 are never automatically retried',async()=>{
 let calls=0;for(const status of [200,400,403,500]){const result=await auth.paymentFetch('/api/newebpay',{method:'POST'},{fetch:async()=>{calls++;return {status}},init:()=>assert.fail()});assert.equal(result.status,status)}assert.equal(calls,4);
});
test('logged-out payment redirects without resubmitting payment',async()=>{
 let login=0,calls=0;await assert.rejects(()=>auth.paymentFetch('/api/newebpay',{method:'POST'},{fetch:async()=>{calls++;return {status:401}},init:async()=>{},loggedIn:()=>false,token:()=>null,login:()=>login++}),/登入/);assert.equal(login,1);assert.equal(calls,1);
});
test('relation has owner plus one page per target; only own profile and target questions',()=>{
 const primary={id:'a',name:'諮詢者甲'},targets=[{id:'b',name:'對象乙'},{id:'c',name:'對象丙'}];
 const detail={item_title:'前世因果（與他人前世關係）',booking_items:{code:'past-life-relationship'},booking_detail_sub_items:[{sub_item_title:'與兩位對象的前世關係'}],booking_consultation_answers:{profile_id:'a',consultation_profiles:primary,questions:['直接問題'],extra_data:{target_questions:{b:['與乙的問題'],c:['與丙的問題']}},booking_answer_participants:targets.map((p,i)=>({position:i+1,profile_id:p.id,consultation_profiles:p}))}};
 const pages=docs.expandPages([detail]);assert.equal(pages.length,3);
 const contents=pages.map((p,i)=>docs.documentBody(p,i+1,3,'諮詢者甲'));
 for(let i=0;i<3;i++){const name=[primary,...targets][i].name;assert.match(contents[i].content,new RegExp('姓名：'+name));assert.equal((contents[i].content.match(/姓名：/g)||[]).length,1);assert.match(contents[i].content,/前世因果（與他人前世關係） 與兩位對象的前世關係/);}
 assert.doesNotMatch(contents[0].content,/Q1:/);assert.match(contents[1].content,/Q1:與乙的問題/);assert.match(contents[2].content,/Q1:與丙的問題/);
 for(const p of contents)for(const mark of p.marks.filter(m=>m.kind==='section')){const teacher=p.marks.find(m=>m.kind==='teacher'&&m.start===mark.end);assert.ok(teacher);assert.equal(p.content.slice(teacher.start-1,teacher.end-1),'\u00a0\n\u00a0\n');}
});
test('personal and deceased main titles stay separate from named answer labels',()=>{
 for(const [code,title,name,sub] of [['past-life-personal','前世因果（個人）','潘佩岑','前一世概略說明+今生個性特質'],['deceased-relative','過世親人','潘丙','']]){
 const page=docs.documentBody({detail:{item_title:title,booking_items:{code},booking_detail_sub_items:sub?[{sub_item_title:sub}]:[],booking_consultation_answers:{consultation_profiles:{id:'x',name},questions:[],extra_data:{}}}},1,1,name);
 const heading=page.marks.find(m=>m.kind==='title');assert.equal(page.content.slice(heading.start-1,heading.end-1),[title,sub].filter(Boolean).join(' '));
 const label=name+'【'+(code.startsWith('past-life')?'前世因果':title)+'】';assert.equal(page.content.split(label).length-1,1);assert.ok(page.marks.some(m=>m.kind==='section'&&page.content.slice(m.start-1,m.end-1)===label));
 if(sub)assert.ok(page.content.indexOf(label)<page.content.indexOf('《前世》'));
 }
});
test('new and legacy relation page counts bind to the correct target without shifting later items',async()=>{
 const details=[{id:'relation',booking_items:{code:'past-life-relationship'},booking_consultation_answers:{profile_id:'owner',consultation_profiles:{name:'諮詢者'},booking_answer_participants:[{position:1,profile_id:'target',consultation_profiles:{name:'對象'}}]}},{id:'health',booking_items:{code:'health'},booking_consultation_answers:{profile_id:'owner',consultation_profiles:{name:'諮詢者'}}}];
 const chain={select(){return this},eq(){return this},order:async()=>({data:details})};
 const c=vm.createContext({exports:{},require:()=>({adminSupabase:()=>({from:()=>chain})})});
 vm.runInContext(compile(fs.readFileSync('lib/consultation-return-delivery.ts','utf8')),c);
 const modern=await c.exports.returnItemBindings('booking',3),legacy=await c.exports.returnItemBindings('booking',2);
 assert.deepEqual(Array.from(modern,x=>[x.bookingDetailId,x.targetProfileId]),[['relation',null],['relation','target'],['health',null]]);
 assert.deepEqual(Array.from(legacy,x=>[x.bookingDetailId,x.targetProfileId]),[['relation','target'],['health',null]]);
});
