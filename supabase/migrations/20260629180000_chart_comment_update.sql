-- Let an author edit their own chart comment / coach note (used by the trainer
-- studio to revise notes already sent to a member).
create policy "chart comments update" on public.chart_comments for update to authenticated
  using (author_id = auth.uid() or public.is_trainer())
  with check (author_id = auth.uid() or public.is_trainer());
