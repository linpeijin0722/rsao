alter table public.booking_details add column if not exists google_document_id text;
alter table public.booking_details add column if not exists google_document_url text;
alter table public.booking_details add column if not exists google_document_created_at timestamptz;

