/*
  # Stock Market & Mutual Fund Management System

  Enhanced schema for Indian stock brokers with:
  - Stock portfolio and holdings tracking
  - Mutual fund SIP/Lump sum records
  - KYC and compliance documentation
  - Investment forms (KYC, PAN, Bank Details, Trading Account, etc.)
  - Form submission history and audit logs
  - Real-time activity logging for compliance

  ## New Tables

  ### stock_holdings
  Tracks individual stock holdings per client
  - `id`, `client_id`, `symbol` (e.g., RELIANCE, TCS)
  - `quantity`, `buy_price`, `current_price`, `notes`
  - `purchase_date`, `broker_reference`

  ### mutual_funds
  Tracks mutual fund investments
  - `id`, `client_id`, `fund_name` (e.g., HDFC Growth)
  - `investment_type` (SIP/Lump Sum), `amount`, `frequency`
  - `nav_value`, `units`, `status` (active/inactive)

  ### investment_forms
  Reusable form templates for Indian stock market compliance
  - Pre-built forms: KYC, PAN Verification, Bank Details, Trading Account, etc.
  - Form status: draft/submitted/approved/rejected
  - Version control for regulatory changes

  ### form_submissions
  Tracks when clients submit forms with data capture
  - `id`, `client_id`, `form_id`, `status`
  - `data` (JSONB - flexible form fields)
  - `submitted_at`, `verified_by`, `verified_at`

  ### form_history
  Audit trail for form changes
  - `id`, `submission_id`, `changed_by`, `old_data`, `new_data`
  - `change_reason`, `changed_at`

  ### audit_logs
  Complete activity log for compliance
  - `id`, `user_id`, `action` (view/edit/delete/download)
  - `entity_type` (client/document/form), `entity_id`
  - `ip_address`, `user_agent`, `timestamp`

  ### client_portfolio_summary
  Materialized view for quick portfolio access
  - Total holdings value, MF value, total portfolio
  - Last updated timestamp
*/

-- Stock Holdings
CREATE TABLE IF NOT EXISTS stock_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  buy_price numeric NOT NULL DEFAULT 0,
  current_price numeric DEFAULT 0,
  notes text DEFAULT '',
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  broker_reference text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_quantity CHECK (quantity >= 0),
  CONSTRAINT valid_prices CHECK (buy_price >= 0 AND current_price >= 0)
);

-- Mutual Funds
CREATE TABLE IF NOT EXISTS mutual_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fund_name text NOT NULL,
  investment_type text NOT NULL DEFAULT 'Lump Sum' CHECK (investment_type IN ('SIP', 'Lump Sum')),
  amount numeric NOT NULL DEFAULT 0,
  frequency text DEFAULT 'Monthly' CHECK (frequency IN ('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'One-Time')),
  nav_value numeric DEFAULT 0,
  units numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'matured', 'closed')),
  next_sip_date date,
  aum text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_amount CHECK (amount >= 0)
);

-- Investment Forms Templates
CREATE TABLE IF NOT EXISTS investment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  form_type text NOT NULL CHECK (form_type IN ('KYC', 'PAN', 'Bank', 'Trading', 'DP', 'Nominee', 'TDS', 'Risk', 'Other')),
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Form Submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES investment_forms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason text DEFAULT '',
  submitted_at timestamptz,
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Form Submission History (Audit)
CREATE TABLE IF NOT EXISTS form_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  old_data jsonb,
  new_data jsonb,
  change_reason text DEFAULT '',
  changed_at timestamptz DEFAULT now()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'download', 'export', 'login', 'logout', 'verify')),
  entity_type text NOT NULL CHECK (entity_type IN ('client', 'document', 'form', 'holding', 'fund', 'profile')),
  entity_id text,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ip_address text DEFAULT '',
  user_agent text DEFAULT '',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_holdings_client ON stock_holdings(client_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_symbol ON stock_holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_mutual_funds_client ON mutual_funds(client_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_client ON form_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client ON audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE stock_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ STOCK_HOLDINGS POLICIES ============
CREATE POLICY "Broker can view all client holdings"
  ON stock_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = stock_holdings.client_id
      AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY "Employee can view assigned client holdings"
  ON stock_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_clients ec
      JOIN clients c ON c.id = ec.client_id
      WHERE c.id = stock_holdings.client_id
      AND ec.employee_id = auth.uid()
    )
  );

CREATE POLICY "Can create holdings for accessible clients"
  ON stock_holdings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = stock_holdings.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Can update accessible holdings"
  ON stock_holdings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = stock_holdings.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Can delete accessible holdings"
  ON stock_holdings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = stock_holdings.client_id
      AND c.broker_id = auth.uid()
    )
  );

-- ============ MUTUAL_FUNDS POLICIES ============
CREATE POLICY "Broker can view all MF investments"
  ON mutual_funds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = mutual_funds.client_id
      AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY "Employee can view assigned MF investments"
  ON mutual_funds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_clients ec
      JOIN clients c ON c.id = ec.client_id
      WHERE c.id = mutual_funds.client_id
      AND ec.employee_id = auth.uid()
    )
  );

CREATE POLICY "Can create MF for accessible clients"
  ON mutual_funds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = mutual_funds.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Can update accessible MF"
  ON mutual_funds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = mutual_funds.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

-- ============ INVESTMENT_FORMS POLICIES ============
CREATE POLICY "Authenticated users can view active forms"
  ON investment_forms FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Broker can manage all forms"
  ON investment_forms FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'broker'
  );

-- ============ FORM_SUBMISSIONS POLICIES ============
CREATE POLICY "Broker can view all submissions"
  ON form_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = form_submissions.client_id
      AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY "Employee can view assigned client submissions"
  ON form_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_clients ec
      WHERE ec.client_id = form_submissions.client_id
      AND ec.employee_id = auth.uid()
    )
  );

CREATE POLICY "Can create submissions for accessible clients"
  ON form_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = form_submissions.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Can update own draft submissions"
  ON form_submissions FOR UPDATE
  TO authenticated
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = form_submissions.client_id
      AND (
        c.broker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employee_clients ec
          WHERE ec.client_id = c.id AND ec.employee_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Broker can verify submissions"
  ON form_submissions FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'broker');

-- ============ FORM_HISTORY POLICIES ============
CREATE POLICY "Broker can view all history"
  ON form_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM form_submissions fs
      JOIN clients c ON c.id = fs.client_id
      WHERE fs.id = form_history.submission_id
      AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY "Employee can view assigned client history"
  ON form_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM form_submissions fs
      JOIN employee_clients ec ON ec.client_id = fs.client_id
      WHERE fs.id = form_history.submission_id
      AND ec.employee_id = auth.uid()
    )
  );

-- ============ AUDIT_LOGS POLICIES ============
CREATE POLICY "Only brokers can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'broker'
    AND (SELECT broker_id FROM profiles WHERE id = auth.uid()) IS NULL
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = audit_logs.client_id
      AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY "Can insert own audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============ INSERT DEFAULT FORMS ============
INSERT INTO investment_forms (name, form_type, description, required_fields, is_active)
VALUES
  ('KYC Registration', 'KYC', 'Know Your Customer form for account opening', 
   '[{"name":"full_name","type":"text","required":true},{"name":"dob","type":"date","required":true},{"name":"pan","type":"text","required":true},{"name":"aadhar","type":"text","required":false},{"name":"address","type":"textarea","required":true},{"name":"city","type":"text","required":true},{"name":"state","type":"text","required":true},{"name":"pincode","type":"text","required":true},{"name":"occupation","type":"select","required":true,"options":["Salaried","Self-Employed","Business","Professional","Retired","Others"]},{"name":"annual_income","type":"select","required":true,"options":["<5L","5-10L","10-25L","25-50L","50L+"]},{"name":"risk_profile","type":"select","required":true,"options":["Conservative","Moderate","Aggressive"]}]'::jsonb, true),
  ('PAN Verification', 'PAN', 'PAN Card verification document', 
   '[{"name":"pan_number","type":"text","required":true},{"name":"pan_holder_name","type":"text","required":true},{"name":"date_of_birth","type":"date","required":true}]'::jsonb, true),
  ('Bank Account Details', 'Bank', 'Bank details for fund transfer and dividends', 
   '[{"name":"account_holder","type":"text","required":true},{"name":"account_number","type":"text","required":true},{"name":"ifsc_code","type":"text","required":true},{"name":"bank_name","type":"text","required":true},{"name":"account_type","type":"select","required":true,"options":["Savings","Current"]},{"name":"micr_code","type":"text","required":false}]'::jsonb, true),
  ('Trading Account Setup', 'Trading', 'Trading account initialization form', 
   '[{"name":"trading_symbol","type":"text","required":true},{"name":"demat_account","type":"text","required":true},{"name":"exchange_segment","type":"select","required":true,"options":["NSE","BSE","NCDEX","ICEX"]},{"name":"settlement_type","type":"select","required":true,"options":["T+1","T+2"]}]'::jsonb, true),
  ('DP Account Details', 'DP', 'Depository Participant account information', 
   '[{"name":"dp_name","type":"text","required":true},{"name":"beneficiary_account","type":"text","required":true},{"name":"isin","type":"text","required":false}]'::jsonb, true),
  ('Nominee Details', 'Nominee', 'Nominee information for succession', 
   '[{"name":"nominee_name","type":"text","required":true},{"name":"nominee_relation","type":"text","required":true},{"name":"nominee_dob","type":"date","required":true},{"name":"nominee_pan","type":"text","required":false},{"name":"nominee_address","type":"textarea","required":true}]'::jsonb, true),
  ('TDS Declaration (Form 15G/15H)', 'TDS', 'Tax deduction declaration form', 
   '[{"name":"form_type","type":"select","required":true,"options":["15G","15H"]},{"name":"financial_year","type":"text","required":true},{"name":"declaration_date","type":"date","required":true}]'::jsonb, true),
  ('Risk Profile Assessment', 'Risk', 'Investment risk tolerance assessment', 
   '[{"name":"risk_score","type":"number","required":true},{"name":"investment_horizon","type":"select","required":true,"options":["Short (0-2 years)","Medium (2-5 years)","Long (5+ years)"]},{"name":"portfolio_allocation_equity","type":"number","required":true},{"name":"portfolio_allocation_debt","type":"number","required":true},{"name":"portfolio_allocation_gold","type":"number","required":true}]'::jsonb, true)
ON CONFLICT DO NOTHING;
