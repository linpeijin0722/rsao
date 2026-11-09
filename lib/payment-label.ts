export const paymentProviderLabel=(providerType?:string|null,paymentMethod?:string|null)=>{
  const type=String(providerType||"").toUpperCase();
  if(type.includes("APPLEPAY"))return "Apple Pay";
  if(type.includes("ANDROIDPAY"))return "Google Pay";
  if(type.includes("SAMSUNGPAY"))return "Samsung Pay";
  if(type.includes("ESUNWALLET"))return "玉山 Wallet";
  if(type.includes("CVS"))return "超商代碼";
  if(type.includes("BARCODE"))return "超商條碼";
  if(type.includes("LINEPAY")||paymentMethod==="line_pay")return "LINE PAY";
  if(type.includes("CREDIT")||paymentMethod==="credit_card")return "信用卡";
  if(paymentMethod==="transfer")return "銀行轉帳";
  if(paymentMethod==="other")return "其他藍新付款";
  return "未記錄";
};
