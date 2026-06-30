-- price paid for a session package (KRW), for trainer revenue tracking
alter table public.class_packages add column if not exists amount integer;
