
-- 1. Storage bucket for induction evidence (mirror ticket-evidence)
insert into storage.buckets (id, name, public)
values ('induction-evidence', 'induction-evidence', false)
on conflict (id) do nothing;

create policy "induction_evidence_admin_all"
  on storage.objects for all
  using (bucket_id = 'induction-evidence' and current_user_role() = 'admin')
  with check (bucket_id = 'induction-evidence' and current_user_role() = 'admin');

create policy "induction_evidence_supervisor_read"
  on storage.objects for select
  using (bucket_id = 'induction-evidence' and current_user_role() = 'supervisor');

create policy "induction_evidence_crew_read_own"
  on storage.objects for select
  using (
    bucket_id = 'induction-evidence'
    and current_user_role() = 'crew'
    and (storage.foldername(name))[1] = current_user_person_id()::text
  );

-- 2. Supervisor slack-id helper
create or replace function public.get_supervisor_slack_id(p_supervisor_person_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select slack_user_id from public.crew_members where id = p_supervisor_person_id
$$;

-- 3. Seed MVRC site if not present
insert into public.sites (job_id, name, head_contractor, head_contractor_contact, induction_lead_time_days)
select
  (select id from public.projects where name ilike '%MVRC%' or code ilike '%MVRC%' limit 1),
  'MVRC',
  'Symal',
  'TBD',
  3
where not exists (select 1 from public.sites where name = 'MVRC');

-- 4. Log tables for cron + allocation-hook debounce
create table if not exists public.induction_expiry_notice_log (
  person_induction_id uuid not null,
  expires_date date not null,
  band text not null,
  sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (person_induction_id, sent_on)
);
alter table public.induction_expiry_notice_log enable row level security;
create policy "admin_all_induction_expiry_notice_log"
  on public.induction_expiry_notice_log for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create table if not exists public.eligibility_alert_log (
  person_id uuid not null,
  site_id uuid not null,
  allocation_date date not null,
  sent_at timestamptz not null default now(),
  primary key (person_id, site_id, allocation_date)
);
alter table public.eligibility_alert_log enable row level security;
create policy "admin_all_eligibility_alert_log"
  on public.eligibility_alert_log for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- 5. Supervisor write access on person_inductions for own crew
create policy "supervisor_write_person_inductions"
  on public.person_inductions for insert
  with check (
    current_user_role() = 'supervisor'
    and exists (
      select 1 from public.crew_members cm
      where cm.id = person_inductions.person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  );

create policy "supervisor_update_person_inductions"
  on public.person_inductions for update
  using (
    current_user_role() = 'supervisor'
    and exists (
      select 1 from public.crew_members cm
      where cm.id = person_inductions.person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  )
  with check (
    current_user_role() = 'supervisor'
    and exists (
      select 1 from public.crew_members cm
      where cm.id = person_inductions.person_id
        and cm.default_supervisor_id = current_user_person_id()
    )
  );

-- 6. Allocation eligibility trigger — fires pg_net call to TSS hook
create or replace function public.trigger_allocation_eligibility_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://project--ddbf9551-8559-4dc0-9584-8960c16a8139.lovable.app/api/public/hooks/allocation-eligibility',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'allocation_id', new.id,
      'person_id', new.person_id,
      'job_id', new.job_id,
      'classification_id', new.classification_id,
      'supervisor_id', new.supervisor_id,
      'allocation_date', new.allocation_date
    )
  );
  return new;
exception when others then
  -- never block the allocation write because of a notification failure
  return new;
end;
$$;

drop trigger if exists daily_allocations_eligibility_check on public.daily_allocations;
create trigger daily_allocations_eligibility_check
after insert or update of person_id, job_id, allocation_date, classification_id
on public.daily_allocations
for each row execute function public.trigger_allocation_eligibility_check();
