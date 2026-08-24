alter table public.bookings
  add column if not exists video_reminder_sent_at timestamptz;

create index if not exists bookings_video_reminder_lookup_idx
  on public.bookings (slot_start)
  where payment_status = 'paid'
    and video_reminder_sent_at is null
    and slot_start is not null;
