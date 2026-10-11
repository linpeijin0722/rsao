const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const c=vm.createContext({exports:{},require:()=>({normalizeConsultationReturnText:s=>s.trim()})});vm.runInContext(ts.transpileModule(fs.readFileSync('lib/consultation-return-delivery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);
const verify=c.exports.assertReturnIdentity;
const fresh=[{index:1,content:'陳夢偲【前世】\n小時候被送養，成為童養媳。'},{index:2,content:'黃子芩【前世因果】\n小時候因為是女孩子，不被父母待見。'}];
test('A15 item two cannot reuse item one name and answer',()=>{assert.throws(()=>verify([{index:2,content:fresh[0].content}],fresh),/姓名或項目標籤/)});
test('correct person with revised prose is accepted',()=>{verify([{index:2,content:'黃子芩【前世因果】\n她小時候不受父母重視。',sourceContent:fresh[1].content}],fresh)});
test('scheduled source change blocks before delivery',()=>{assert.throws(()=>verify([{index:2,content:fresh[1].content,sourceContent:'黃子芩【前世因果】\n舊內容'}],fresh),/文件已更新/)});
test('duplicate bodies and absent source items are rejected',()=>{assert.throws(()=>verify([{index:1,content:fresh[0].content},{index:2,content:fresh[0].content}],[fresh[0],{index:2,content:fresh[0].content}]),/完全相同/);assert.throws(()=>verify([{index:3,content:fresh[0].content}],fresh),/對應已改變/)});
