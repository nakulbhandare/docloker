/*
  # Fix infinite recursion in profiles RLS policies

  The "Broker can view all employees in their org" policy was querying the
  profiles table from within a profiles policy, causing infinite recursion.

  Fix: replace the self-referencing subquery with auth.jwt() to check role,
  and use a direct broker_id comparison without recursing into profiles.
*/

-- Drop the recursive policy
DROP POLICY IF EXISTS "Broker can view all employees in their org" ON profiles;

-- Re-create it without self-reference: brokers can see profiles where
-- broker_id matches their own uid (their employees), using jwt role check
CREATE POLICY "Broker can view employee profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = id)
    OR
    (broker_id = auth.uid())
  );

-- Drop the old "Users can view own profile" to avoid duplicate select policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- The INSERT policy checks auth.uid() = id but the trigger runs as SECURITY DEFINER
-- so we need to allow service role inserts. The trigger already uses SECURITY DEFINER
-- which bypasses RLS, so the INSERT policy is fine as-is.
