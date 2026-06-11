
-- Wrap flow schema additions
ALTER TABLE public.daily_allocations
  ADD COLUMN IF NOT EXISTS planned_allocation_id uuid NULL
    REFERENCES public.daily_allocations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS daily_allocations_planned_allocation_id_idx
  ON public.daily_allocations(planned_allocation_id);

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS allocation_count integer NULL,
  ADD COLUMN IF NOT EXISTS variance_count integer NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS submitted_by uuid NULL;
