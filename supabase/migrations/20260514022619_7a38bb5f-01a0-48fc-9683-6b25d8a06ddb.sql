CREATE UNIQUE INDEX IF NOT EXISTS variation_flags_natural_key_uidx
ON public.variation_flags (daily_report_id, claim_type, clause_ref, COALESCE(trigger_phrase, ''));