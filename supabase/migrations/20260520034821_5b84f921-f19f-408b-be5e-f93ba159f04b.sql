-- 1. Additive columns on crew_members
alter table public.crew_members
  add column if not exists default_supervisor_id uuid references public.supervisors(id),
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists notes text;

-- 2. Private bucket for ticket evidence
insert into storage.buckets (id, name, public)
values ('ticket-evidence', 'ticket-evidence', false)
on conflict (id) do nothing;

-- Storage RLS policies (drop-and-recreate for idempotency)
drop policy if exists "ticket_evidence_admin_all" on storage.objects;
drop policy if exists "ticket_evidence_supervisor_read" on storage.objects;
drop policy if exists "ticket_evidence_crew_read_own" on storage.objects;

create policy "ticket_evidence_admin_all"
  on storage.objects for all
  using (bucket_id = 'ticket-evidence' and public.current_user_role() = 'admin')
  with check (bucket_id = 'ticket-evidence' and public.current_user_role() = 'admin');

create policy "ticket_evidence_supervisor_read"
  on storage.objects for select
  using (bucket_id = 'ticket-evidence' and public.current_user_role() = 'supervisor');

create policy "ticket_evidence_crew_read_own"
  on storage.objects for select
  using (
    bucket_id = 'ticket-evidence'
    and public.current_user_role() = 'crew'
    and (storage.foldername(name))[1] = public.current_user_person_id()::text
  );

-- 3. Seed competencies library
insert into public.competencies (code, name, type) values
  ('WHITE_CARD',         'Construction Induction (White Card)', 'ticket'),
  ('HR_LICENCE',         'Heavy Rigid Licence',                 'licence'),
  ('MR_LICENCE',         'Medium Rigid Licence',                'licence'),
  ('EWP_BELOW11',        'EWP < 11m (Yellow Card)',             'ticket'),
  ('EWP_LICENCE',        'WP Licence (>11m)',                   'licence'),
  ('TMI',                'Traffic Management Implementer',      'ticket'),
  ('TC',                 'Traffic Controller',                  'ticket'),
  ('CONFINED_SPACE',     'Confined Space Entry',                'ticket'),
  ('WORKING_AT_HEIGHTS', 'Working at Heights',                  'ticket'),
  ('FIRST_AID',          'First Aid (HLTAID011)',               'ticket'),
  ('CPR',                'CPR (HLTAID009)',                     'ticket'),
  ('EXCAVATOR_TICKET',   'Excavator VOC',                       'ticket'),
  ('SKID_STEER',         'Skid Steer VOC',                      'ticket'),
  ('ASBESTOS_AWARE',     'Asbestos Awareness',                  'training'),
  ('SILICA_AWARE',       'Silica Awareness',                    'training')
on conflict (code) do nothing;

-- Unique constraint for upsert on (person_id, competency_id) in person_competencies
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'person_competencies_person_competency_unique'
  ) then
    alter table public.person_competencies
      add constraint person_competencies_person_competency_unique
      unique (person_id, competency_id);
  end if;
end $$;