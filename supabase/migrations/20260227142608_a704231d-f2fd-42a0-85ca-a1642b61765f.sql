-- Fix chat_messages: replace ALL policy with explicit per-command policies
DROP POLICY IF EXISTS "Users can manage own messages" ON public.chat_messages;

CREATE POLICY "Users can select own messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM chat_conversations c
  WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()
));

CREATE POLICY "Users can insert own messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM chat_conversations c
  WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()
));

CREATE POLICY "Users can delete own messages"
ON public.chat_messages FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM chat_conversations c
  WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()
));

-- Add missing CRM insert/update policies (admin only, restricting HR per memory)
CREATE POLICY "Admin can insert CRM data"
ON public.crm_data FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update CRM data"
ON public.crm_data FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
