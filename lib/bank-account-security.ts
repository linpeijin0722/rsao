import {createHash,timingSafeEqual} from 'node:crypto';
export function verifyBankPassword(password:unknown){
 const expected=process.env.BANK_ACCOUNT_PASSWORD||process.env.ADMIN_PASSWORD;
 if(!expected)throw Error('尚未設定收款帳號管理密碼');
 if(typeof password!=='string'||!password||password.length>1024)return false;
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(password),digest(expected));
}
export function validateBankAccount(value:any){
 const account=Object.fromEntries(['label','bank_name','bank_code','branch_name','account_number','account_name','note'].map(key=>[key,String(value?.[key]||'').trim()]));
 if(!account.label||!account.bank_name||!account.account_name||!/^\d{3}$/.test(account.bank_code)||!/^\d{6,20}$/.test(account.account_number))throw Error('請填寫帳號名稱、銀行、三碼銀行代碼、6至20碼帳號及戶名');
 if(Object.values(account).some(text=>text.length>300))throw Error('收款帳號欄位過長');
 return {...account,...(value?.id?{id:String(value.id)}:{})};
}
