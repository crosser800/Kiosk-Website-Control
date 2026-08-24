create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_path text not null,
  file_url text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.price_lists enable row level security;

drop policy if exists "Authenticated users can view price lists" on public.price_lists;
create policy "Authenticated users can view price lists"
  on public.price_lists for select to authenticated using (true);

drop policy if exists "Authenticated users can create price lists" on public.price_lists;
create policy "Authenticated users can create price lists"
  on public.price_lists for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update price lists" on public.price_lists;
create policy "Authenticated users can update price lists"
  on public.price_lists for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can delete price lists" on public.price_lists;
create policy "Authenticated users can delete price lists"
  on public.price_lists for delete to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('price-lists', 'price-lists', true, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload price list PDFs" on storage.objects;
create policy "Authenticated users can upload price list PDFs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'price-lists');

drop policy if exists "Authenticated users can update price list PDFs" on storage.objects;
create policy "Authenticated users can update price list PDFs"
  on storage.objects for update to authenticated
  using (bucket_id = 'price-lists') with check (bucket_id = 'price-lists');

drop policy if exists "Authenticated users can delete price list PDFs" on storage.objects;
create policy "Authenticated users can delete price list PDFs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'price-lists');
