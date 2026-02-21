
-- Drop existing storage policies and recreate
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to documents" ON storage.objects;

-- Recreate storage policies
CREATE POLICY "Auth users can upload documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Auth users can read own documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can read all stored documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete stored documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role documents access"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');
