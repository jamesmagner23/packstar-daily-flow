
CREATE TABLE public.daily_prompts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL,
  sent_for_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opener_used text NOT NULL,
  slack_channel text,
  slack_ts text,
  UNIQUE (supervisor_id, sent_for_date)
);

ALTER TABLE public.daily_prompts_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_daily_prompts_sent ON public.daily_prompts_sent
  FOR SELECT TO anon USING (true);
CREATE POLICY auth_select_daily_prompts_sent ON public.daily_prompts_sent
  FOR SELECT TO authenticated USING (true);
