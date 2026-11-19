import { adminSupabase } from "@/lib/supabase";

export type PaymentMode = "newebpay"|"bank_transfer";

const legacyAccounts={
    cathay:{id:"cathay",label:"國泰世華常用帳號",bank_name:"國泰世華",bank_code:"013",branch_name:"營業部",account_number:"218700524294",account_name:"林珮均",note:""},
    esun:{id:"esun",label:"玉山銀行公司帳號",bank_name:"玉山銀行",bank_code:"808",branch_name:"林口分行",account_number:"0886940043636",account_name:"林阿嫂有限公司",note:""},
  } as const;

export async function paymentSettings(){
  const {data,error}=await adminSupabase().from("booking_system_settings")
    .select("payment_mode,bank_account_key,gateway_disabled_until,gateway_failure_reason")
    .eq("id",true).maybeSingle();
  if(error)throw error;
  const mode:PaymentMode=data?.payment_mode==="newebpay"?"newebpay":"bank_transfer";
  const key=data?.bank_account_key||"cathay";
  const {data:storedAccount,error:accountError}=await adminSupabase().from("bank_accounts").select("*").eq("id",key).eq("archived",false).single();
  // Compatibility only for a missing new table, never for a custom/deleted
  // account or a permission/network failure. Preserve the pre-upgrade choice.
  const missingTable=accountError&&["42P01","PGRST205"].includes(accountError.code)&&String(accountError.message).includes("bank_accounts");
  const account=storedAccount||(missingTable?(legacyAccounts as Record<string,any>)[key]:null);
  if(accountError&&!missingTable||!account)throw Error("收款帳號讀取失敗，請確認付款設定與058 SQL");
  return {...data,payment_mode:mode,effective_mode:mode,
    bank_account_key:account.id,bank_label:account.label,bank_name:`${account.bank_name} ${account.branch_name}`,bank_code:account.bank_code,bank_branch:account.branch_name,bank_account:account.account_number,bank_account_name:account.account_name,bank_note:account.note};
}
