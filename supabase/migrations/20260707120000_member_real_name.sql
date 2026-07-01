-- ─────────── real name (visible only to the member + trainers) ───────────
-- profiles are world-readable, so the real name lives in a separate table whose
-- RLS only lets the owner and trainers read it.
create table if not exists public.member_private (
  id        uuid primary key references public.profiles(id) on delete cascade,
  real_name text
);
alter table public.member_private enable row level security;
drop policy if exists "member_private read" on public.member_private;
create policy "member_private read" on public.member_private for select to authenticated
  using (id = auth.uid() or public.is_trainer());
drop policy if exists "member_private write" on public.member_private;
create policy "member_private write" on public.member_private for all to authenticated
  using (id = auth.uid() or public.is_trainer())
  with check (id = auth.uid() or public.is_trainer());

-- capture real_name from signup metadata (extends the existing new-user trigger)
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, initials, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '회원'),
    coalesce(new.raw_user_meta_data->>'initials', '회원'),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#6E9B8E')
  );
  insert into public.metric_privacy (user_id, metric_key, visibility)
  select new.id, k, 'private'
  from unnest(array['score','weight','smm','pbf','bodyFatMass','bmi','bmr','visceral','tbw']) as k;
  insert into public.member_private (id, real_name)
  values (new.id, nullif(new.raw_user_meta_data->>'real_name', ''));
  return new;
end; $$;
