"use client";
import {taipeiDateTimeInput} from '@/lib/taipei-time';
export type ReturnSchedule={id:string;scheduled_for:string;status:string;sent_at?:string|null;last_error?:string|null};
export default function ReturnScheduleStatus({schedules=[],onCancel,cancellingId}:{schedules?:ReturnSchedule[];onCancel?:(row:ReturnSchedule)=>void;cancellingId?:string}){
 return <div className="returnScheduleRecords">{schedules.map(row=><div key={row.id} className={`returnScheduleRecord ${row.status}`}>
 <b>{({pending:'◷ 已排程・等待發送',sending:'↗ 發送處理中',sent:'✓ 已送出',failed:'⚠ 發送失敗',cancelled:'已取消'} as Record<string,string>)[row.status]||row.status}</b>
 <strong>預定：{taipeiDateTimeInput(row.scheduled_for).replace('T',' ')}（台灣時間）</strong>
 {row.status==='pending'&&onCancel&&<button type="button" disabled={!!cancellingId} onClick={()=>onCancel(row)} style={{alignSelf:'flex-start',padding:'8px 16px',border:'1px solid #8c354d',borderRadius:8,color:'#8c354d',background:'#fff',fontWeight:600}}>{cancellingId===row.id?'取消中…':'取消排程'}</button>}
 {row.sent_at&&<span>實際送出：{taipeiDateTimeInput(row.sent_at).replace('T',' ')}</span>}
 {row.status==='pending'&&Date.parse(row.scheduled_for)<Date.now()&&<span>已到排程時間，等待系統處理</span>}
 {row.last_error&&<span role="status">{row.status==='pending'?'上次未成功，等待重試：':'原因：'}{row.last_error}</span>}
 {row.status==='failed'&&<span>請先確認 LINE 是否已有部分內容，再重新安排發送。</span>}
 </div>)}</div>;
}
