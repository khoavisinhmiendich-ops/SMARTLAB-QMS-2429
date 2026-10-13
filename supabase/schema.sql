create table if not exists public.form_records (
 id uuid primary key default gen_random_uuid(),
 document_id text not null,
 form_id text,
 user_id text not null,
 data jsonb not null default '{}'::jsonb,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists form_records_document_idx on public.form_records(document_id);
create index if not exists form_records_user_idx on public.form_records(user_id);
alter table public.form_records enable row level security;
create policy "authenticated users can read records" on public.form_records for select to authenticated using (auth.uid()::text = user_id);
create policy "authenticated users can insert records" on public.form_records for insert to authenticated with check (auth.uid()::text = user_id);
create policy "authenticated users can update own records" on public.form_records for update to authenticated using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
