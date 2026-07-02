alter table public.documents
  add column if not exists session_id text;

create index if not exists documents_session_id_created_at_idx
  on public.documents (session_id, created_at desc)
  where session_id is not null;

create index if not exists documents_session_id_status_idx
  on public.documents (session_id, status)
  where session_id is not null;

drop function if exists public.match_document_chunks(
  extensions.vector(768),
  double precision,
  integer,
  uuid[]
);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  filter_session_id text,
  match_threshold double precision default 0.5,
  match_count integer default 6,
  filter_document_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  chunk_index integer,
  page_number integer,
  content text,
  similarity double precision
)
language sql
stable
as $$
  select
    document_chunks.id as chunk_id,
    documents.id as document_id,
    documents.title as document_title,
    document_chunks.chunk_index,
    document_chunks.page_number,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from public.document_chunks
  join public.documents
    on documents.id = document_chunks.document_id
  where filter_session_id is not null
    and documents.session_id = filter_session_id
    and documents.status = 'ready'
    and (
      filter_document_ids is null
      or document_chunks.document_id = any(filter_document_ids)
    )
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_document_chunks(
  extensions.vector(768),
  text,
  double precision,
  integer,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.match_document_chunks(
  extensions.vector(768),
  text,
  double precision,
  integer,
  uuid[]
) to service_role;
