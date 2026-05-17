ALTER TABLE public.daily_reports
ADD COLUMN IF NOT EXISTS edits jsonb NOT NULL DEFAULT '[]'::jsonb;