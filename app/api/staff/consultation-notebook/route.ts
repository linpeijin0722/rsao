import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {isAdminSession} from "@/lib/admin-session";
import {bookingForConsultationReturn} from "@/lib/consultation-return-delivery";
import {getConsultationNotebookText} from "@/lib/google-consultation-docs";

export async function GET(request:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"請先登入預約工作後台"},{status:401});
  try{
    const bookingNo=request.nextUrl.searchParams.get("bookingNo")||"",documentId=request.nextUrl.searchParams.get("documentId")||"";
    if(!bookingNo||!documentId)throw Error("缺少訂單或文件編號");
    const {booking,detail,customer}=await bookingForConsultationReturn(bookingNo,documentId);
    if(detail.google_document_id!==documentId)throw Error("文件不屬於此訂單，未讀取記事本");
    const text=await getConsultationNotebookText(detail.google_document_id);
    return NextResponse.json({ok:true,task:{bookingNo:booking.booking_no,documentId:detail.google_document_id,text,displayName:customer?.line_display_name||"",fullName:customer?.full_name||"",pictureUrl:customer?.line_picture_url||""}},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"讀取記事本失敗"},{status:400});}
}
