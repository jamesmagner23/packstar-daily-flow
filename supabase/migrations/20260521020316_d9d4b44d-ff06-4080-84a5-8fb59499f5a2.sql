-- Tables
create table public.plant_prestart_templates (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.plant_items(id) on delete cascade,
  checklist_items jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.plant_prestart_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.plant_items(id) on delete cascade,
  operator_person_id uuid not null references public.crew_members(id),
  prestart_date date not null,
  checklist_responses jsonb not null,
  issues_raised text,
  photo_url text,
  completed_at timestamptz not null default now(),
  unique (asset_id, prestart_date)
);

create table public.plant_service_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.plant_items(id) on delete cascade,
  service_date date not null,
  service_type text,
  hours_at_service numeric,
  notes text,
  invoice_url text,
  created_at timestamptz not null default now()
);

create index plant_prestart_logs_asset_date_idx on public.plant_prestart_logs (asset_id, prestart_date desc);
create index plant_service_logs_asset_date_idx on public.plant_service_logs (asset_id, service_date desc);

-- RLS
alter table public.plant_prestart_templates enable row level security;
alter table public.plant_prestart_logs enable row level security;
alter table public.plant_service_logs enable row level security;

-- Templates
create policy admin_all_plant_prestart_templates on public.plant_prestart_templates
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy supervisor_read_plant_prestart_templates on public.plant_prestart_templates
  for select using (current_user_role() = 'supervisor');

-- Logs
create policy admin_all_plant_prestart_logs on public.plant_prestart_logs
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy supervisor_read_plant_prestart_logs on public.plant_prestart_logs
  for select using (current_user_role() = 'supervisor');
create policy supervisor_write_plant_prestart_logs on public.plant_prestart_logs
  for insert with check (
    current_user_role() = 'supervisor' and exists (
      select 1 from public.crew_members cm
      where cm.id = plant_prestart_logs.operator_person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  );
create policy supervisor_update_plant_prestart_logs on public.plant_prestart_logs
  for update using (
    current_user_role() = 'supervisor' and exists (
      select 1 from public.crew_members cm
      where cm.id = plant_prestart_logs.operator_person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  ) with check (
    current_user_role() = 'supervisor' and exists (
      select 1 from public.crew_members cm
      where cm.id = plant_prestart_logs.operator_person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  );
create policy crew_read_own_plant_prestart_logs on public.plant_prestart_logs
  for select using (current_user_role() = 'crew' and operator_person_id = current_user_person_id());

-- Service logs
create policy admin_all_plant_service_logs on public.plant_service_logs
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy supervisor_read_plant_service_logs on public.plant_service_logs
  for select using (current_user_role() = 'supervisor');

-- Storage bucket
insert into storage.buckets (id, name, public) values ('prestart-evidence', 'prestart-evidence', true)
  on conflict (id) do nothing;

create policy "prestart-evidence public read" on storage.objects
  for select using (bucket_id = 'prestart-evidence');
create policy "prestart-evidence auth write" on storage.objects
  for insert with check (bucket_id = 'prestart-evidence');
create policy "prestart-evidence auth update" on storage.objects
  for update using (bucket_id = 'prestart-evidence');

-- Seed default templates for existing plant_items
insert into public.plant_prestart_templates (asset_id, checklist_items)
select pi.id, '[
  {"id": "fluids", "label": "Fluid levels checked", "type": "pass_fail"},
  {"id": "tracks_tyres", "label": "Tracks or tyres", "type": "pass_fail"},
  {"id": "lights", "label": "Lights and beacon", "type": "pass_fail"},
  {"id": "leaks", "label": "Any leaks", "type": "pass_fail"},
  {"id": "hours", "label": "Hour meter reading", "type": "number"},
  {"id": "notes", "label": "Notes or issues", "type": "text"}
]'::jsonb
from public.plant_items pi
where not exists (select 1 from public.plant_prestart_templates t where t.asset_id = pi.id);