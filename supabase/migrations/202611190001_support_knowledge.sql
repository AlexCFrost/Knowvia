create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('markdown', 'pdf', 'ticket', 'wiki')),
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
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number is null or page_number > 0),
  line_start integer check (line_start is null or line_start > 0),
  line_end integer check (line_end is null or line_end >= line_start),
  embedding extensions.vector(3072),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

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
