CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_count INT DEFAULT 5,
  filter_category doc_category DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Get the calling user's role for RBAC enforcement
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
      OR d.category = 'general'
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;