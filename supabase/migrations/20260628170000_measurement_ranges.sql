-- Personal standard/normal ranges printed on the InBody sheet, per metric.
-- Used to judge Good/Bad instead of generic ranges.
alter table public.measurements add column if not exists ranges jsonb;
