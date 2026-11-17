const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes:s}=require('node:module');
const code=s(fs.readFileSync('lib/google-consultation-docs.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'').replace('async function accessToken(','async function unusedAccessToken(').replace('async function google(','async function unusedGoogle(');
const red={foregroundColor:{color:{rgbColor:{red:1}}}};
function document(rows){let index=1;return {revisionId:'rev1',body:{content:rows.map(([text,style={}])=>{const startIndex=index;index+=text.length;return {startIndex,endIndex:index,paragraph:{elements:[{startIndex,endIndex:index,textRun:{content:text,textStyle:style}}]}}})}}}
function fixture(){return document([['甲【陽宅】\n',red],['乙【過世親人】\n',red],['https://docs.google.com/document/d/D/edit\n',red],['✦ 快速回覆｜回傳結果\n'],...['甲【陽宅】','甲【嬰靈】','甲&丁【合盤】','乙【過世親人】','丙【過世親人】'].flatMap((label,i)=>[[`項目 ${i+1}（共 5 個項目）\n`],[`姓名：私人資料${i}\n`],[label+'\n'],[`回答${i}\n`]])]);}
function apply(doc,requests){let chars=doc.body.content.flatMap(p=>p.paragraph.elements.flatMap(e=>e.textRun.content.split('').map(char=>({char,style:e.textRun.textStyle}))));for(const r of requests){if(r.deleteContentRange){const a=r.deleteContentRange.range;chars.splice(a.startIndex-1,a.endIndex-a.startIndex)}if(r.insertText)chars.splice(r.insertText.location.index-1,0,...r.insertText.text.split('').map(char=>({char,style:{}})));if(r.updateTextStyle){const {range,textStyle}=r.updateTextStyle;for(let i=range.startIndex-1;i<range.endIndex-1;i++){const fields=r.updateTextStyle.fields.split(',');const linkDefaults=fields.includes('link')&&textStyle.link?{...(fields.includes('foregroundColor')?{}:{foregroundColor:{color:{rgbColor:{blue:1}}}}),...(fields.includes('underline')?{}:{underline:true})}:{};chars[i].style={...chars[i].style,...linkDefaults,...textStyle};}}}
 let pos=1,elements=[],blocks=[];for(const c of chars){elements.push({startIndex:pos,endIndex:++pos,textRun:{content:c.char,textStyle:c.style}});if(c.char==='\n'){blocks.push({startIndex:elements[0].startIndex,endIndex:pos,paragraph:{elements}});elements=[];}}if(elements.length)blocks.push({startIndex:elements[0].startIndex,endIndex:pos,paragraph:{elements}});return {revisionId:'rev2',body:{content:blocks}};}
function harness(doc=fixture(),fail=false){const calls=[];const c=vm.createContext({process:{env:{}},Buffer,accessToken:async()=>'fake',fetch:()=>assert.fail('network forbidden'),google:async(url,token,init)=>{calls.push({url,init});if(init){const body=JSON.parse(init.body);assert.equal(body.writeControl.requiredRevisionId,doc.revisionId);if(fail)throw Error('revision conflict');doc=apply(doc,body.requests);return {}}return doc;}});vm.runInContext(code,c);return {c,calls,doc:()=>doc};}
test('clear link by field mask, never by an invalid empty Link object',()=>{const {c}=harness();const plan=c.consultationNotebookUpdate(fixture(),'D');const styles=plan.requests.filter(r=>r.updateTextStyle).map(r=>r.updateTextStyle);const clear=styles.find(s=>s.fields.split(',').includes('link')&&!Object.hasOwn(s.textStyle,'link'));assert.ok(clear,'clearing must omit link from textStyle');for(const s of styles)if(Object.hasOwn(s.textStyle,'link'))assert.ok(s.textStyle.link.url||s.textStyle.link.bookmarkId||s.textStyle.link.headingId,'Google Link must specify a type');assert.ok(styles.some(s=>s.textStyle.link?.url==='https://docs.google.com/document/d/D/edit'));});
test('all five numbered items replace an incomplete red cache',()=>{const {c}=harness(),doc=fixture(),plan=c.consultationNotebookUpdate(doc,'D');assert.equal(plan.text.split('\n').length,6);assert.match(plan.text,/甲【嬰靈】/);assert.match(plan.text,/甲&丁【合盤】/);const updated=apply(doc,plan.requests);assert.equal(c.consultationNotebookText(updated),plan.text);assert.equal(c.consultationNotebookUpdate(updated,'D').requests.length,0);assert.equal(c.documentPlainText(updated).slice(c.documentPlainText(updated).indexOf('✦')),c.documentPlainText(doc).slice(c.documentPlainText(doc).indexOf('✦')));});
test('read-only preparation has no writes and works with no red cache',async()=>{const h=harness(document(fixture().body.content.slice(3).map(p=>[p.paragraph.elements[0].textRun.content])));assert.equal((await h.c.getConsultationNotebookText('D')).split('\n').length,6);assert.equal(h.calls.length,1);assert.equal(h.calls[0].init,undefined);});
test('refresh is one atomic batch using revision and is verified by readback',async()=>{const h=harness();const text=await h.c.refreshConsultationNotebook('D');assert.equal(h.calls.length,3);assert.equal(h.calls.filter(x=>x.init).length,1);assert.equal(h.c.consultationNotebookText(h.doc()),text);});
test('revision conflict stops before reporting success',async()=>{const h=harness(fixture(),true);await assert.rejects(()=>h.c.refreshConsultationNotebook('D'),/revision conflict/);assert.equal(h.calls.length,2);});
test('missing or ambiguous heading and wrong item count cannot write',()=>{for(const row of [['項目 1（共 2 個項目）\n甲【陽宅】\n'],['項目 1（共 1 個項目）\n沒有標題\n'],['項目 1（共 1 個項目）\n甲【陽宅】\n乙【陽宅】\n']]){const h=harness(document([row]));assert.throws(()=>h.c.consultationNotebookUpdate(document([row]),'D'),/未更新記事本/);assert.equal(h.calls.length,0);}});
test('manual red notes are preserved, not mistaken for an item or deleted',()=>{const {c}=harness(),doc=fixture();doc.body.content.unshift({startIndex:1,endIndex:1,paragraph:{elements:[{textRun:{content:'請注意人工備註\n',textStyle:red}}]}});const plan=c.consultationNotebookUpdate(doc,'D');assert.equal(plan.requests.filter(x=>x.deleteContentRange).length,3);});
test('missing revision or unsafe table cannot write',()=>{const {c}=harness(),doc=fixture();delete doc.revisionId;assert.throws(()=>c.consultationNotebookUpdate(doc,'D'),/文件版本/);const other=fixture();other.body.content.unshift({table:{}});assert.throws(()=>c.consultationNotebookUpdate(other,'D'),/表格/);});
test('post-update verification rejects wrong or incomplete readback',async()=>{const h=harness();h.c.google=async(url,token,init)=>init?{}:fixture();await assert.rejects(()=>h.c.refreshConsultationNotebook('D'),/核對未通過/);});
test('multiple red entries in one paragraph are replaced together',()=>{const {c}=harness();const old=fixture();const text=old.body.content.slice(0,3).map(p=>p.paragraph.elements[0].textRun.content).join('');const rows=[[text,red],...old.body.content.slice(3).map(p=>[p.paragraph.elements[0].textRun.content])];const doc=document(rows),plan=c.consultationNotebookUpdate(doc,'D');assert.equal(plan.requests.filter(x=>x.deleteContentRange).length,1);assert.equal(c.consultationNotebookText(apply(doc,plan.requests)),plan.text);});
test('mixed red manual notes stop before any update rather than deleting notes',()=>{const {c}=harness(),doc=fixture();doc.body.content[0].paragraph.elements[0].textRun.content+='人工備註\n';assert.throws(()=>c.consultationNotebookUpdate(doc,'D'),/人工備註/);});
test('API requires login and validates ownership before read or refresh',async()=>{let authorized=false,calls=0;const c=vm.createContext({cookies:async()=>({get:()=>({value:'session'})}),isAdminSession:()=>authorized,NextResponse:{json:(body,o)=>({body,status:o?.status||200})},bookingForConsultationReturn:async()=>({booking:{booking_no:'B'},detail:{google_document_id:'OTHER'},customer:{}}),getConsultationNotebookText:()=>calls++,refreshConsultationNotebook:()=>calls++});vm.runInContext(s(fs.readFileSync('app/api/staff/consultation-notebook/route.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''),c);const request={nextUrl:{searchParams:new URLSearchParams('bookingNo=B&documentId=D')}};assert.equal((await c.POST(request)).status,401);authorized=true;assert.equal((await c.POST(request)).status,400);assert.equal(calls,0);});


test('link request preserves explicit red colour and underline style in the same request',()=>{const {c}=harness();const request=c.consultationNotebookUpdate(fixture(),'D').requests.find(r=>r.updateTextStyle?.textStyle.link)?.updateTextStyle;assert.ok(request);assert.ok(request.fields.split(',').includes('foregroundColor'));assert.ok(request.fields.split(',').includes('underline'));assert.equal(request.textStyle.foregroundColor.color.rgbColor.red,1);assert.equal(request.textStyle.underline,false);});


test('old blue self-link is replaced once, without leaving duplicate URLs',()=>{
 const {c}=harness(),doc=fixture();doc.body.content[2].paragraph.elements[0].textRun.textStyle={foregroundColor:{color:{rgbColor:{red:0.067,green:0.333,blue:0.8}}},underline:true,link:{url:'https://docs.google.com/document/d/D/edit'}};
 const plan=c.consultationNotebookUpdate(doc,'D'),updated=apply(doc,plan.requests);
 assert.equal(plan.requests.filter(r=>r.deleteContentRange).length,3);
 assert.equal((c.documentPlainText(updated).match(/https:\/\/docs.google.com\/document\/d\/D\/edit/g)||[]).length,1);
 assert.equal(c.consultationNotebookText(updated),plan.text);
 assert.equal(c.consultationNotebookUpdate(updated,'D').requests.length,0);
});
test('mixed blue link notes and unrelated blue links are never deleted',()=>{
 for(const value of ['https://docs.google.com/document/d/D/edit\n人工備註\n','https://docs.google.com/document/d/OTHER/edit\n']){
  const {c}=harness(),doc=fixture();doc.body.content[2].paragraph.elements[0].textRun.content=value;doc.body.content[2].paragraph.elements[0].textRun.textStyle={foregroundColor:{color:{rgbColor:{blue:1}}}};
  if(value.includes('人工備註'))assert.throws(()=>c.consultationNotebookUpdate(doc,'D'),/人工備註/);else{const plan=c.consultationNotebookUpdate(doc,'D');assert.equal(plan.requests.filter(r=>r.deleteContentRange).length,2);}
 }
});

const blue={foregroundColor:{color:{rgbColor:{red:17/255,green:85/255,blue:204/255}}}};
function completeColoured(colour){const h=harness(),plan=h.c.consultationNotebookUpdate(fixture(),'D'),updated=apply(fixture(),plan.requests);for(const p of updated.body.content.slice(0,6)){for(const e of p.paragraph.elements)e.textRun.textStyle=colour;}return {h,updated,text:plan.text};}
test('complete blue list and link read successfully with no unnecessary write',async()=>{
 const {h,updated,text}=completeColoured(blue);assert.equal(h.c.consultationNotebookText(updated),text);assert.equal(h.c.consultationNotebookUpdate(updated,'D').requests.length,0);
 const flow=harness(updated);assert.equal(await flow.c.refreshConsultationNotebook('D'),text);assert.equal(flow.calls.filter(x=>x.init).length,0);
});
test('red and blue runs can alternate within the same list line',()=>{
 const {h,updated,text}=completeColoured(red);for(const p of updated.body.content.slice(0,6))p.paragraph.elements.forEach((e,i)=>{e.textRun.textStyle=i%2?blue:red;});assert.equal(h.c.consultationNotebookText(updated),text);
});
test('post-write readback may use blue hyperlink colours and still verify',async()=>{
 const flow=harness();let stored=fixture();flow.c.google=async(url,token,init)=>{if(init){stored=apply(stored,JSON.parse(init.body).requests);for(const p of stored.body.content.slice(0,6))for(const e of p.paragraph.elements)e.textRun.textStyle=blue;return {};}return stored;};
 assert.equal((await flow.c.refreshConsultationNotebook('D')).split('\n').length,6);
});
test('incomplete blue list still fails and blue body below item marker is ignored',async()=>{
 const {h,updated,text}=completeColoured(blue);updated.body.content[0].paragraph.elements.forEach(e=>{e.textRun.textStyle={};});assert.notEqual(h.c.consultationNotebookText(updated),text);
 const flow=harness();flow.c.google=async(url,token,init)=>init?{}:updated;await assert.rejects(()=>flow.c.refreshConsultationNotebook('D'),/核對未通過/);
 const full=completeColoured(blue);full.updated.body.content.at(-1).paragraph.elements.forEach(e=>{e.textRun.textStyle=blue;});assert.equal(full.h.c.consultationNotebookText(full.updated),full.text);
});
test('mixed black text is never spliced into an apparently valid coloured heading',()=>{
 const {h,updated}=completeColoured(blue);updated.body.content[0].paragraph.elements[1].textRun.textStyle={};assert.ok(!h.c.consultationNotebookText(updated).startsWith('甲【陽宅】'));
});
