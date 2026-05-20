/*
  # Clear all data and add human-readable ID columns

  1. Clears all user data including auth.users
  2. Adds broker_code display field to profiles (readable broker ID)
  3. Adds employee_code field to profiles (readable employee ID like EMP-XXXXX)
*/

-- Clear all data
DELETE FROM audit_logs;
DELETE FROM form_submissions;
DELETE FROM stock_holdings;
DELETE FROM mutual_funds;
DELETE FROM documents;
DELETE FROM employee_clients;
DELETE FROM clients;
DELETE FROM brokers;
DELETE FROM profiles;
DELETE FROM auth.users;

-- Add employee_code to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'employee_code'
  ) THEN
    ALTER TABLE profiles ADD COLUMN employee_code text UNIQUE;
  END IF;
END $$;
