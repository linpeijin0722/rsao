const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
test('legacy repeated authoritative name is collapsed only in headings and remains idempotent',()=>{
 const source=fs.readFileSync('lib/consultation-return-delivery.ts','utf8'),c=vm.createContext({});
 vm.runInContext(compile(source.slice(source.indexOf('export function correctReturnHeadings')).replace('export ','')),c);
 const items=[{index:1,itemTitle:'歐新匯歐新匯【前世因果】',content:'歐新匯歐新匯【前世因果】\n《前世》\n歐新匯歐新匯是原文。'}],bindings=[{headingName:'歐新匯'}];
 const result=c.correctReturnHeadings(items,bindings);
 assert.equal(result[0].itemTitle,'歐新匯【前世因果】');
 assert.equal(result[0].content,'歐新匯【前世因果】\n《前世》\n歐新匯歐新匯是原文。');
 assert.deepEqual(c.correctReturnHeadings(result,bindings),result);
 assert.equal(c.correctReturnHeadings(items,[{headingName:'新匯'}])[0].itemTitle,items[0].itemTitle);
});
test('template input placeholder and newline are blue 9pt regular while section stays bold',()=>{
 const source=fs.readFileSync('google-apps-script/Code.gs','utf8');
 const block=source.slice(source.indexOf('    (payload.marks || []).forEach'),source.indexOf('    (payload.images || []).forEach'));
 const styles=Array.from({length:8},()=>({}));
 const editor={};for(const [method,key] of [['setBold','bold'],['setFontSize','size'],['setForegroundColor','color']])editor[method]=(start,end,value)=>{for(let i=start;i<=end;i++)styles[i][key]=value;return editor};
 vm.runInNewContext(block,{editor,contentLength:8,lastContentIndex:7,payload:{marks:[{start:1,end:5,kind:'section'},{start:6,end:7,kind:'teacher'}]}});
 assert.equal(styles[0].bold,true);
 for(const i of [5,6])assert.deepEqual(styles[i],{bold:false,size:9,color:'#1a59cc'});
});
