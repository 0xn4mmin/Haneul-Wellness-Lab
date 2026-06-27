-- AI coach briefings, generated at measurement time (cached) and on manual
-- "다시 생성" (rate-limited to 2 per rolling 7 days, enforced in the DB).
-- The Railway worker processes briefing_jobs with Claude and writes a row into
-- briefings; the app shows the latest one (falling back to the rule-based brief
-- when none exists yet).

create type briefing_source as enum ('measurement', 'manual');
create type briefing_job_status as enum ('pending', 'processing', 'done', 'error');

create table public.briefings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  source     briefing_source not null,
  focus      text not null,              -- 관점 라벨 (예: 종합 진행)
  summary    text not null,              -- 1문단 요약
  actions    jsonb not null,             -- string[] (3개 액션)
  created_at timestamptz not null default now()
);
create index briefings_latest_idx on public.briefings (user_id, created_at desc);

create table public.briefing_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  source     briefing_source not null,
  status     briefing_job_status not null default 'pending',
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index briefing_jobs_pending_idx on public.briefing_jobs (status, created_at);
create trigger briefing_jobs_touch before update on public.briefing_jobs
  for each row execute function public.touch_updated_at();

-- ── RLS ──
alter table public.briefings enable row level security;
alter table public.briefing_jobs enable row level security;
-- briefings: owner (or trainer) reads; only the worker (service role) writes.
create policy "briefings read" on public.briefings for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());
-- briefing_jobs: owner reads own; inserts go through request_briefing() only.
create policy "briefing jobs read" on public.briefing_jobs for select to authenticated
  using (user_id = auth.uid());

-- ── rate-limited request RPC (security definer → enforces the cap server-side) ──
create or replace function public.request_briefing(p_source briefing_source)
returns jsonb language plpgsql security definer set search_path = public as $$
declare used int := 0; jid uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if p_source = 'manual' then
    select count(*) into used from briefings
      where user_id = auth.uid() and source = 'manual' and created_at > now() - interval '7 days';
    if used >= 2 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited', 'used', used, 'limit', 2);
    end if;
  end if;
  insert into briefing_jobs (user_id, source) values (auth.uid(), p_source) returning id into jid;
  return jsonb_build_object('ok', true, 'job_id', jid, 'used', used, 'limit', 2);
end $$;

grant execute on function public.request_briefing(briefing_source) to authenticated;

-- live updates for the dashboard
alter publication supabase_realtime add table public.briefings;
