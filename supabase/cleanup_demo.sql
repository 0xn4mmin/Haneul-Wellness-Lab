-- Reset to a clean launch state: remove all demo "fake" community data —
-- the supporting cast (코치 하늘·이민서·조다온·김아리), every post/comment/like,
-- cheers, seeded chart comments, and all chat rooms + messages.
--
-- Run once in the SQL Editor. Safe to re-run. Keeps your own measurement data
-- (metric_readings/measurements/briefings) untouched.

-- supporting cast — deleting the auth user cascades their profile + all their
-- measurements, readings, posts, messages, room memberships, etc.
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',  -- 코치 하늘
  '22222222-2222-2222-2222-222222222222',  -- 이민서
  '33333333-3333-3333-3333-333333333333',  -- 조다온
  '44444444-4444-4444-4444-444444444444'   -- 김아리
);

-- wipe remaining community + chat content to empty
delete from public.posts;            -- cascades post_comments + post_likes
delete from public.member_cheers;
delete from public.chart_comments;
delete from public.chat_rooms;       -- cascades messages + room_members

-- verify (all should be 0)
-- select
--   (select count(*) from public.posts)         as posts,
--   (select count(*) from public.chat_rooms)    as rooms,
--   (select count(*) from public.member_cheers) as cheers,
--   (select count(*) from public.profiles where role='client' and id<>auth.uid()) as other_members;
