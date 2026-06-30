-- ─────────── trainer can record measurements on a member's behalf ───────────
-- measurements / metric_readings already allow trainer writes (or is_trainer()).
-- This only needs to let a trainer upload a result-sheet image into the member's
-- own folder so the member can view it later with the existing read policy.
drop policy if exists "inbody insert" on storage.objects;
create policy "inbody insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'inbody-results' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trainer()));
