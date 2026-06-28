-- Challenge participation: the creator invites members, each member sets their
-- own goal (absolute target or relative change) on one of the challenge metrics,
-- and members compare progress. Private challenges are visible only to members.

create table public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'joined',   -- 'invited' | 'joined'
  created_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.challenge_goals (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  metric_key   text not null,
  mode         text not null,        -- 'absolute' (reach value) | 'relative' (change by delta)
  target       numeric not null,
  baseline     numeric,              -- the user's value when the goal was set
  created_at   timestamptz not null default now(),
  primary key (challenge_id, user_id, metric_key)
);

alter table public.challenge_members enable row level security;
alter table public.challenge_goals   enable row level security;

-- is the caller a member (or the creator) of this challenge? (definer → no RLS recursion)
create or replace function public.is_challenge_member(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.challenge_members where challenge_id = cid and user_id = auth.uid())
      or exists(select 1 from public.challenges where id = cid and created_by = auth.uid());
$$;

-- private challenges only visible to the creator + members
drop policy if exists "challenges read" on public.challenges;
create policy "challenges read" on public.challenges for select to authenticated using (
  scope = 'public' or created_by = auth.uid() or public.is_challenge_member(id)
);

create policy "cmembers read" on public.challenge_members for select to authenticated
  using (public.is_challenge_member(challenge_id));
create policy "cmembers insert" on public.challenge_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists(select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid())
  );
create policy "cmembers delete" on public.challenge_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists(select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid())
  );

create policy "cgoals read" on public.challenge_goals for select to authenticated
  using (public.is_challenge_member(challenge_id));
create policy "cgoals write" on public.challenge_goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_challenge_member(challenge_id));

-- creator auto-joins their own challenge
create or replace function public.challenge_autojoin() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.challenge_members (challenge_id, user_id, status)
    values (new.id, new.created_by, 'joined') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_challenge_created after insert on public.challenges
  for each row execute function public.challenge_autojoin();

-- notify a member when they're invited
create or replace function public.notify_challenge_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare ctitle text;
begin
  if new.user_id <> auth.uid() then
    select title into ctitle from public.challenges where id = new.challenge_id;
    insert into public.notifications (user_id, actor_id, type, text, ref)
    values (new.user_id, auth.uid(), 'challenge',
            public._actor_name(auth.uid()) || '님이 ‘' || coalesce(ctitle, '챌린지') || '’ 챌린지에 초대했어요.',
            new.challenge_id::text);
  end if;
  return new;
end $$;
create trigger on_challenge_invite after insert on public.challenge_members
  for each row execute function public.notify_challenge_invite();

-- per-member progress for a challenge (bypasses per-metric privacy: joining a
-- challenge means sharing that metric with co-members). Caller must be a member.
create or replace function public.get_challenge_progress(p_challenge uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_challenge_member(p_challenge) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'user_id', g.user_id, 'name', p.name, 'initials', p.initials,
      'color', p.avatar_color, 'photo_path', p.photo_path,
      'metric_key', g.metric_key, 'mode', g.mode, 'target', g.target, 'baseline', g.baseline,
      'current', (select value from public.metric_readings mr
                   where mr.user_id = g.user_id and mr.metric_key = g.metric_key
                   order by mr.date desc limit 1)
    ) as r
    from public.challenge_goals g join public.profiles p on p.id = g.user_id
    where g.challenge_id = p_challenge
    order by g.created_at
  ) sub;
  return result;
end $$;
grant execute on function public.get_challenge_progress(uuid) to authenticated;
