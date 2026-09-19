import { adminSupabase } from "@/lib/supabase";

export type PaymentMode = "auto"|"newebpay"|"bank_transfer";

export async function paymentSettings(){
  const {data,error}=await adminSupabase().from("booking_system_settings")
    .select("payment_mode,bank_account_key,gateway_disabled_until,gateway_failure_reason")
    .eq("id",true).maybeSingle();
  if(error)throw error;
  const mode=(data?.payment_mode||"bank_transfer") as PaymentMode;
  const disabled=Boolean(data?.gateway_disabled_until&&new Date(data.gateway_disabled_until).getTime()>Date.now());
  const accounts={
    cathay:{id:"cathay",label:"國泰世華常用帳號",bank_name:"國泰世華",bank_code:"013",branch_name:"營業部",account_number:"218700524294",account_name:"林珮均",note:""},
    esun:{id:"esun",label:"玉山銀行公司帳號",bank_name:"玉山銀行",bank_code:"808",branch_name:"林口分行",account_number:"0886940043636",account_name:"林阿嫂有限公司",note:""},
  } as const;
  const account=accounts[(data?.bank_account_key==="esun"?"esun":"cathay") as keyof typeof accounts];
  return {...data,payment_mode:mode,effective_mode:mode==="auto"?(disabled?"bank_transfer":"newebpay"):mode,
    bank_account_key:account.id,bank_label:account.label,bank_name:`${account.bank_name} ${account.branch_name}`,bank_code:account.bank_code,bank_branch:account.branch_name,bank_account:account.account_number,bank_account_name:account.account_name,bank_note:account.note};
}
