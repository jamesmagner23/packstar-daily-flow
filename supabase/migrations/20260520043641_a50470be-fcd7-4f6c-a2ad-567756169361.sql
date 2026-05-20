alter table public.crew_members add column if not exists slack_user_id text;
create unique index if not exists crew_members_slack_user_id_uniq
  on public.crew_members(slack_user_id) where slack_user_id is not null;