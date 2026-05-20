/*
  # Add Employee Incentives and Client Search Enhancements

  1. New Tables
    - `employee_incentives`
      - `id` (uuid, pk)
      - `employee_id` (uuid -> profiles)
      - `broker_id` (uuid -> profiles)
      - `return_percentage` (numeric) - broker-set incentive % for this employee
      - `notes` (text)
      - `updated_at` (timestamptz)

  2. Changes to clients table
    - Add `pan_number` (text) and `aadhar_number` (text) columns if not present (for search)

  3. Security
    - RLS on employee_incentives
    - Broker can read/write their employees' incentives
    - Employee can read only their own incentive
*/

-- Create employee_incentives table
CREATE TABLE IF NOT EXISTS employee_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id),
  broker_id uuid NOT NULL REFERENCES profiles(id),
  return_percentage numeric DEFAULT 0 CHECK (return_percentage >= 0 AND return_percentage <= 100),
  notes text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id)
);

ALTER TABLE employee_incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can manage their employee incentives"
  ON employee_incentives FOR SELECT
  TO authenticated
  USING (broker_id = auth.uid() OR employee_id = auth.uid());

CREATE POLICY "Broker can insert employee incentives"
  ON employee_incentives FOR INSERT
  TO authenticated
  WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Broker can update employee incentives"
  ON employee_incentives FOR UPDATE
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Broker can delete employee incentives"
  ON employee_incentives FOR DELETE
  TO authenticated
  USING (broker_id = auth.uid());

-- Add pan_number and aadhar_number to clients if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'pan_number') THEN
    ALTER TABLE clients ADD COLUMN pan_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'aadhar_number') THEN
    ALTER TABLE clients ADD COLUMN aadhar_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'date_of_birth') THEN
    ALTER TABLE clients ADD COLUMN date_of_birth date;
  END IF;
END $$;

-- Index for fast document search by client
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_broker_id ON clients(broker_id);
CREATE INDEX IF NOT EXISTS idx_profiles_broker_id ON profiles(broker_id);
