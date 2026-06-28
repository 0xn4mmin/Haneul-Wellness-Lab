-- Per-user goals for the dashboard rings (user sets their own targets).
create table public.metric_goals (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  metric_key text not null,
  target     numeric not null,
  primary key (user_id, metric_key)
);
alter table public.metric_goals enable row level security;
create policy "goals read"  on public.metric_goals for select to authenticated using (user_id = auth.uid() or public.is_trainer());
create policy "goals write" on public.metric_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
