/** Join Q/A labels only when the next nonempty line contains their content. */
export function normalizeConsultationText(value: string) {
  const lines=String(value||"").replace(/\r\n?/g,"\n").split("\n");
  const boundary=(line:string)=>/^(?:[QA]\d*\s*[:：]|(?:[^【《\n]{1,80})?[【《][^】》\n]+[】》]|備註[:：]|您好|.*(?:本身個性|的個性)$)/.test(line.trim());
  for(let i=0;i<lines.length;i++){
    if(!/^[QA]\d*\s*[:：]\s*$/.test(lines[i].trim()))continue;
    let next=i+1;while(next<lines.length&&!lines[next].trim())next++;
    if(next<lines.length&&!boundary(lines[next])){lines[i]=lines[i].trim()+lines[next].trimStart();lines.splice(i+1,next-i);}
  }
  return lines.join("\n").replace(/[ \t]+$/gm,"").replace(/\n\s*\n(?:\s*\n)+/g,"\n\n").trim();
}
export function consultationStructure(value:string){
  return normalizeConsultationText(value).split("\n").map(line=>line.trim()).map(line=>/^A\d*\s*[:：]/.test(line)?line.match(/^A\d*\s*[:：]/)![0]:line).filter(line=>/^(?:[QA]\d*\s*[:：]|[【《])/.test(line)||/(?:本身個性|的個性)$/.test(line)||/^(?:對方的紅鸞星|紅鸞星會落在|而離婚或離異|如果要姻緣)/.test(line));
}

export function consultationReturnHeadings(value:string){
  const clean=String(value).replace(/\r\n?/g,"\n").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g,"");
  const collect=(pattern:RegExp)=>Array.from(clean.matchAll(pattern),match=>
   match[1].trim().replace(/[ \t\u00a0\u3000]+/g," ")+"【"+match[2].trim().replace(/[ \t\u00a0\u3000]+/g," ")+"】");
  const square=collect(/^[ \t\u00a0\u3000]*([^\n【】《》]*?)【([^】\n]+)】[ \t\u00a0\u3000]*$/gm);
  // A named main heading identifies the person/item. Standalone bracketed
  // advice in the body is prose, not an additional identity to be polished.
  const named=square.filter(heading=>!heading.startsWith("【"));
  if(named.length)return [...new Set(named)];
  if(square.length)return [square[0]];
  return collect(/^[ \t\u00a0\u3000]*([^\n【】《》]*?)《([^》\n]+)》[ \t\u00a0\u3000]*$/gm).slice(0,1);
 }
