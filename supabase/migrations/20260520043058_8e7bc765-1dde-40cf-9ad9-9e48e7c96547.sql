create extension if not exists pg_trgm;

-- Fuzzy crew name lookup used by the Slack `profile`/`tickets` commands.
create or replace function public.find_crew_by_name(p_name text)
returns table (id uuid, name text, role text, employment_type text,
                default_supervisor_id uuid, similarity real)
language sql
stable
set search_path to public
as $$
  select cm.id, cm.name, cm.role, cm.employment_type, cm.default_supervisor_id,
         greatest(
           similarity(lower(cm.name), lower(p_name)),
           word_similarity(lower(p_name), lower(cm.name))
         ) as similarity
  from public.crew_members cm
  where cm.active = true
    and (
      cm.name ilike '%' || p_name || '%'
      or word_similarity(lower(p_name), lower(cm.name)) > 0.3
    )
  order by similarity desc
  limit 5;
$$;