alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method in ('transfer','credit_card','line_pay','other'));

comment on constraint bookings_payment_method_check on public.bookings is
  'Payment method categories; exact NewebPay channel is stored in payment_provider_type';
