CREATE POLICY "HR and Admin can view CRM data"
ON public.crm_data FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'hr'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);