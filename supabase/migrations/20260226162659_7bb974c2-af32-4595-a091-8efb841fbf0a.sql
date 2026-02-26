
-- Add INSERT policy for profiles (users can create their own profile)
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
