import { adminSupabase } from "@/lib/supabase";

export type PaymentMode = "auto"|"newebpay"|"bank_transfer";

export async function paymentSettings(){
  const {data,error}=await adminSupabase().from("booking_system_settings")
    .select("payment_mode,bank_account_key,gateway_disabled_until,gateway_failure_reason")
    .eq("id",true).maybeSingle();
  if(error)throw error;
  const mode=(data?.payment_mode||"bank_transfer") as PaymentMode;
  const disabled=Boolean(data?.gateway_disabled_until&&new Date(data.gateway_disabled_until).getTime()>Date.now());
  const {data:account,error:accountError}=await adminSupabase().from("bank_accounts").select("*").eq("id",data?.bank_account_key||"cathay").eq("archived",false).single();
  if(accountError||!account)throw Error("收款帳號讀取失敗，請確認付款設定與058 SQL");
  return {...data,payment_mode:mode,effective_mode:mode==="auto"?(disabled?"bank_transfer":"newebpay"):mode,
    bank_account_key:account.id,bank_label:account.label,bank_name:`${account.bank_name} ${account.branch_name}`,bank_code:account.bank_code,bank_branch:account.branch_name,bank_account:account.account_number,bank_account_name:account.account_name,bank_note:account.note};
}
