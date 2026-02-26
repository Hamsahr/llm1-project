
-- Split chat_conversations ALL policy into specific policies with proper validation
DROP POLICY IF EXISTS "Users can manage own conversations" ON public.chat_conversations;

CREATE POLICY "Users can select own conversations"
ON public.chat_conversations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
ON public.chat_conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
ON public.chat_conversations FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
ON public.chat_conversations FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Add explicit INSERT policy for documents (authenticated users can upload)
CREATE POLICY "Authenticated users can upload documents"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- Prevent non-admin role modification
CREATE POLICY "Non-admins cannot insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Non-admins cannot update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Non-admins cannot delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow authenticated users to insert document chunks (needed for processing)
CREATE POLICY "Authenticated users can insert chunks"
ON public.document_chunks FOR INSERT TO authenticated
WITH CHECK (true);
