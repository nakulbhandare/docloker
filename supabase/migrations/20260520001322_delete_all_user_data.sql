/*
  # Delete All User Data
  Removes all application data and auth users to allow fresh registration.
*/

-- Delete all application data in dependency order
DELETE FROM audit_logs;
DELETE FROM form_history;
DELETE FROM form_submissions;
DELETE FROM stock_holdings;
DELETE FROM mutual_funds;
DELETE FROM documents;
DELETE FROM employee_clients;
DELETE FROM clients;
DELETE FROM brokers;
DELETE FROM profiles;

-- Delete all auth users
DELETE FROM auth.users;
