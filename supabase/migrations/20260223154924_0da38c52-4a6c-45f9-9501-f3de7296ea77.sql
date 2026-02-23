-- Allow admins to delete document chunks (needed for document deletion flow)
CREATE POLICY "Admins can delete document chunks"
ON public.document_chunks
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert document chunks (for replace flow)
CREATE POLICY "Admins can insert document chunks"
ON public.document_chunks
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));