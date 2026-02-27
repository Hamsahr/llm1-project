
-- Step 1: Add 'user' value to the app_role enum only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
