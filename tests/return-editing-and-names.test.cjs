const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function plain(file){return compile(fs.readFileSync(file,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''));}
test('existing A and B pages keep their count, with only their own name in heading',()=>{
 const c=vm.createContext({console,process});vm.runInContext(plain('lib/google-consultation-docs.ts'),c);
 const a={id:'a',name:'甲姓名'},b={id:'b',name:'乙姓名'};
 const details=[{item_title:'前世因果（個人）',booking_items:{code:'past-life-personal'},booking_consultation_answers:{profile_id:'a',consultation_profiles:a,questions:[],extra_data:{}}},{item_title:'前世因果（與他人前世關係）',booking_items:{code:'past-life-relationship'},booking_consultation_answers:{profile_id:'a',consultation_profiles:a,questions:[],extra_data:{},booking_answer_participants:[{profile_id:'b',position:1,consultation_profiles:b}]}}];
 const pages=c.expandPages(details);assert.equal(pages.length,2);
 const first=c.documentBody(pages[0],1,2,'甲姓名').content,second=c.documentBody(pages[1],2,2,'甲姓名').content;
 assert.match(first,/甲姓名【前世因果】/);assert.match(second,/乙姓名【前世因果】/);assert.doesNotMatch(second,/甲姓名&乙姓名【/);
});
test('legacy combined heading corrected from binding, without changing prose or adding pages',()=>{
 const source=fs.readFileSync('lib/consultation-return-delivery.ts','utf8');const c=vm.createContext({});vm.runInContext(compile(source.slice(source.indexOf('export function correctReturnHeadings')).replace('export ','')),c);
 const result=c.correctReturnHeadings([{index:1,itemTitle:'甲&乙【前世】',content:'甲&乙【前世】\n回答提到甲與乙。\n《綜觀今生》\n原文'}],[{headingName:'乙'}]);
 assert.equal(result.length,1);assert.equal(result[0].itemTitle,'乙【前世】');assert.equal(result[0].content,'乙【前世】\n回答提到甲與乙。\n《綜觀今生》\n原文');
 const unrelated=c.correctReturnHeadings(result,[{headingName:'丙'}]);assert.equal(unrelated[0].content,result[0].content);
});
test('main spiritual heading uses square brackets and subheading uses angle brackets',()=>{
 const c=vm.createContext({console,process});vm.runInContext(plain('lib/google-consultation-docs.ts'),c);
 const content=c.documentBody({detail:{item_title:'外靈干擾',booking_items:{code:'spiritual-interference'},booking_detail_sub_items:[{sub_item_title:'干擾狀況'}],booking_consultation_answers:{consultation_profiles:{id:'p',name:'測試'},questions:[],extra_data:{}}}},2,2,'測試').content;
 assert.match(content,/\n【外靈干擾】\n《干擾狀況》/);assert.doesNotMatch(content,/《外靈干擾》/);
});
test('editor renders both highlights and editable text and focuses selected issue',()=>{
 const effects=[],calls=[];let ref=0;
 const input={focus:()=>calls.push('focus'),setSelectionRange:(a,b)=>calls.push([a,b]),scrollIntoView:()=>{},scrollTop:0,scrollLeft:0,clientHeight:100};
 const backdrop={offsetTop:0,scrollTop:0,querySelector:()=>({offsetTop:220})};
 const mock={...React,useMemo:fn=>fn(),useRef:value=>({current:ref++===0?input:ref===2?backdrop:value}),useEffect:fn=>effects.push(fn)};
 const c=vm.createContext({React,exports:{},require:name=>name==='react'?mock:{consultationIssueRanges:()=>[{start:2,end:4,issueIndex:0}]}});
 vm.runInContext(compile(fs.readFileSync('app/staff/ConsultationIssueEditor.tsx','utf8')),c);
 const html=renderToStaticMarkup(React.createElement(c.exports.default,{value:'前文錯字後文',issues:[{originalText:'錯字',action:'kept'}],focusRequest:{index:0,nonce:1},onChange:()=>{},onDone:()=>{}}));
 assert.match(html,/<mark[^>]*>錯字<\/mark>/);assert.match(html,/<textarea[^>]*>前文錯字後文<\/textarea>/);effects.forEach(fn=>fn());assert.deepEqual(calls,['focus',[2,4]]);assert.ok(input.scrollTop>0);assert.equal(backdrop.scrollTop,input.scrollTop);
});
