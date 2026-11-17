const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const c=vm.createContext({exports:{},require:()=>({normalizeConsultationReturnText:s=>s.trim()})});vm.runInContext(ts.transpileModule(fs.readFileSync('lib/consultation-return-delivery.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,c);
const verify=c.exports.assertReturnIdentity;
const fresh=[{index:1,content:'陳夢偲【前世】\n小時候被送養，成為童養媳。'},{index:2,content:'黃子芩【前世因果】\n小時候因為是女孩子，不被父母待見。'}];
test('A15 item two cannot reuse item one name and answer',()=>{assert.throws(()=>verify([{index:2,content:fresh[0].content}],fresh),/姓名或項目標籤/)});
test('correct person with revised prose is accepted',()=>{verify([{index:2,content:'黃子芩【前世因果】\n她小時候不受父母重視。',sourceContent:fresh[1].content}],fresh)});
test('scheduled source change blocks before delivery',()=>{assert.throws(()=>verify([{index:2,content:fresh[1].content,sourceContent:'黃子芩【前世因果】\n舊內容'}],fresh),/文件已更新/)});
test('duplicate bodies and absent source items are rejected',()=>{assert.throws(()=>verify([{index:1,content:fresh[0].content},{index:2,content:fresh[0].content}],[fresh[0],{index:2,content:fresh[0].content}]),/完全相同/);assert.throws(()=>verify([{index:3,content:fresh[0].content}],fresh),/對應已改變/)});


test('standalone item labels accepted by the document reader can be returned',()=>{
 const source=[{index:1,content:'【過世親人】\n阿嫂回覆內容。'}];
 verify([{index:1,content:'【過世親人】\n潤稿後的回覆內容。',sourceContent:source[0].content}],source);
 assert.throws(()=>verify([{index:1,content:'【前世因果】\n內容'}],source),/姓名或項目標籤/);
});
test('invisible characters and heading edge spaces do not change identity',()=>{
 verify([{index:1,content:'\ufeff陳夢偲　【 前世 】\u200b\r\n新的回答。'}],[fresh[0]]);
});
test('inline bracketed answer prose is not a person or item heading',()=>{
 verify([{index:1,content:'陳夢偲【前世】\n她在家裡【幫忙】並照顧孩子。'}],[{index:1,content:'陳夢偲【前世】\n她在家裡【工作】並照顧孩子。'}]);
});
test('legacy angle labels remain distinguishable and empty heading sources stay blocked',()=>{
 verify([{index:1,content:'《過世親人》\n潤稿回答'}],[{index:1,content:'《過世親人》\n原始回答'}]);
 assert.throws(()=>verify([{index:1,content:'《前世》\n回答'}],[{index:1,content:'《過世親人》\n回答'}]),/姓名或項目標籤/);
 assert.throws(()=>verify([{index:1,content:'沒有標題'}],[{index:1,content:'沒有標題'}]),/姓名或項目標籤/);
});
test('names cannot be removed, replaced, or added even when item label matches',()=>{
 for(const content of ['【前世】\n內容','另一位【前世】\n內容'])assert.throws(()=>verify([{index:1,content}],fresh),/姓名或項目標籤/);
 assert.throws(()=>verify([{index:1,content:'另一位【過世親人】\n內容'}],[{index:1,content:'【過世親人】\n內容'}]),/姓名或項目標籤/);
});
test('standalone labels still reject changed scheduled sources',()=>{
 assert.throws(()=>verify([{index:1,content:'【過世親人】\n內容',sourceContent:'【過世親人】\n舊內容'}],[{index:1,content:'【過世親人】\n新內容'}]),/文件已更新/);
});
const makeFlow=(content)=>{
 let pushes=0;
 const booking={id:'test-booking',booking_no:'TEST',customers:{line_user_id:'MOCK-ONLY'},consultation_methods:{code:'text'},booking_details:[{google_document_id:'TEST-DOC'}]};
 const db={from:table=>({select(){return this},eq(){return this},single:async()=>({data:booking}),order:async()=>({data:[]})})};
 const imports={'@/lib/supabase':{adminSupabase:()=>db},'@/lib/google-consultation-docs':{normalizeConsultationReturnText:s=>s.trim(),getConsultationReturnPreview:async()=>[{index:1,itemTitle:'測試項目',content}]},'@/lib/line-message':{pushLineText:async()=>{pushes++;throw Error('MOCK_DELIVERY_REACHED_NO_NETWORK')},pushConsultationResultCarousel:async()=>{throw Error('Unexpected carousel')}}};
 const context=vm.createContext({exports:{},require:name=>{if(!imports[name])throw Error('Unexpected import '+name);return imports[name]},console});
 vm.runInContext(ts.transpileModule(fs.readFileSync('lib/consultation-return-delivery.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:context.exports,pushes:()=>pushes};
};
test('prepare and scheduled revalidation accept label-only source without real delivery',async()=>{
 const content='【過世親人】\n原始內容',flow=makeFlow(content);
 const prepared=await flow.api.prepareConsultationReturn({bookingNo:'TEST',documentId:'TEST-DOC',selectedIndexes:[1],editedItems:{1:'【過世親人】\n確認後內容'},skipCarousel:true,sourceItems:[{index:1,content}]});
 assert.equal(flow.pushes(),0);
 await assert.rejects(flow.api.deliverPreparedConsultationReturn(prepared,'https://mock.invalid'),/MOCK_DELIVERY_REACHED_NO_NETWORK/);
 assert.equal(flow.pushes(),1);
});
test('wrong person is rejected before the first mocked LINE call',async()=>{
 const flow=makeFlow('甲姓名【前世】\n原始內容');
 await assert.rejects(flow.api.deliverPreparedConsultationReturn({bookingNo:'TEST',documentId:'TEST-DOC',lineUserId:'MOCK-ONLY',items:[{index:1,content:'乙姓名【前世】\n錯誤內容'}]},'https://mock.invalid'),/姓名或項目標籤/);
 assert.equal(flow.pushes(),0);
});
