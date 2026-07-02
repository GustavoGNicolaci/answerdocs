update public.documents as documents
set folder_id = chats.folder_id
from public.chats as chats
where documents.chat_id = chats.id
  and documents.user_id = chats.user_id
  and documents.folder_id is null;

alter table public.documents
  drop constraint if exists documents_chat_id_fkey;

alter table public.documents
  add constraint documents_chat_id_fkey
  foreign key (chat_id)
  references public.chats(id)
  on delete set null;

create index if not exists documents_user_folder_status_idx
  on public.documents (user_id, folder_id, status)
  where user_id is not null and folder_id is not null;

create index if not exists documents_user_folder_selected_idx
  on public.documents (user_id, folder_id, selected)
  where user_id is not null and folder_id is not null;

drop function if exists public.match_document_chunks(
  extensions.vector(768),
  text,
  uuid,
  uuid,
  double precision,
  integer,
  uuid[]
);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  filter_session_id text default null,
  filter_user_id uuid default null,
  filter_folder_id uuid default null,
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
  where documents.status = 'ready'
    and filter_document_ids is not null
    and coalesce(array_length(filter_document_ids, 1), 0) > 0
    and document_chunks.document_id = any(filter_document_ids)
    and (
      (
        filter_user_id is not null
        and filter_folder_id is not null
        and documents.user_id = filter_user_id
        and documents.folder_id = filter_folder_id
      )
      or (
        filter_user_id is null
        and filter_folder_id is null
        and filter_session_id is not null
        and documents.user_id is null
        and documents.session_id = filter_session_id
      )
    )
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_document_chunks(
  extensions.vector(768),
  text,
  uuid,
  uuid,
  double precision,
  integer,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.match_document_chunks(
  extensions.vector(768),
  text,
  uuid,
  uuid,
  double precision,
  integer,
  uuid[]
) to service_role;
