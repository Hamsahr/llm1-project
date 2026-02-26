
-- Replace overly permissive chunk insert with scoped policy
DROP POLICY IF EXISTS "Authenticated users can insert chunks" ON public.document_chunks;

CREATE POLICY "Users can insert chunks for own documents"
ON public.document_chunks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.uploaded_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);
