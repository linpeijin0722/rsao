import { adminSupabase } from "@/lib/supabase";

export type PaymentMode = "auto"|"newebpay"|"bank_transfer";

export async function paymentSettings(){
  const {data,error}=await adminSupabase().from("booking_system_settings")
    .select("payment_mode,bank_name,bank_code,bank_account,gateway_disabled_until,gateway_failure_reason")
    .eq("id",true).maybeSingle();
  if(error)throw error;
  const mode=(data?.payment_mode||"bank_transfer") as PaymentMode;
  const disabled=Boolean(data?.gateway_disabled_until&&new Date(data.gateway_disabled_until).getTime()>Date.now());
  return {...data,payment_mode:mode,effective_mode:mode==="auto"?(disabled?"bank_transfer":"newebpay"):mode,
    bank_name:data?.bank_name||"國泰世華",bank_code:data?.bank_code||"013",bank_account:data?.bank_account||"218700524294"};
}
