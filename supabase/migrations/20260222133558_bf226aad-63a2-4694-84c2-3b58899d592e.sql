
-- Add content_hash column for duplicate detection
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_hash text;

-- Add unique constraint on content_hash (allow nulls for existing docs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_content_hash ON public.documents (content_hash) WHERE content_hash IS NOT NULL;
