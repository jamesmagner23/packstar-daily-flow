ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS message_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS head_contractor_rep text;