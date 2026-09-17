"use client";
import {useEffect,useState} from "react";
import QuickConsultationReply from "../QuickConsultationReply";

export default function QuickReplyPage(){
  const [params,setParams]=useState({bookingNo:"",documentId:"",token:""});
  useEffect(()=>{const search=new URLSearchParams(window.location.search);setParams({bookingNo:search.get("bookingNo")||"",documentId:search.get("documentId")||"",token:search.get("token")||""})},[]);
  if(!params.bookingNo||!params.documentId)return <main className="quickReplyStandaloneLoading">正在開啟諮詢回覆…</main>;
  return <QuickConsultationReply bookingNo={params.bookingNo} documentId={params.documentId} initialAccessToken={params.token} standalone onClose={()=>{}}/>;
}
