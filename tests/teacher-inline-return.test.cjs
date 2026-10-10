const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('lib/google-consultation-docs.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'').replace('async function accessToken(','async function unusedAccessToken(').replace('async function google(','async function unusedGoogle(');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const blue={foregroundColor:{color:{rgbColor:{red:26/255,green:89/255,blue:204/255}}}};
const label={bold:true,foregroundColor:{color:{rgbColor:{red:107/255,green:59/255,blue:36/255}}}};
function context(lines=[]){const document={body:{content:lines.map(runs=>({paragraph:{elements:runs.map(([content,textStyle={}])=>({textRun:{content,textStyle}}))}}))}};const c=vm.createContext({console,process:{env:{}},Buffer,accessToken:async()=>'mock',google:async()=>document});vm.runInContext(compiled,c);return c;}
test('named result heading is accepted, but title above personal details is not',()=>{
 const c=context();assert.equal(c.returnHeadingOffset('歐新匯【外靈干擾】\n姓名：歐新匯\n居住地址：保密'),-1);
 assert.equal(c.returnHeadingOffset('歐新匯【外靈干擾】\n回答內容'),0);
});
test('inline and next-line blue teacher replies are returned without profile data or duplicate heading',async()=>{
 const c=context([
 [['項目 1（共 1 個項目）\n歐新匯【外靈干擾】\n']],
 [['姓名：歐新匯\n居住地址：保密地址\n']],
 [['請簡述被干擾的情況\n',label]],
 [['用戶原本的敘述'],[' 阿嫂同一行回答\n',blue]],
 [['阿嫂下一行回答\n',blue]],
 [['這樣的情況多久了？\n',label]],[['5年以上\n']],
 [['歐新匯【外靈干擾】\n']], [['《干擾狀況》\n']], [['結論\n',blue]]
 ]);
 const [item]=await c.getConsultationReturnPreview('mock');
 assert.equal(item.parseWarning,undefined);assert.match(item.content,/A1:阿嫂同一行回答\n阿嫂下一行回答/);
 assert.match(item.content,/Q1:用戶原本的敘述/);assert.match(item.content,/結論/);
 assert.doesNotMatch(item.content,/保密地址|Q1:請簡述被干擾的情況|5年以上/);
 assert.equal(item.content.split('歐新匯【外靈干擾】').length-1,1);
});
test('field answer has blue trailing space and next-line insertion ranges',()=>{
 const c=context();const page=c.documentBody({detail:{item_title:'外靈干擾',booking_items:{code:'spiritual-interference'},booking_consultation_answers:{consultation_profiles:{id:'p',name:'歐新匯'},questions:[],extra_data:{interference_situation:'用戶輸入'}}}},1,1,'歐新匯');
 const fields=page.marks.filter(m=>m.kind==='fieldAnswer');assert.ok(fields.length);
 for(const field of fields){const teacher=page.marks.find(m=>m.kind==='teacher'&&m.start===field.end);assert.ok(teacher);assert.equal(page.content.slice(teacher.start-1,teacher.end-1),'\u00a0\n\u00a0\n');}
});
test('notebook extracts only red text before the first item, preserving document link',()=>{
 const c=context(),red={foregroundColor:{color:{rgbColor:{red:1}}}};
 const p=(content,textStyle)=>({paragraph:{elements:[{textRun:{content,textStyle}}]}});
 const doc={body:{content:[p('歐新匯【前世因果】\n',red),p('https://docs.google.com/document/d/example/edit\n',red),p('不應帶入的內容\n',{}),p('項目 1（共 1 個項目）\n',{}),p('回答中的紅色文字\n',red)]}};
 assert.equal(c.consultationNotebookText(doc),'歐新匯【前世因果】\nhttps://docs.google.com/document/d/example/edit');
 assert.throws(()=>c.consultationNotebookText({body:{content:[p('沒有紅字',{})]}}),/沒有找到/);
});
