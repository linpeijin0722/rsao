/** Join Q/A labels only when the next nonempty line contains their content. */
export function normalizeConsultationText(value: string) {
  const lines=String(value||"").replace(/\r\n?/g,"\n").split("\n");
  const boundary=(line:string)=>/^(?:[QA]\d*\s*[:：]|[【《]|備註[:：]|您好|.*(?:本身個性|的個性)$)/.test(line.trim());
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
