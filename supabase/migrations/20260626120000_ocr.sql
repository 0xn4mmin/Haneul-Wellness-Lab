-- InBody result-sheet OCR jobs.
-- Flow: user uploads a sheet image to the `inbody-results` bucket and inserts an
-- ocr_jobs row (status 'pending'). The Railway worker (service-role) claims it,
-- runs Claude vision → structured JSON, and writes it back as status 'review'.
-- The user then confirms in the app, which commits a measurement (source 'ocr').

create type ocr_status as enum ('pending', 'processing', 'review', 'committed', 'error');

create table public.ocr_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  image_path  text not null,                 -- storage key in the inbody-results bucket
  status      ocr_status not null default 'pending',
  result      jsonb,                          -- extracted {date, metrics..., segmental, detail}
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ocr_jobs_pending_idx on public.ocr_jobs (status, created_at);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger ocr_jobs_touch before update on public.ocr_jobs
  for each row execute function public.touch_updated_at();

-- RLS: owner manages their own jobs; the worker uses the service-role key (bypasses RLS).
alter table public.ocr_jobs enable row level security;
create policy "ocr read"   on public.ocr_jobs for select to authenticated using (user_id = auth.uid());
create policy "ocr insert" on public.ocr_jobs for insert to authenticated with check (user_id = auth.uid());
create policy "ocr update" on public.ocr_jobs for update to authenticated using (user_id = auth.uid());

-- so the app can watch status change live
alter publication supabase_realtime add table public.ocr_jobs;
