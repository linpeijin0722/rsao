begin;
create table if not exists public.consultation_return_drafts (
 booking_no text not null references public.bookings(booking_no) on delete cascade,
 document_id text not null,
 payload jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(booking_no,document_id)
);
alter table public.consultation_return_drafts enable row level security;
revoke all on public.consultation_return_drafts from anon,authenticated;
grant all on public.consultation_return_drafts to service_role;
create or replace function public.save_consultation_return_draft(p_booking_no text,p_document_id text,p_payload jsonb,p_revision integer)
returns table(revision integer,updated_at timestamptz) language plpgsql set search_path=public as $$
begin
 return query insert into public.consultation_return_drafts as d(booking_no,document_id,payload)
 select p_booking_no,p_document_id,p_payload where p_revision=0
 on conflict do nothing returning d.revision,d.updated_at;
 if found then return; end if;
 return query update public.consultation_return_drafts as d set payload=p_payload,revision=d.revision+1,updated_at=clock_timestamp()
 where d.booking_no=p_booking_no and d.document_id=p_document_id and d.revision=p_revision
 returning d.revision,d.updated_at;
end $$;
create or replace function public.claim_staff_reminders(p_booking_ids uuid[],p_date date,p_recipient text)
returns table(id uuid,booking_id uuid) language plpgsql set search_path=public as $$
begin
 -- Serialize claims so overlapping cron runs cannot divide one reminder batch.
 perform pg_advisory_xact_lock(hashtextextended('staff-reminder:'||p_recipient||':'||p_date::text,0));
 return query insert into public.staff_data_reminder_log as l(booking_id,reminder_date,recipient_line_user_id)
 select distinct unnest(p_booking_ids),p_date,p_recipient
 on conflict do nothing returning l.id,l.booking_id;
end $$;
revoke all on function public.save_consultation_return_draft(text,text,jsonb,integer),public.claim_staff_reminders(uuid[],date,text) from public,anon,authenticated;
grant execute on function public.save_consultation_return_draft(text,text,jsonb,integer),public.claim_staff_reminders(uuid[],date,text) to service_role;
commit;
