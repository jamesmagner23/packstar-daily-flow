
-- Reference data
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  head_contractor text not null,
  principal text,
  package text,
  contract_date date,
  contract_type text,
  site_address text,
  working_days text,
  working_hours_start time,
  working_hours_end time,
  defects_liability_period_months int,
  max_daily_delay_costs_aud numeric,
  max_total_delay_costs_pct_of_contract numeric,
  liquidated_damages_cap_pct_of_contract numeric,
  pacc_rep jsonb,
  head_contractor_rep jsonb,
  additional_qualifying_causes_of_delay text[],
  payment_claim_dates text,
  payment_claim_method text,
  raw_contract_json jsonb,
  expected_daily_revenue_aud numeric default 5000,
  active boolean default true,
  created_at timestamptz default now()
);

create table public.separable_portions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  commencement date,
  completion date,
  ld_per_day_aud numeric
);

create table public.boq_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  ref text not null,
  category text not null,
  description text not null,
  material text,
  diameter_mm int,
  depth_band_m numeric,
  pit_type text,
  pit_dimensions_mm text,
  unit text not null,
  rate numeric not null
);

create table public.pits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  pit_id text not null,
  separable_portion_code text,
  status text default 'not_started',
  unique (project_id, pit_id)
);

create table public.variation_clauses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  claim_type text not null,
  clause_ref text not null,
  early_warning_deadline_bd int,
  notice_deadline_bd int,
  full_report_deadline_bd int,
  particulars_deadline_bd int,
  notice_before_complying boolean default false,
  condition_precedent boolean default true,
  notes text
);

create table public.variation_triggers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  keywords text[] not null,
  claim_type text not null,
  clause_ref text not null
);

create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  role text not null,
  cost_rate_nt numeric,
  cost_rate_ot numeric,
  active boolean default true
);

create table public.plant_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  plant_id_code text not null,
  description text,
  tonnage_class text,
  cost_rate_nt numeric,
  cost_rate_ot numeric,
  active boolean default true,
  unique (project_id, plant_id_code)
);

create table public.supervisors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  slack_user_id text not null,
  email text,
  active boolean default true
);

-- Operational data
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  supervisor_id uuid references public.supervisors(id),
  report_date date not null,
  raw_transcript text,
  structured jsonb,
  works_completed jsonb,
  crew_hours jsonb,
  plant_hours jsonb,
  productivity_pct numeric,
  productivity_note text,
  revenue_aud numeric,
  cost_aud numeric,
  margin_aud numeric,
  complete boolean default false,
  email_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (supervisor_id, report_date)
);

create table public.variation_flags (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid references public.daily_reports(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  claim_type text not null,
  clause_ref text not null,
  trigger_phrase text,
  description text,
  notice_deadline_bd int,
  deadline_at timestamptz,
  notice_sent_at timestamptz,
  duration_impact_hours numeric,
  symal_rep_saw boolean,
  photo_urls text[],
  status text default 'flagged',
  created_at timestamptz default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  variation_flag_id uuid references public.variation_flags(id) on delete cascade,
  storage_path text not null,
  slack_file_id text,
  created_at timestamptz default now()
);

-- Enable RLS on everything
alter table public.projects enable row level security;
alter table public.separable_portions enable row level security;
alter table public.boq_lines enable row level security;
alter table public.pits enable row level security;
alter table public.variation_clauses enable row level security;
alter table public.variation_triggers enable row level security;
alter table public.crew_members enable row level security;
alter table public.plant_items enable row level security;
alter table public.supervisors enable row level security;
alter table public.daily_reports enable row level security;
alter table public.variation_flags enable row level security;
alter table public.photos enable row level security;

-- v0.1 pilot: any signed-in PACC user can read/write everything
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'projects','separable_portions','boq_lines','pits','variation_clauses',
    'variation_triggers','crew_members','plant_items','supervisors',
    'daily_reports','variation_flags','photos'
  ])
  loop
    execute format('create policy "auth_select_%1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "auth_insert_%1$s" on public.%1$s for insert to authenticated with check (true);', t);
    execute format('create policy "auth_update_%1$s" on public.%1$s for update to authenticated using (true) with check (true);', t);
    execute format('create policy "auth_delete_%1$s" on public.%1$s for delete to authenticated using (true);', t);
  end loop;
end $$;

-- Storage bucket for variation photos
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', false)
on conflict (id) do nothing;

create policy "auth_view_report_photos" on storage.objects
  for select to authenticated using (bucket_id = 'report-photos');
create policy "auth_upload_report_photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'report-photos');
