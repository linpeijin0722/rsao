import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
import {verifyBankPassword,validateBankAccount} from '@/lib/bank-account-security';
export async function POST(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 try{
 const body=await request.json();if(!['save','delete','select'].includes(body.action))return NextResponse.json({error:'不支援的帳號操作'},{status:400});
 const db=adminSupabase(),correct=verifyBankPassword(body.password);
 const {data:allowed,error:guardError}=await db.rpc('bank_password_attempt',{p_correct:correct});
 if(guardError)throw Error('帳號密碼驗證暫時無法使用，請確認已執行058 SQL');
 if(!correct||!allowed)return NextResponse.json({error:correct?'密碼驗證暫時鎖定，請10分鐘後再試':'密碼錯誤或驗證暫時鎖定，未變更帳號'},{status:403});
 const account=body.action==='save'?validateBankAccount(body.account):{id:String(body.accountId||'')};
 const {data,error}=await db.rpc('mutate_bank_account',{p_action:body.action,p_account:account});
 if(error)throw Error(error.message||'帳號更新失敗');
 return NextResponse.json({ok:true,account:data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'帳號更新失敗'},{status:400});}
}
