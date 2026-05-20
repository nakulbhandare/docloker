/*
  # Fix profiles trigger and RLS insert policy

  The handle_new_user trigger runs as SECURITY DEFINER (service role), but the
  INSERT policy WITH CHECK (auth.uid() = id) was blocking it because auth.uid()
  is NULL during trigger execution at signup time.

  Fix: Drop the restrictive INSERT policy and rely on the SECURITY DEFINER
  trigger to safely insert profiles. The trigger only runs from auth.users
  inserts (controlled by Supabase), so this is safe.

  Also ensure broker_id null handling is robust.
*/

-- Drop the blocking INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Re-create a permissive insert policy for service role / trigger use
-- Authenticated users should not be able to insert profiles directly anyway
-- (the trigger handles it). But we need to allow the trigger (service_role) through.
-- Since SECURITY DEFINER bypasses RLS, we just need to make sure there's no
-- policy that actively blocks it. With RLS enabled and no INSERT policy,
-- only service_role (used by SECURITY DEFINER functions) can insert.

-- Update the trigger function to be more robust
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  emp_code text;
  p_role text;
  p_broker_id uuid;
BEGIN
  p_role := COALESCE(NEW.raw_user_meta_data->>'role', 'broker');

  -- Generate employee code for employees
  IF p_role = 'employee' THEN
    emp_code := 'EMP-' || upper(substring(md5(NEW.id::text) from 1 for 6));
  END IF;

  -- Safely parse broker_id as UUID (NULL if empty or invalid)
  BEGIN
    p_broker_id := (NEW.raw_user_meta_data->>'broker_id')::uuid;
  EXCEPTION WHEN others THEN
    p_broker_id := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, role, broker_id, phone, employee_code)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    p_role,
    p_broker_id,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    emp_code
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
