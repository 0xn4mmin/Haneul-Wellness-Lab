-- Image attachments on feed posts and chat messages.
alter table public.posts    add column if not exists image_path text;
alter table public.messages add column if not exists image_path text;

-- public bucket for post/chat images
insert into storage.buckets (id, name, public) values ('post-media', 'post-media', true)
  on conflict (id) do nothing;
create policy "post-media read" on storage.objects for select using (bucket_id = 'post-media');
create policy "post-media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
