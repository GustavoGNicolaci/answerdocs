create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('pdf', 'text')),
  status text not null default 'ready' check (status in ('indexing', 'ready', 'failed')),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number is null or page_number > 0),
  content text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists documents_created_at_idx
  on public.documents (created_at desc);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
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
    and (
      filter_document_ids is null
      or document_chunks.document_id = any(filter_document_ids)
    )
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.documents to service_role;
grant select, insert, update, delete on public.document_chunks to service_role;
grant execute on function public.match_document_chunks(
  extensions.vector(768),
  double precision,
  integer,
  uuid[]
) to service_role;
