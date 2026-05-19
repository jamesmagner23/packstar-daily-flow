-- Trigger function for updated_at (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  abn text,
  credit_terms_days integer,
  payment_terms text,
  fleet_notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX suppliers_name_unique_ci ON public.suppliers (lower(name));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_suppliers" ON public.suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Equipment catalogue
CREATE TABLE public.equipment_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  item_name text NOT NULL,
  typical_specs text,
  rate_basis text NOT NULL DEFAULT 'weekly',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX equipment_catalogue_cat_item_ci
  ON public.equipment_catalogue (lower(category), lower(item_name));

ALTER TABLE public.equipment_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_equipment_catalogue" ON public.equipment_catalogue FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_equipment_catalogue" ON public.equipment_catalogue FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_equipment_catalogue" ON public.equipment_catalogue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_equipment_catalogue" ON public.equipment_catalogue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_equipment_catalogue" ON public.equipment_catalogue FOR DELETE TO authenticated USING (true);

INSERT INTO public.equipment_catalogue (category, item_name, typical_specs, rate_basis) VALUES
  ('excavator', '20T Excavator', '20 tonne tracked, zero or conventional tail swing', 'weekly'),
  ('excavator', '30T Excavator', '30 tonne tracked excavator', 'weekly'),
  ('excavator', '50T Excavator', '50 tonne tracked excavator', 'weekly'),
  ('attachment', 'Hydraulic Hammer 20T', 'Rock breaker, 20T excavator class', 'weekly'),
  ('attachment', 'Hydraulic Hammer 30T', 'Rock breaker, 30T excavator class', 'weekly'),
  ('attachment', 'Tilt Hitch', 'Tilt hitch coupler', 'weekly'),
  ('compactor', 'DPU Wacker', 'Dynamic plate compactor, reversible', 'weekly'),
  ('saw', 'Demo Saw', 'Concrete demo saw, petrol', 'weekly'),
  ('shoring', 'Shoring Box 3m', '3 metre trench shield', 'weekly'),
  ('shoring', 'Shoring Box 4m', '4 metre trench shield', 'weekly');
