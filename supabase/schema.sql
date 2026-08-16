-- Paste this into Supabase SQL Editor (Dashboard > SQL Editor > New query), then run.
-- Safe to re-run: adds the walker column if missing, creates the table if missing.
alter table public.walks add column if not exists walker text default 'Harshit';

create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  walked_on date,
  note text,
  walker text,
  covered_edges jsonb not null default '[]'::jsonb,
  polyline jsonb not null default '[]'::jsonb,
  walked_km numeric,
  created_at timestamptz not null default now()
);

alter table public.walks enable row level security;

create policy "walks_select" on public.walks for select using (true);
create policy "walks_insert" on public.walks for insert with check (true);
create policy "walks_delete" on public.walks for delete using (true);
