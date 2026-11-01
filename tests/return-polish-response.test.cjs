const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');
function source(path) {
  return stripTypeScriptTypes(fs.readFileSync(path, 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
}
const original = '【整體建議】\nA1:自己可以慢慢來\n';
const valid = {status:'completed', output:[{content:[{type:'output_text',text:JSON.stringify({segments:[{id:0,content:'自己可以慢慢來。'}],changeSummary:['調整標點'],suspectedIssues:[]})}]}]};
function harness(responses, authorized = true) {
  const calls = [];
  const context = vm.createContext({
    process:{env:{OPENAI_API_KEY:'test-only'}},
    cookies:async()=>({get:()=>({value:'session'})}), isAdminSession:()=>authorized,
    NextResponse:{json:(body,options)=>({body,status:options?.status||200})},
    fetch:async(url,options)=>{calls.push(JSON.parse(options.body)); const result=responses[Math.min(calls.length-1,responses.length-1)]; return {ok:!result.error,json:async()=>result};},
  });
  vm.runInContext(source('lib/consultation-text.ts'),context);
  vm.runInContext(source('lib/consultation-polish.ts'),context);
  vm.runInContext(source('app/api/staff/consultation-return/polish/route.ts'),context);
  return {calls, run:()=>context.POST({json:async()=>({content:original})})};
}
test('complete response merges actual segments and preserves question/answer markers',async()=>{
  const h=harness([valid]), result=await h.run();
  assert.equal(result.status,200);assert.equal(result.body.polished,'【整體建議】\nA1:自己可以慢慢來。');assert.equal(h.calls.length,1);
});
test('token truncation retries once with a larger budget',async()=>{
  const h=harness([{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]},valid]);
  assert.equal((await h.run()).status,200);assert.equal(h.calls.length,2);assert.ok(h.calls[1].max_output_tokens>h.calls[0].max_output_tokens);
});
test('malformed JSON matching screenshot retries from original input',async()=>{
  const h=harness([{status:'completed',output:[{content:[{type:'output_text',text:'{"segments":[{"id":0,"content":"hello"} broken'}]}]},valid]);
  assert.equal((await h.run()).status,200);assert.equal(h.calls.length,2);assert.equal(h.calls[0].input,h.calls[1].input);
});
test('repeated malformed JSON gives Chinese error without a replacement',async()=>{
  const h=harness([{status:'completed',output:[{content:[{type:'output_text',text:'{"segments":['}]}]}]);
  const result=await h.run();assert.equal(result.status,400);assert.match(result.body.error,/格式不完整.*保留原始版本/);assert.equal(result.body.polished,undefined);assert.equal(h.calls.length,2);
});
test('even syntactically valid partial output cannot be applied',async()=>{
  const h=harness([{...valid,status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}]);
  const result=await h.run();assert.equal(result.status,400);assert.equal(result.body.polished,undefined);assert.equal(h.calls.length,2);
});
test('refusal and content filter preserve original without retry',async()=>{
  for(const response of [{status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]},{status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]}]){
    const h=harness([response]),result=await h.run();assert.equal(result.status,400);assert.match(result.body.error,/保留原始版本/);assert.equal(h.calls.length,1);
  }
});
test('empty output retries once and never becomes an empty success',async()=>{
  const h=harness([{status:'completed',output:[]}]);assert.equal((await h.run()).status,400);assert.equal(h.calls.length,2);
});
test('null or missing required arrays never reach merge',async()=>{
  for(const text of ['null','{}','{"segments":[]}']){const h=harness([{status:'completed',output:[{content:[{type:'output_text',text}]}]}]);const result=await h.run();assert.equal(result.status,400);assert.match(result.body.error,/內容不完整/);}
});
test('API errors do not trigger a paid retry',async()=>{
  const h=harness([{error:{message:'rate limit'}}]);assert.equal((await h.run()).status,400);assert.equal(h.calls.length,1);
});
test('login is still required',async()=>{
  const h=harness([valid],false);assert.equal((await h.run()).status,401);assert.equal(h.calls.length,0);
});
