const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function load(file,imports={}){const exports={};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{exports,require:name=>imports[name]||require(name),console,process,Date});return exports;}
const text=load('lib/consultation-text.ts'),polish=load('lib/consultation-polish.ts',{'./consultation-text':text});
test('marriage AI template injection keeps only offending prose original, preserving safe edits',()=>{
 const source='甲&乙【感情運勢與關係合盤】\nQ1：我們會有後續的發展嗎？\nA1：說出心意。\n《感情運勢與關係合盤》\n甲本身個性\n容易想很多，停滯不前。\n對方（乙）的個性\n較內向。';
 const plan=polish.planConsultationPolish(source),ids=[];
 const result=polish.mergeConsultationPolish(plan,plan.segments.map(s=>({id:s.id,content:s.content.includes('容易')?'如果要姻緣比較順利，\n主動表達。':s.content.replace('說出心意。','說出心意，讓對方知道。')})),ids);
 assert.equal(ids.length,1);assert.ok(result.includes('容易想很多，停滯不前。'));assert.ok(result.includes('說出心意，讓對方知道。'));assert.deepEqual(text.consultationStructure(result),text.consultationStructure(source));
});
test('new Q/A markers are never merged into a prose segment',()=>{const plan=polish.planConsultationPolish('Q1：問題？\nA1：原文。'),ids=[];const result=polish.mergeConsultationPolish(plan,[{id:0,content:'Q2：擅自新增問題'}],ids);assert.equal(ids.length,1);assert.equal(result,'Q1：問題？\nA1：原文。');});
test('missing or duplicate segment IDs still fail instead of silently dropping text',()=>{const plan=polish.planConsultationPolish('Q1：問題？\nA1：回答。\n《建議》\n另一段。');assert.throws(()=>polish.mergeConsultationPolish(plan,[]));assert.throws(()=>polish.mergeConsultationPolish(plan,[{id:0,content:'回答。'},{id:0,content:'另一段。'}]));});
const docsContext=vm.createContext({console,process});vm.runInContext(compile(fs.readFileSync('lib/google-consultation-docs.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'')),docsContext);
for(const [sub,count] of [['前一世概略說明+今生個性特質',1],['前二世概略說明+今生個性特質',2],['兩世',2],['２世',2],['前三世概略說明+今生個性特質',3],['3世',3]]){
 test('generated personal past-life document: '+sub,()=>{const content=docsContext.documentBody({detail:{item_title:'前世因果（個人）',booking_items:{code:'past-life-personal'},booking_detail_sub_items:[{sub_item_title:sub}],booking_consultation_answers:{consultation_profiles:{id:'p',name:'測試'},questions:[],extra_data:{}}}},1,1,'測試').content;
 const headings=content.split('\n').map(x=>x.trim()).filter(x=>/^《(?:前+世|綜觀今生)》$/.test(x));assert.deepEqual(headings,[...Array.from({length:count},(_,i)=>'《'+'前'.repeat(count-i)+'世》'),'《綜觀今生》']);});
}
