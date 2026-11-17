begin;
create table if not exists public.consultation_writing_drafts(
 booking_no text not null,document_id text not null,scope text not null default '',
 payload jsonb not null,revision integer not null default 1,updated_at timestamptz not null default now(),
 primary key(booking_no,document_id,scope)
);
alter table public.consultation_writing_drafts enable row level security;
revoke all on public.consultation_writing_drafts from public,anon,authenticated;
grant all on public.consultation_writing_drafts to service_role;
create or replace function public.save_consultation_writing_draft(p_booking_no text,p_document_id text,p_scope text,p_payload jsonb,p_revision integer)
returns table(revision integer,updated_at timestamptz) language plpgsql set search_path=public as $$
begin
 if p_revision=0 then
  return query insert into public.consultation_writing_drafts as d(booking_no,document_id,scope,payload) values(p_booking_no,p_document_id,p_scope,p_payload) on conflict do nothing returning d.revision,d.updated_at;
 else
  return query update public.consultation_writing_drafts as d set payload=p_payload,revision=d.revision+1,updated_at=now() where d.booking_no=p_booking_no and d.document_id=p_document_id and d.scope=p_scope and d.revision=p_revision returning d.revision,d.updated_at;
 end if;
end $$;
revoke all on function public.save_consultation_writing_draft(text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_consultation_writing_draft(text,text,text,jsonb,integer) to service_role;
commit;
