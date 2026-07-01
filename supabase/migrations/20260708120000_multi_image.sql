-- multiple photos per post / message (KakaoTalk-style bundled send)
alter table public.posts    add column if not exists image_paths text[];
alter table public.messages add column if not exists image_paths text[];
