
-- ============= TABLES =============
create table public.daily_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_date date not null,
  person_id uuid references public.crew_members(id) not null,
  job_id uuid references public.projects(id) not null,
  classification_id uuid references public.classifications(id),
  supervisor_id uuid references public.crew_members(id),
  plant_asset_ids uuid[] default '{}',
  planned_hours numeric(4,2),
  actual_hours numeric(4,2),
  source text not null check (source in ('planned','wrap_actual','timesheet_claimed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.daily_allocations (allocation_date, person_id);
create index on public.daily_allocations (job_id, allocation_date);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type text not null check (type in ('ticket','licence','training','medical'))
);

create table public.person_competencies (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.crew_members(id) not null,
  competency_id uuid references public.competencies(id) not null,
  issued_date date,
  expiry_date date,
  evidence_url text,
  created_at timestamptz not null default now(),
  unique (person_id, competency_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.projects(id),
  name text not null,
  head_contractor text,
  head_contractor_contact text,
  induction_lead_time_days int default 3,
  active boolean default true
);

create table public.person_inductions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.crew_members(id) not null,
  site_id uuid references public.sites(id) not null,
  status text not null check (status in ('not_booked','booked','completed','expiring','expired')),
  booked_for_date date,
  completed_date date,
  expires_date date,
  evidence_url text,
  updated_at timestamptz not null default now(),
  unique (person_id, site_id)
);

create table public.site_requirements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) not null,
  competency_id uuid references public.competencies(id),
  induction_required boolean default true
);

create table public.task_requirements (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  competency_id uuid references public.competencies(id) not null
);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.crew_members(id) not null,
  work_date date not null,
  job_id uuid references public.projects(id),
  claimed_hours numeric(4,2) not null,
  submitted_via text default 'slack',
  status text default 'submitted' check (status in ('submitted','approved','rejected','flagged')),
  created_at timestamptz not null default now(),
  unique (person_id, work_date, job_id)
);

create table public.dockets (
  id uuid primary key default gen_random_uuid(),
  allocation_date date not null,
  job_id uuid references public.projects(id) not null,
  source_daily_report_id uuid references public.daily_reports(id),
  captured_hours_by_person jsonb not null,
  created_at timestamptz not null default now()
);

create type public.user_role as enum ('admin','supervisor','crew');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id uuid references public.crew_members(id),
  role public.user_role not null
);

-- ============= FUNCTIONS =============
create or replace function public.check_eligibility(
  p_person_id uuid,
  p_site_id uuid,
  p_task_type text,
  p_on_date date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing_competencies jsonb;
  v_induction_status text;
  v_induction_booked_for date;
  v_lead_time int;
  v_earliest_eligible date;
begin
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'reason', reason)), '[]'::jsonb)
  into v_missing_competencies
  from (
    select competency_id, 'site_required' as reason from public.site_requirements where site_id = p_site_id and competency_id is not null
    union
    select competency_id, 'task_required' as reason from public.task_requirements where task_type = p_task_type
  ) req
  join public.competencies c on c.id = req.competency_id
  where not exists (
    select 1 from public.person_competencies pc
    where pc.person_id = p_person_id
      and pc.competency_id = req.competency_id
      and (pc.expiry_date is null or pc.expiry_date >= p_on_date)
  );

  select status, booked_for_date into v_induction_status, v_induction_booked_for
  from public.person_inductions
  where person_id = p_person_id and site_id = p_site_id;

  select induction_lead_time_days into v_lead_time from public.sites where id = p_site_id;

  if v_induction_status = 'completed' then
    v_earliest_eligible := p_on_date;
  elsif v_induction_status = 'booked' and v_induction_booked_for is not null then
    v_earliest_eligible := v_induction_booked_for;
  else
    v_earliest_eligible := current_date + (coalesce(v_lead_time, 3) || ' days')::interval;
  end if;

  return jsonb_build_object(
    'eligible', (jsonb_array_length(v_missing_competencies) = 0 and v_induction_status = 'completed'),
    'missing_competencies', v_missing_competencies,
    'induction_status', coalesce(v_induction_status, 'not_booked'),
    'earliest_eligible_date', v_earliest_eligible
  );
end;
$$;

create or replace function public.reconcile_timesheets(p_work_date date)
returns table (person_id uuid, job_id uuid, claimed numeric, dockets_say numeric, variance numeric)
language sql
stable
set search_path = public
as $$
  select
    t.person_id,
    t.job_id,
    t.claimed_hours,
    coalesce((d.captured_hours_by_person ->> t.person_id::text)::numeric, 0) as dockets_say,
    t.claimed_hours - coalesce((d.captured_hours_by_person ->> t.person_id::text)::numeric, 0) as variance
  from public.timesheets t
  left join public.dockets d on d.allocation_date = t.work_date and d.job_id = t.job_id
  where t.work_date = p_work_date
    and abs(t.claimed_hours - coalesce((d.captured_hours_by_person ->> t.person_id::text)::numeric, 0)) > 0.5;
$$;

create or replace function public.insert_docket(
  p_allocation_date date,
  p_job_id uuid,
  p_source_daily_report_id uuid,
  p_captured_hours_by_person jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_docket_id uuid;
begin
  insert into public.dockets (allocation_date, job_id, source_daily_report_id, captured_hours_by_person)
  values (p_allocation_date, p_job_id, p_source_daily_report_id, p_captured_hours_by_person)
  returning id into v_docket_id;
  return v_docket_id;
end;
$$;

grant execute on function public.insert_docket(date, uuid, uuid, jsonb) to authenticated;

-- ============= RLS HELPERS =============
create or replace function public.current_user_role() returns text
language sql security definer stable set search_path = public
as $$ select role::text from public.user_roles where user_id = auth.uid() limit 1 $$;

create or replace function public.current_user_person_id() returns uuid
language sql security definer stable set search_path = public
as $$ select person_id from public.user_roles where user_id = auth.uid() limit 1 $$;

-- ============= ENABLE RLS =============
alter table public.daily_allocations enable row level security;
alter table public.competencies enable row level security;
alter table public.person_competencies enable row level security;
alter table public.sites enable row level security;
alter table public.person_inductions enable row level security;
alter table public.site_requirements enable row level security;
alter table public.task_requirements enable row level security;
alter table public.timesheets enable row level security;
alter table public.dockets enable row level security;
alter table public.user_roles enable row level security;

-- ============= USER_ROLES SELF-READ =============
create policy user_read_own_role on public.user_roles
  for select using (user_id = auth.uid());

-- ============= ADMIN: full access =============
create policy admin_all on public.daily_allocations for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.competencies for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.person_competencies for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.sites for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.person_inductions for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.site_requirements for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.task_requirements for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.timesheets for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.dockets for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy admin_all on public.user_roles for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- ============= SUPERVISOR: read =============
create policy supervisor_read on public.daily_allocations for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.competencies for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.person_competencies for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.sites for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.person_inductions for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.site_requirements for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.task_requirements for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.timesheets for select using (public.current_user_role() = 'supervisor');
create policy supervisor_read on public.dockets for select using (public.current_user_role() = 'supervisor');

-- ============= SUPERVISOR: write own crew =============
create policy supervisor_write_daily_allocations on public.daily_allocations
  for insert with check (public.current_user_role() = 'supervisor' and supervisor_id = public.current_user_person_id());

create policy supervisor_update_daily_allocations on public.daily_allocations
  for update using (public.current_user_role() = 'supervisor' and supervisor_id = public.current_user_person_id())
  with check (supervisor_id = public.current_user_person_id());

create policy supervisor_write_timesheets on public.timesheets
  for insert with check (
    public.current_user_role() = 'supervisor'
    and exists (
      select 1 from public.daily_allocations da
      where da.person_id = timesheets.person_id
        and da.allocation_date = timesheets.work_date
        and da.supervisor_id = public.current_user_person_id()
    )
  );

create policy supervisor_update_timesheets on public.timesheets
  for update using (
    public.current_user_role() = 'supervisor'
    and exists (
      select 1 from public.daily_allocations da
      where da.person_id = timesheets.person_id
        and da.allocation_date = timesheets.work_date
        and da.supervisor_id = public.current_user_person_id()
    )
  );

-- ============= CREW: read own =============
create policy crew_read_own on public.daily_allocations for select using (public.current_user_role() = 'crew' and person_id = public.current_user_person_id());
create policy crew_read_own on public.timesheets for select using (public.current_user_role() = 'crew' and person_id = public.current_user_person_id());
create policy crew_read_own on public.person_competencies for select using (public.current_user_role() = 'crew' and person_id = public.current_user_person_id());
create policy crew_read_own on public.person_inductions for select using (public.current_user_role() = 'crew' and person_id = public.current_user_person_id());

-- ============= updated_at triggers =============
create trigger trg_daily_allocations_updated before update on public.daily_allocations
  for each row execute function public.update_updated_at_column();
create trigger trg_person_inductions_updated before update on public.person_inductions
  for each row execute function public.update_updated_at_column();
