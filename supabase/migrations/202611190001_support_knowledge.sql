create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('markdown', 'pdf', 'ticket', 'wiki')),
  content text not null default '',
  version text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'superseded')),
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  heading text not null default 'Document',
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number is null or page_number > 0),
  line_start integer check (line_start is null or line_start > 0),
  line_end integer check (line_end is null or line_end >= line_start),
  embedding extensions.vector(3072),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

alter table public.documents add column if not exists content text not null default '';
alter table public.chunks add column if not exists heading text not null default 'Document';

create index if not exists documents_status_effective_idx
  on public.documents (status, effective_at desc);
create index if not exists chunks_document_id_idx on public.chunks (document_id);
create index if not exists chunks_embedding_hnsw_idx
  on public.chunks using hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops)
  where embedding is not null;

alter table public.documents enable row level security;
alter table public.chunks enable row level security;

revoke all on table public.documents, public.chunks from anon, authenticated;
grant all on table public.documents, public.chunks to service_role;

create or replace function public.search_knowledge_chunks(
  query_embedding extensions.vector(3072),
  match_count integer default 40,
  min_similarity real default 0.25
)
returns table (
  id uuid, document_id uuid, content text, heading text, chunk_index integer,
  page_number integer, line_start integer, line_end integer,
  title text, source_type text, version text, similarity real
)
language sql stable
set search_path = ''
as $$
  select c.id, c.document_id, c.content, c.heading, c.chunk_index,
    c.page_number, c.line_start, c.line_end,
    d.title, d.source_type, d.version,
    (1 - (c.embedding::extensions.halfvec(3072)
      operator(extensions.<=>) query_embedding::extensions.halfvec(3072)))::real as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where d.status = 'approved' and c.embedding is not null
    and (1 - (c.embedding::extensions.halfvec(3072)
      operator(extensions.<=>) query_embedding::extensions.halfvec(3072))) >= min_similarity
  order by c.embedding::extensions.halfvec(3072)
    operator(extensions.<=>) query_embedding::extensions.halfvec(3072)
  limit greatest(1, least(match_count, 200));
$$;

revoke all on function public.search_knowledge_chunks(extensions.vector, integer, real) from public, anon, authenticated;
grant execute on function public.search_knowledge_chunks(extensions.vector, integer, real) to service_role;
