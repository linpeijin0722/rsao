const fs=require('fs');let p='lib/consultation-return-delivery.ts',s=fs.readFileSync(p,'utf8');s=s.replace('async function returnItemBindings','export async function returnItemBindings');s=s.replace('booking_consultation_answers(profile_id,booking_answer_participants(profile_id,position))','booking_consultation_answers(profile_id,consultation_profiles(name),booking_answer_participants(profile_id,position,consultation_profiles(name)))');s=s.replace('bookingDetailId: detail.id, itemId: detail.item_id, profileId: primaryId,','bookingDetailId: detail.id, itemId: detail.item_id, profileId: primaryId,\n      headingName: kind.relation ? String(one(target?.consultation_profiles)?.name || one(answer.consultation_profiles)?.name || "") : "",');s=s.replace('const items = freshItems.filter','const items = correctReturnHeadings(freshItems, bindings).filter');s += `
export function correctReturnHeadings<T extends {index:number;itemTitle:string;content:string}>(items:T[], bindings:{headingName?:string}[]):T[] {
  return items.map(item=>{
    const name=bindings[item.index-1]?.headingName;
    if(!name)return item;
    const fix=(value:string)=>value.replace(/^([^\\n【]+)【([^】]*前世[^】]*)】/gm,(heading,names,label)=>names.split(/[&＆]/).map((entry:string)=>entry.trim()).includes(name)?name+"【"+label+"】":heading);
    return {...item,itemTitle:fix(item.itemTitle),content:fix(item.content)};
  });
}
`;fs.writeFileSync(p,s);
p='app/api/staff/consultation-return/route.ts';s=fs.readFileSync(p,'utf8').replace('import { bookingForConsultationReturn,','import { returnItemBindings, correctReturnHeadings, bookingForConsultationReturn,').replace('const items = await getConsultationReturnPreview(detail.google_document_id);','const items = correctReturnHeadings(await getConsultationReturnPreview(detail.google_document_id), await returnItemBindings(booking.id));');fs.writeFileSync(p,s);
