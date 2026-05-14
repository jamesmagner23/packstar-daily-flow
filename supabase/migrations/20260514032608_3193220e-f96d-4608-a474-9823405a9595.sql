CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_supervisor_date_uniq
  ON public.daily_reports (supervisor_id, report_date)
  WHERE supervisor_id IS NOT NULL;