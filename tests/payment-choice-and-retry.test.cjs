const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=path=>fs.readFileSync(path,'utf8');

test('checkout always opens the fixed-account payment page first',()=>{
  const page=load('app/page.tsx'),mine=load('app/my-bookings/page.tsx'),pay=load('app/pay/page.tsx');
  assert.match(page,/location\.href=`\/pay\?order=/);
  assert.match(mine,/location\.href=`\/pay\?order=/);
  assert.match(pay,/選擇其他付款方式/);
  assert.match(pay,/onlinePayment:true/);
  assert.doesNotMatch(pay,/effective_mode==="newebpay"/);
});

test('NewebPay online checkout enables only configured non-transfer methods',()=>{
  const route=load('app/api/newebpay/route.ts');
  assert.match(route,/NEWEBPAY_ENABLED_METHODS\|\|"CREDIT"/);
  assert.match(route,/new Set\(\["CREDIT","LINEPAY"\]\)/);
  assert.doesNotMatch(route,/VACC: "1"/);
});

test('bank transfers are never auto-confirmed and LINE failures are queued',()=>{
  const confirm=load('lib/payment-confirm.ts'),notification=load('lib/payment-notification.ts');
  assert.match(confirm,/\["VACC","WEBATM","CVS","BARCODE"\]/);
  assert.match(confirm,/normalized\.includes\("LINEPAY"\) \? "line_pay"/);
  assert.match(notification,/payment_notification_status:attempts>=10\?"failed":"pending"/);
  assert.match(notification,/payment_notification_next_retry_at/);
});

test('staff can see errors, retry payment notices, and resend unpaid payment messages for 12 hours',()=>{
  const page=load('app/staff/page.tsx'),route=load('app/api/staff/bookings/route.ts');
  assert.match(page,/payment_notification_error/);
  assert.match(page,/立即重試傳送/);
  assert.match(page,/再次傳送付款訊息（期限重新計算12小時）/);
  assert.match(route,/action==="resend_payment"/);
  assert.match(route,/Date\.now\(\)\+12\*60\*60\*1000/);
});
