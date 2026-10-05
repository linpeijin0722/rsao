import {normalizeConsultationText} from './consultation-text';
export type PolishSegment={id:number;context:string;content:string};
type Part={literal:string}|{id:number};
export type PolishPlan={parts:Part[];segments:PolishSegment[];removedEmptyAges:number[]};
/** Keep document structure outside the AI response; only prose is replaceable. */
export function planConsultationPolish(value:string):PolishPlan{
 const parts:Part[]=[],segments:PolishSegment[]=[],removedEmptyAges:number[]=[];let context='',pending='';
 const flush=()=>{if(!pending)return;if(pending.trim()){const id=segments.length;segments.push({id,context,content:pending});parts.push({id});}else parts.push({literal:pending});pending='';};
 const fixed=(literal:string)=>{flush();parts.push({literal});};
 const lines=normalizeConsultationText(value).split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i],newline=i<lines.length-1?'\n':'',trim=line.trim();
  const age=/^(\s*\d+歲\s*[:：]\s*)(.*)$/.exec(line);
  if(age){flush();if(!age[2].trim()){removedEmptyAges.push(Number(age[1].match(/\d+/)![0]));continue;}fixed(age[1]);context=(context+"\n"+age[1].trim()).slice(-1800);pending=age[2];flush();fixed(newline);continue;}
  if(/^(?:Q\d*\s*[:：]|(?:[^【《\n]{1,80})?[【《][^】》\n]+[】》]|姓名\s*[:：]|農曆生日\s*[:：]|居住地址\s*[:：]|備註\s*[:：])/.test(trim)||/(?:本身個性|的個性)$/.test(trim)||/^(?:對方的紅鸞星|紅鸞星會落在|而離婚或離異|如果要姻緣)/.test(trim)){
   fixed(line+newline);context=(context+'\n'+trim).slice(-1800);continue;
  }
  const answer=/^(\s*A\d*\s*[:：]\s*)(.*)$/.exec(line);
  if(answer){fixed(answer[1]);pending=answer[2];flush();fixed(newline);continue;}
  pending+=line+newline;
 }
 flush();return{parts,segments,removedEmptyAges};
}
export function mergeConsultationPolish(plan:PolishPlan,rows:{id:number;content:string}[]){
 if(!Array.isArray(rows)||rows.length!==plan.segments.length)throw new Error('AI 回覆段落不完整，已保留原始版本');
 const values=new Map<number,string>();
 for(const row of rows){const original=plan.segments.find(s=>s.id===row.id);if(!original||values.has(row.id)||typeof row.content!=='string'||!row.content.trim())throw new Error('AI 回覆段落格式不正確，已保留原始版本');
  // No newly generated questions, headings, person titles, or age rows can enter prose.
  if(/(?:^|\n)\s*(?:[QA]\d*\s*[:：]|(?:[^【《\n]{1,80})?[【《][^】》\n]+[】》]|\d+歲\s*[:：])/.test(row.content)||/(?:^|\n)[^\n]*(?:本身個性|的個性)\s*(?:\n|$)/.test(row.content))throw new Error('AI 在回答中加入了標題或問題，已保留原始版本');
  const trailing=original.content.match(/\n+$/)?.[0]||'';values.set(row.id,row.content.trim()+trailing);
 }
 return normalizeConsultationText(plan.parts.map(part=>'literal' in part?part.literal:values.get(part.id)||'').join(''));
}
export type IssueRange={start:number;end:number;issueIndex:number};
/** Map exact or punctuation/spacing-normalized quotes back to visible text positions. */
export function consultationIssueRanges(content:string,issues:{originalText:string;action:string;restored?:boolean}[]):IssueRange[]{
 const ranges:IssueRange[]=[];
 const keep=(char:string)=>!/[\s，。！？、；：,.!?;:"「」『』“”‘’（）()]/.test(char);
 const positions:number[]=[],normalized=Array.from(content).filter((char)=>keep(char)).join('');
 for(let i=0;i<content.length;i++)if(keep(content[i]))positions.push(i);
 issues.forEach((issue,issueIndex)=>{if(issue.action==='removed'&&!issue.restored)return;const quote=issue.originalText.trim();if(!quote)return;
  let found=false,cursor=0;while(cursor<content.length){const start=content.indexOf(quote,cursor);if(start<0)break;ranges.push({start,end:start+quote.length,issueIndex});cursor=start+quote.length;found=true;}
  if(!found){const needle=Array.from(quote).filter(keep).join('');if(needle.length<2)return;let at=0;while(at<normalized.length){const start=normalized.indexOf(needle,at);if(start<0)break;ranges.push({start:positions[start],end:positions[start+needle.length-1]+1,issueIndex});at=start+needle.length;}}
 });
 return ranges.sort((a,b)=>a.start-b.start||b.end-a.end).filter((range,index,all)=>index===0||range.start>=all[index-1].end);
}
