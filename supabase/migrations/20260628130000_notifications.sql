-- Notifications. DB triggers create a row for the recipient whenever someone
-- comments on their post, replies to their comment, cheers them, or a coach
-- leaves overall feedback. Users read/update only their own.

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- recipient
  actor_id   uuid references public.profiles(id) on delete set null,
  type       text not null,            -- comment | reply | cheer | feedback
  text       text not null,            -- preformatted message
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications read"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications update" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "notifications delete" on public.notifications for delete to authenticated using (user_id = auth.uid());
-- inserts come only from the triggers below (security definer), never from clients

-- helper: actor display name
create or replace function public._actor_name(p_id uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(name, '회원') from public.profiles where id = p_id;
$$;

-- post comment / reply → notify the post author (and the parent-comment author)
create or replace function public.notify_post_comment() returns trigger
  language plpgsql security definer set search_path = public as $$
declare post_author uuid; parent_author uuid; actor text := public._actor_name(new.author_id);
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is not null and post_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, text)
    values (post_author, new.author_id, 'comment', actor || '님이 회원님의 게시물에 댓글을 남겼어요.');
  end if;
  if new.parent_id is not null then
    select author_id into parent_author from public.post_comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id and parent_author <> post_author then
      insert into public.notifications (user_id, actor_id, type, text)
      values (parent_author, new.author_id, 'reply', actor || '님이 회원님의 댓글에 답글을 달았어요.');
    end if;
  end if;
  return new;
end $$;
create trigger on_post_comment after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- cheer → notify the target
create or replace function public.notify_cheer() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor text := public._actor_name(new.author_id);
begin
  if new.target_user_id <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, text)
    values (new.target_user_id, new.author_id, 'cheer', actor || '님이 응원을 남겼어요.');
  end if;
  return new;
end $$;
create trigger on_cheer after insert on public.member_cheers
  for each row execute function public.notify_cheer();

-- overall coach feedback → notify the chart owner
create or replace function public.notify_feedback() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor text := public._actor_name(new.author_id);
begin
  if new.metric_key = 'overall' and new.owner_id <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, text)
    values (new.owner_id, new.author_id, 'feedback', actor || '님이 코치 피드백을 남겼어요.');
  end if;
  return new;
end $$;
create trigger on_feedback after insert on public.chart_comments
  for each row execute function public.notify_feedback();

alter publication supabase_realtime add table public.notifications;
