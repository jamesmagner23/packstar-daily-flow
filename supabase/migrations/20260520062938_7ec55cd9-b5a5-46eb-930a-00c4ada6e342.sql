alter table public.sites
  add column if not exists induction_platform text,
  add column if not exists induction_url text;