-- ─────────── group isolation in the community feed ───────────
-- A member only sees posts from authors in their own cluster; trainers (and
-- posts authored by trainers) are always visible. BigDaS is isolated both ways.
create or replace function public.studio_cluster(p uuid) returns text
  language sql stable security definer set search_path = public as $$
  select case when (select studio from public.profiles where id = p) = 'BigDaS' then 'bigdas' else 'main' end;
$$;

create or replace function public.same_feed_cluster(p_author uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_trainer()
      or coalesce((select role from public.profiles where id = p_author), 'client') = 'trainer'
      or public.studio_cluster(auth.uid()) = public.studio_cluster(p_author);
$$;
grant execute on function public.same_feed_cluster(uuid) to authenticated;

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to authenticated
  using (public.same_feed_cluster(author_id));
