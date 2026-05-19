
CREATE POLICY anon_insert_suppliers ON public.suppliers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_suppliers ON public.suppliers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete_suppliers ON public.suppliers FOR DELETE TO anon USING (true);

CREATE POLICY anon_insert_equipment_catalogue ON public.equipment_catalogue FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_equipment_catalogue ON public.equipment_catalogue FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete_equipment_catalogue ON public.equipment_catalogue FOR DELETE TO anon USING (true);
