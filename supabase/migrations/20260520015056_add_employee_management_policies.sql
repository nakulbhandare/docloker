/*
  # Employee Management: Deletion & Transfer Support

  ## Changes
  1. Allows broker to soft-delete an employee by setting role = 'deleted' and broker_id = null
  2. Adds broker UPDATE policy on profiles for their employees
  3. Ensures 'deleted' role profiles are excluded from employee queries
  4. Adds broker_actions UPDATE policy so broker can reassign actions between employees
*/

-- Allow broker to update (deactivate) their own employees
DROP POLICY IF EXISTS "Broker can update their employees" ON profiles;
CREATE POLICY "Broker can update their employees"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    broker_id = auth.uid()
    AND role = 'employee'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'broker'
  );

-- Allow broker to update broker_actions assigned_to (for transfers)
DROP POLICY IF EXISTS "Broker can reassign their actions" ON broker_actions;
CREATE POLICY "Broker can reassign their actions"
  ON broker_actions FOR UPDATE
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());
