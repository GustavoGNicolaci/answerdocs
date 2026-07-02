create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  title text not null default 'New chat' check (char_length(trim(title)) > 0 and char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists folder_id uuid references public.folders(id) on delete cascade,
  add column if not exists chat_id uuid references public.chats(id) on delete cascade,
  add column if not exists selected boolean not null default true;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  language text not null default 'en' check (language in ('en', 'pt')),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (chat_id, position)
);

create table if not exists public.message_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  chunk_id uuid references public.document_chunks(id) on delete set null,
  citation_index integer not null check (citation_index > 0),
  snippet text not null,
  page_number integer,
  chunk_index integer not null check (chunk_index >= 0),
  document_title text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx
  on public.profiles (email)
  where email is not null;

create index if not exists folders_user_id_updated_at_idx
  on public.folders (user_id, updated_at desc);

create index if not exists chats_user_folder_updated_at_idx
  on public.chats (user_id, folder_id, updated_at desc);

create index if not exists chat_messages_user_chat_position_idx
  on public.chat_messages (user_id, chat_id, position);

create index if not exists message_references_user_chat_message_idx
  on public.message_references (user_id, chat_id, message_id);

create index if not exists documents_user_chat_status_idx
  on public.documents (user_id, chat_id, status)
  where user_id is not null and chat_id is not null;

create index if not exists documents_user_chat_selected_idx
  on public.documents (user_id, chat_id, selected)
  where user_id is not null and chat_id is not null;

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.message_references enable row level security;

drop policy if exists "Users can read their own profile." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update their own profile." on public.profiles;
drop policy if exists "Users can delete their own profile." on public.profiles;

create policy "Users can read their own profile."
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can insert their own profile."
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own profile."
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can delete their own profile."
on public.profiles for delete
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can read their own folders." on public.folders;
drop policy if exists "Users can insert their own folders." on public.folders;
drop policy if exists "Users can update their own folders." on public.folders;
drop policy if exists "Users can delete their own folders." on public.folders;

create policy "Users can read their own folders."
on public.folders for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own folders."
on public.folders for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own folders."
on public.folders for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own folders."
on public.folders for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own chats." on public.chats;
drop policy if exists "Users can insert their own chats." on public.chats;
drop policy if exists "Users can update their own chats." on public.chats;
drop policy if exists "Users can delete their own chats." on public.chats;

create policy "Users can read their own chats."
on public.chats for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own chats."
on public.chats for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own chats."
on public.chats for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own chats."
on public.chats for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own documents." on public.documents;
drop policy if exists "Users can insert their own documents." on public.documents;
drop policy if exists "Users can update their own documents." on public.documents;
drop policy if exists "Users can delete their own documents." on public.documents;

create policy "Users can read their own documents."
on public.documents for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own documents."
on public.documents for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own documents."
on public.documents for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own documents."
on public.documents for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read chunks for their own documents." on public.document_chunks;

create policy "Users can read chunks for their own documents."
on public.document_chunks for select
to authenticated
using (
  exists (
    select 1
    from public.documents
    where documents.id = document_chunks.document_id
      and documents.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read their own messages." on public.chat_messages;
drop policy if exists "Users can insert their own messages." on public.chat_messages;
drop policy if exists "Users can update their own messages." on public.chat_messages;
drop policy if exists "Users can delete their own messages." on public.chat_messages;

create policy "Users can read their own messages."
on public.chat_messages for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own messages."
on public.chat_messages for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own messages."
on public.chat_messages for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own messages."
on public.chat_messages for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own references." on public.message_references;
drop policy if exists "Users can insert their own references." on public.message_references;
drop policy if exists "Users can update their own references." on public.message_references;
drop policy if exists "Users can delete their own references." on public.message_references;

create policy "Users can read their own references."
on public.message_references for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own references."
on public.message_references for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own references."
on public.message_references for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own references."
on public.message_references for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.chats to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.message_references to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select on public.document_chunks to authenticated;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.folders to service_role;
grant select, insert, update, delete on public.chats to service_role;
grant select, insert, update, delete on public.chat_messages to service_role;
grant select, insert, update, delete on public.message_references to service_role;

drop function if exists public.match_document_chunks(
  extensions.vector(768),
  text,
  double precision,
  integer,
  uuid[]
);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  filter_session_id text default null,
  filter_user_id uuid default null,
  filter_chat_id uuid default null,
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
        and filter_chat_id is not null
        and documents.user_id = filter_user_id
        and documents.chat_id = filter_chat_id
      )
      or (
        filter_user_id is null
        and filter_chat_id is null
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
