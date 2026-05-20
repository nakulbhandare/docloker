/*
  # Add Fixed Deposits and Recurring Deposits Tables

  1. New Tables
    - `fixed_deposits`
      - id, client_id, bank_name, fd_number, principal_amount, interest_rate (%), tenure_months,
        start_date, maturity_date, maturity_amount, status (active/matured/broken/renewed),
        auto_renew (bool), notes, created_at, updated_at

    - `recurring_deposits`
      - id, client_id, bank_name, rd_number, monthly_installment, interest_rate (%),
        tenure_months, start_date, maturity_date, total_deposited, maturity_amount,
        status (active/matured/broken), notes, created_at, updated_at

    - `parked_funds`
      - id, client_id, fund_type (savings/liquid_fund/overnight_fund/sweep_fd/other),
        institution, amount, interest_rate, notes, as_of_date, created_at, updated_at

  2. Security
    - RLS enabled on all three tables
    - Broker can read/write clients they own
    - Employee can read clients assigned to them
*/

-- Fixed Deposits
CREATE TABLE IF NOT EXISTS fixed_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  bank_name text NOT NULL DEFAULT '',
  fd_number text DEFAULT '',
  principal_amount numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  tenure_months integer NOT NULL DEFAULT 12,
  start_date date,
  maturity_date date,
  maturity_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','matured','broken','renewed')),
  auto_renew boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fixed_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can read FDs for their clients"
  ON fixed_deposits FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = fixed_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM employee_clients ec
      JOIN profiles p ON p.id = auth.uid()
      WHERE ec.employee_id = auth.uid() AND ec.client_id = fixed_deposits.client_id
    )
  );

CREATE POLICY "Broker can insert FDs"
  ON fixed_deposits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = fixed_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = fixed_deposits.client_id)
  );

CREATE POLICY "Broker can update FDs"
  ON fixed_deposits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = fixed_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = fixed_deposits.client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = fixed_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = fixed_deposits.client_id)
  );

CREATE POLICY "Broker can delete FDs"
  ON fixed_deposits FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = fixed_deposits.client_id AND clients.broker_id = auth.uid())
  );

-- Recurring Deposits
CREATE TABLE IF NOT EXISTS recurring_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  bank_name text NOT NULL DEFAULT '',
  rd_number text DEFAULT '',
  monthly_installment numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  tenure_months integer NOT NULL DEFAULT 12,
  start_date date,
  maturity_date date,
  total_deposited numeric DEFAULT 0,
  maturity_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','matured','broken')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access RDs for assigned clients"
  ON recurring_deposits FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = recurring_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = recurring_deposits.client_id)
  );

CREATE POLICY "Insert RDs for assigned clients"
  ON recurring_deposits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = recurring_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = recurring_deposits.client_id)
  );

CREATE POLICY "Update RDs for assigned clients"
  ON recurring_deposits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = recurring_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = recurring_deposits.client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = recurring_deposits.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = recurring_deposits.client_id)
  );

CREATE POLICY "Broker can delete RDs"
  ON recurring_deposits FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = recurring_deposits.client_id AND clients.broker_id = auth.uid())
  );

-- Parked Funds (savings, liquid, overnight, sweep-FD)
CREATE TABLE IF NOT EXISTS parked_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fund_type text NOT NULL DEFAULT 'savings' CHECK (fund_type IN ('savings','liquid_fund','overnight_fund','sweep_fd','cash','other')),
  institution text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  interest_rate numeric DEFAULT 0,
  notes text DEFAULT '',
  as_of_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE parked_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access parked funds for assigned clients"
  ON parked_funds FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = parked_funds.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = parked_funds.client_id)
  );

CREATE POLICY "Insert parked funds"
  ON parked_funds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = parked_funds.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = parked_funds.client_id)
  );

CREATE POLICY "Update parked funds"
  ON parked_funds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = parked_funds.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = parked_funds.client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = parked_funds.client_id AND clients.broker_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM employee_clients WHERE employee_id = auth.uid() AND client_id = parked_funds.client_id)
  );

CREATE POLICY "Broker can delete parked funds"
  ON parked_funds FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients WHERE clients.id = parked_funds.client_id AND clients.broker_id = auth.uid())
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fixed_deposits_client_id ON fixed_deposits(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_deposits_client_id ON recurring_deposits(client_id);
CREATE INDEX IF NOT EXISTS idx_parked_funds_client_id ON parked_funds(client_id);
