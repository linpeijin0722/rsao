export function validReturnDraft(value:any):boolean {
 if(!value||!value.versions||typeof value.versions!=='object'||Array.isArray(value.versions)||!value.activeVersionIds||typeof value.activeVersionIds!=='object'||!Array.isArray(value.selected)||!Array.isArray(value.sourceItems))return false;
 if(!value.selected.every((x:any)=>Number.isInteger(x)&&x>0)||!value.sourceItems.every((x:any)=>Number.isInteger(x?.index)&&typeof x.content==='string'))return false;
 return Object.entries(value.versions).every(([index,versions]:[string,any])=>/^\d+$/.test(index)&&Array.isArray(versions)&&versions.length>0&&versions.every((v:any)=>typeof v?.id==='string'&&typeof v.label==='string'&&typeof v.content==='string'&&Array.isArray(v.changeSummary)&&v.changeSummary.every((s:any)=>typeof s==='string')&&Array.isArray(v.suspectedIssues)&&v.suspectedIssues.every((i:any)=>typeof i.originalText==='string'&&typeof i.reason==='string'&&['kept','removed'].includes(i.action)))&&versions.some((v:any)=>v.id===value.activeVersionIds[index]));
}
/** Preserve manual drafts when the Google source changes; append the fresh source for comparison. */
export function restoreReturnDraft(fresh:any,saved:any){
 if(!validReturnDraft(saved))throw new Error('已儲存草稿格式不正確，請先確認資料');
 const next={...fresh,versions:{...fresh.versions},activeVersionIds:{...fresh.activeVersionIds},selected:saved.selected.filter((index:number)=>fresh.selected.includes(index))};
 let changed=false;
 for(const item of fresh.sourceItems){if(!saved.versions[item.index])continue;
  next.versions[item.index]=saved.versions[item.index];next.activeVersionIds[item.index]=saved.activeVersionIds[item.index];
  const previous=saved.sourceItems.find((x:any)=>x.index===item.index);
  if(previous?.content!==item.content){changed=true;next.versions[item.index]=[...saved.versions[item.index],{...fresh.versions[item.index][0],id:`doc-${Date.now()}-${item.index}`,label:'Google 文件更新版本'}]}
 }
 return {payload:next,changed};
}
