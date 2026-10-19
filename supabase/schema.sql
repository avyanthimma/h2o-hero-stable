-- H2O Hero database setup. Run in Supabase: SQL Editor -> New query -> Run.
-- Safe to re-run.

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  description text not null check (char_length(description) between 1 and 2000),
  upvotes integer not null default 0,
  created_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  image_url text
);

alter table public.reports enable row level security;

drop policy if exists "Anyone can read reports" on public.reports;
create policy "Anyone can read reports"
  on public.reports for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can submit reports" on public.reports;
create policy "Anyone can submit reports"
  on public.reports for insert
  to anon, authenticated
  with check (upvotes = 0);

create or replace function public.upvote_report(report_id_input bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reports
  set upvotes = upvotes + 1
  where id = report_id_input;

  if not found then
    raise exception 'Report not found';
  end if;
end;
$$;

grant execute on function public.upvote_report(bigint) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-images',
  'report-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read report images" on storage.objects;
create policy "Anyone can read report images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'report-images');

drop policy if exists "Anyone can upload report images" on storage.objects;
create policy "Anyone can upload report images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'report-images');
