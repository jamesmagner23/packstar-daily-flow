
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =========================================================
-- procure_email_log: audit trail for all PO/RFQ/inbound mail
-- =========================================================
CREATE TABLE public.procure_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  kind text NOT NULL CHECK (kind IN ('rfq','po','quote','other')),
  subject text,
  recipient_email text,
  sender_email text,
  gmail_message_id text UNIQUE,
  gmail_thread_id text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_procure_email_log_supplier ON public.procure_email_log(supplier_id);
CREATE INDEX idx_procure_email_log_created ON public.procure_email_log(created_at DESC);

ALTER TABLE public.procure_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_procure_email_log" ON public.procure_email_log
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_procure_email_log" ON public.procure_email_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- procure_quotes: one row per parsed inbound supplier email
-- =========================================================
CREATE TABLE public.procure_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text,
  subject text,
  sender_email text,
  received_at timestamptz NOT NULL DEFAULT now(),
  body_text text,
  body_snippet text,
  attachment_paths text[] DEFAULT '{}'::text[],
  attachment_filenames text[] DEFAULT '{}'::text[],
  extracted_json jsonb,
  extracted_total numeric,
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','done','failed','skipped')),
  extraction_error text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewed','converted','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_procure_quotes_supplier ON public.procure_quotes(supplier_id);
CREATE INDEX idx_procure_quotes_status ON public.procure_quotes(status);
CREATE INDEX idx_procure_quotes_received ON public.procure_quotes(received_at DESC);

CREATE TRIGGER trg_procure_quotes_updated_at
  BEFORE UPDATE ON public.procure_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.procure_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_procure_quotes" ON public.procure_quotes
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_procure_quotes" ON public.procure_quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- procure-quotes storage bucket
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('procure-quotes', 'procure-quotes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "procure_quotes_anon_select" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'procure-quotes');
CREATE POLICY "procure_quotes_anon_insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'procure-quotes');
CREATE POLICY "procure_quotes_anon_update" ON storage.objects
  FOR UPDATE TO anon USING (bucket_id = 'procure-quotes');
CREATE POLICY "procure_quotes_anon_delete" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'procure-quotes');

CREATE POLICY "procure_quotes_auth_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'procure-quotes')
  WITH CHECK (bucket_id = 'procure-quotes');
