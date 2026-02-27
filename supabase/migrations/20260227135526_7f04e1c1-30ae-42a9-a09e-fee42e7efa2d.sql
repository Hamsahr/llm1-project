
-- Step 2: Update trigger to assign 'user' role by default
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Add minimal-access policies for 'user' role on documents (general only)
CREATE POLICY "Users role can view general docs"
ON public.documents FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'user'::app_role) AND category = 'general'::doc_category);

-- Add policy for 'user' role on document_chunks (general only)
CREATE POLICY "Chunks follow document access - user"
ON public.document_chunks FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'user'::app_role) AND (EXISTS (
  SELECT 1 FROM documents d
  WHERE d.id = document_chunks.document_id AND d.category = 'general'::doc_category
)));

-- Update match_document_chunks to handle the new 'user' role
CREATE OR REPLACE FUNCTION public.match_document_chunks(query_embedding extensions.vector, match_count integer DEFAULT 5, filter_category doc_category DEFAULT NULL::doc_category)
 RETURNS TABLE(id uuid, document_id uuid, content text, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  user_role app_role;
BEGIN
  SELECT role INTO user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.embedding IS NOT NULL
    AND (filter_category IS NULL OR d.category = filter_category)
    AND (
      user_role = 'admin'
      OR (user_role = 'hr' AND d.category IN ('hr', 'general'))
      OR (user_role = 'developer' AND d.category IN ('technical', 'general'))
      OR (user_role = 'user' AND d.category = 'general')
      OR d.category = 'general'
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
