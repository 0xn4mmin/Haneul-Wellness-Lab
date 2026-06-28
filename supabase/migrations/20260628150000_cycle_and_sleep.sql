-- User-set measurement cycle, and a daily sleep log the user fills in.

-- measurement cycle in days (default 4 weeks)
alter table public.profiles add column if not exists measure_cycle_days int not null default 28;

-- daily sleep log
create table public.sleep_logs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date    date not null,
  hours   numeric not null,
  primary key (user_id, date)
);
alter table public.sleep_logs enable row level security;
create policy "sleep read"  on public.sleep_logs for select to authenticated using (user_id = auth.uid() or public.is_trainer());
create policy "sleep write" on public.sleep_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
