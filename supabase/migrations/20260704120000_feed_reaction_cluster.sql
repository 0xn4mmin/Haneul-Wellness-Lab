-- ─────────── group isolation for feed reactions ───────────
-- Even on a trainer's post (visible to everyone), a like/comment is only
-- visible to viewers in the same cluster as the person who left it. Trainer
-- reactions stay visible to all; trainers see everything. This keeps BigDaS
-- and the main cluster from seeing each other's engagement. Like counts /
-- comment threads are computed from these embedded rows, so they scope per
-- viewer automatically.
drop policy if exists "post comments read" on public.post_comments;
create policy "post comments read" on public.post_comments for select to authenticated
  using (public.same_feed_cluster(author_id));

drop policy if exists "post likes read" on public.post_likes;
create policy "post likes read" on public.post_likes for select to authenticated
  using (public.same_feed_cluster(user_id));
