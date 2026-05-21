drop index if exists public.crew_members_slack_user_id_uniq;

create unique index crew_members_slack_user_id_uniq
on public.crew_members (slack_user_id)
where slack_user_id is not null and active = true;