const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const file='app/booking-data/page.tsx',source=fs.readFileSync(file,'utf8');
function answerHarness(profiles=[],locked=false,sub='你與一位對象的前世關係'){
 const slots=[],requests=[];let cursor=0;
 const react={...React,useState(init){const i=cursor++;if(!(i in slots))slots[i]=i===11?true:init;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useEffect(){}};
 const c=vm.createContext({exports:{},require:name=>name==='react'?react:name==='react/jsx-runtime'?require('react/jsx-runtime'):name==='@/lib/taipei-time'?{taipeiDateKey:()=> '2026-11-12'}:{},console});
 const compiled=ts.transpileModule(source+'\nexport {Answer};',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInContext(compiled,c);
 const props={detail:{id:'detail',item_title:'前世因果（與他人前世關係）',booking_items:{code:'past-life-relationship'},booking_detail_sub_items:[{sub_item_title:sub}]},profiles,initialProfile:'owner',initialProfiles:[],initialQuestions:['原本的問題'],locked,save(){},onAddProfile:request=>requests.push(request)};
 const render=()=>{cursor=0;return c.exports.Answer(props)};
 return{slots,requests,props,render,html:()=>renderToStaticMarkup(render())};
}
function elements(tree,result=[]){if(tree&&typeof tree==='object'&&tree.props){result.push(tree);React.Children.forEach(tree.props.children,child=>elements(child,result));}return result;}
const owner={id:'owner',name:'本人甲',relationship:'本人',profile_type:'person'};
test('no selectable target has explanation and an always-visible add button',()=>{const h=answerHarness([owner]);const html=h.html();assert.match(html,/尚未新增可選的對象資料/);assert.match(html,/＋新增對象資料/);});
test('existing targets still have add button and retain options',()=>{const h=answerHarness([owner,{id:'old',name:'已有對象',profile_type:'person'}]);const html=h.html();assert.match(html,/已有對象/);assert.match(html,/＋新增對象資料/);assert.doesNotMatch(html,/尚未新增可選的對象資料/);});
test('three target slots each have their own add button',()=>{const h=answerHarness([owner],false,'與三位對象的前世關係');assert.equal((h.html().match(/class="addTargetProfile"/g)||[]).length,3);});
test('locked form does not allow new target creation',()=>{const h=answerHarness([owner],true);assert.doesNotMatch(h.html(),/addTargetProfile/);});
test('new target selects only the requested slot and preserves other answers',()=>{const h=answerHarness([owner],false,'與三位對象的前世關係');h.render();h.slots[1]=['existing1','','existing3'];const questions=JSON.stringify(h.slots[2]);const buttons=elements(h.render()).filter(e=>e.props.className==='addTargetProfile');const trigger={};buttons[1].props.onClick({currentTarget:trigger});const request=h.requests[0];assert.equal(request.trigger,trigger);assert.deepEqual(Array.from(request.allowedKinds),['person','deceased','pet']);request.onCreated({id:'new',name:'新對象'});assert.deepEqual(Array.from(h.slots[1]),['existing1','new','existing3']);assert.equal(JSON.stringify(h.slots[2]),questions);assert.match(h.html(),/已新增並選取第 2 位對象/);});
function addHarness({ok=true,fail=false,id='new'}={}){let data={profiles:[owner]},form={name:'新對象',profile_type:'person',relationship:'親友'},shown=true,message='',saving=false,selected=null,reloads=0,focused=0;
 const request={allowedKinds:['person'],onCreated:profile=>selected=profile,trigger:{focus:()=>focused++}};
 const c=vm.createContext({saving,inlineProfileRequest:{current:request},data,form,editingId:'',order:'ORDER',empty:{},profileKey:p=>`${p.profile_type}|${p.relationship}|${p.name}`,setMsg:v=>message=v,setSaving:v=>saving=v,setData:fn=>data=fn(data),setInlineKinds(){},setForm:v=>form=v,setEditingId(){},setShowForm:v=>shown=v,load:()=>reloads++,fetch:async()=>{if(fail)throw Error('連線中斷');return{ok,json:async()=>ok?{profileId:id}:{error:'欄位不完整'}}}});
 const start=source.indexOf('  async function add() {'),end=source.indexOf('\n  }',start)+4;vm.runInContext(stripTypeScriptTypes(source.slice(start,end)),c);
 return {run:()=>c.add(),get data(){return data},get selected(){return selected},get shown(){return shown},get message(){return message},get saving(){return saving},get reloads(){return reloads},get focused(){return focused}};
}
test('successful inline creation updates shared profiles without reloading item components',async()=>{const h=addHarness();await h.run();assert.equal(h.data.profiles.length,2);assert.equal(h.selected.id,'new');assert.equal(h.reloads,0);assert.equal(h.shown,false);assert.equal(h.focused,1);assert.equal(h.saving,false);});
test('validation or network failure keeps modal and existing selections untouched',async()=>{for(const opts of [{ok:false},{fail:true}]){const h=addHarness(opts);await h.run();assert.equal(h.data.profiles.length,1);assert.equal(h.selected,null);assert.equal(h.shown,true);assert.equal(h.saving,false);assert.ok(h.message);}});
test('missing created ID cannot silently select another profile',async()=>{const h=addHarness({id:null});await h.run();assert.equal(h.selected,null);assert.equal(h.shown,true);assert.match(h.message,/人物編號/);});
test('top add entry remains and TSX parses without errors',()=>{assert.match(source,/＋ 新增資料/);assert.equal(ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);});
