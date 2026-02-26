
-- Enable RLS on all sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Revoke direct SELECT from anon on all sensitive tables
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.user_roles FROM anon;
REVOKE SELECT ON public.documents FROM anon;
REVOKE SELECT ON public.document_chunks FROM anon;
REVOKE SELECT ON public.crm_data FROM anon;
REVOKE SELECT ON public.chat_conversations FROM anon;
REVOKE SELECT ON public.chat_messages FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.documents FROM anon;
REVOKE ALL ON public.document_chunks FROM anon;
REVOKE ALL ON public.crm_data FROM anon;
REVOKE ALL ON public.chat_conversations FROM anon;
REVOKE ALL ON public.chat_messages FROM anon;
