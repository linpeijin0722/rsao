import {createHmac,timingSafeEqual} from "crypto";

const secret=()=>{
  const value=process.env.ADMIN_SESSION_SECRET;
  if(!value||value.length<32)throw new Error("ADMIN_SESSION_SECRET 至少需要32字元");
  return value;
};
const payload=(bookingNo:string,documentId:string)=>`${bookingNo.trim()}|${documentId.trim()}`;
export const makeQuickReplyToken=(bookingNo:string,documentId:string)=>createHmac("sha256",secret()).update(payload(bookingNo,documentId)).digest("base64url");
export function isQuickReplyToken(token:string|undefined,bookingNo:string,documentId:string){
  try{if(!token)return false;const expected=makeQuickReplyToken(bookingNo,documentId),left=Buffer.from(token),right=Buffer.from(expected);return left.length===right.length&&timingSafeEqual(left,right)}catch{return false}
}
