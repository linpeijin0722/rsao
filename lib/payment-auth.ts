// Re-authenticate only on 401; never retry a possibly accepted payment request.
export async function paymentFetch(url:string,init:RequestInit|undefined,auth:{
  fetch:typeof fetch; init:()=>Promise<unknown>; loggedIn:()=>boolean;
  token:()=>string|null; login:()=>void;
}){
  let response=await auth.fetch(url,init);
  if(response.status!==401)return response;
  await auth.init();
  if(!auth.loggedIn()){auth.login();throw Error("正在前往 LINE 登入，登入後會回到這筆付款訂單");}
  const token=auth.token();
  if(!token)throw Error("LINE 登入憑證已失效，請按重新登入");
  const refreshed=await auth.fetch("/api/line/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accessToken:token})});
  if(!refreshed.ok)throw Error("無法更新 LINE 登入，請按重新登入");
  response=await auth.fetch(url,init);
  if(response.status===401)throw Error("登入未能保留，請重新登入後再試");
  return response;
}
