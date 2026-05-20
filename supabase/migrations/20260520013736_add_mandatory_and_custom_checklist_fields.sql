/*
  # Add mandatory flag and custom checklist support

  1. Changes
    - Add `mandatory` boolean column to `client_checklists` (default true for predefined tasks)
    - Add `is_custom` boolean to distinguish broker/employee-added custom tasks
    - Add DELETE policies for checklist items
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_checklists' AND column_name = 'mandatory'
  ) THEN
    ALTER TABLE client_checklists ADD COLUMN mandatory boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_checklists' AND column_name = 'is_custom'
  ) THEN
    ALTER TABLE client_checklists ADD COLUMN is_custom boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Allow employees to delete their own custom tasks
DROP POLICY IF EXISTS "Employee can delete their custom checklist items" ON client_checklists;
CREATE POLICY "Employee can delete their custom checklist items"
  ON client_checklists FOR DELETE
  TO authenticated
  USING (employee_id = auth.uid() AND is_custom = true);

-- Allow broker to delete any checklist item for their clients
DROP POLICY IF EXISTS "Broker can delete checklist items for their clients" ON client_checklists;
CREATE POLICY "Broker can delete checklist items for their clients"
  ON client_checklists FOR DELETE
  TO authenticated
  USING (broker_id = auth.uid());
