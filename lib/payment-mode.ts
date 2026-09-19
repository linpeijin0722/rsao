import { adminSupabase } from "@/lib/supabase";

export type PaymentMode = "auto"|"newebpay"|"bank_transfer";

export async function paymentSettings(){
  const {data,error}=await adminSupabase().from("booking_system_settings")
    .select("payment_mode,bank_name,bank_code,bank_account,active_bank_account_id,gateway_disabled_until,gateway_failure_reason")
    .eq("id",true).maybeSingle();
  if(error)throw error;
  const mode=(data?.payment_mode||"bank_transfer") as PaymentMode;
  const disabled=Boolean(data?.gateway_disabled_until&&new Date(data.gateway_disabled_until).getTime()>Date.now());
  const {data:account}=data?.active_bank_account_id?await adminSupabase().from("payment_bank_accounts").select("id,label,bank_name,bank_code,account_number,account_name,note").eq("id",data.active_bank_account_id).maybeSingle():{data:null};
  return {...data,payment_mode:mode,effective_mode:mode==="auto"?(disabled?"bank_transfer":"newebpay"):mode,
    bank_account_id:account?.id||null,bank_label:account?.label||"常用收款帳號",bank_name:account?.bank_name||data?.bank_name||"國泰世華",bank_code:account?.bank_code||data?.bank_code||"013",bank_account:account?.account_number||data?.bank_account||"218700524294",bank_account_name:account?.account_name||"林珮均",bank_note:account?.note||""};
}
