/*
  # Fund Pools and Client Allocations

  ## Summary
  This migration adds a complete fund allocation system for the investment platform.

  ## New Tables

  ### 1. `fund_pools`
  Funds created by brokers that employees can allocate to clients.
  - `id` - UUID primary key
  - `broker_id` - References the broker who created the fund
  - `name` - Fund name (e.g., "HDFC Large Cap Fund", "SBI Bluechip")
  - `fund_type` - Category: equity / mutual_fund / fixed_deposit / recurring_deposit / bond / etf / other
  - `description` - Optional notes about the fund
  - `expected_return_pct` - Annual return percentage the broker is projecting
  - `risk_level` - low / moderate / high
  - `min_investment` - Minimum investment amount
  - `is_active` - Whether this fund is available for allocation
  - `created_by` - Profile who created it
  - `created_at`, `updated_at`

  ### 2. `client_allocations`
  Tracks how much of a client's money is allocated to each fund.
  - `id` - UUID primary key
  - `client_id` - The client being allocated to
  - `fund_pool_id` - The fund receiving allocation
  - `broker_id` - Broker who owns this client
  - `allocated_by` - Profile (employee or broker) who made the allocation
  - `amount` - Amount allocated in rupees
  - `parked_amount` - Amount parked (liquid/waiting) in this fund slot
  - `notes` - Optional allocation notes
  - `allocation_date` - When this allocation was made
  - `expected_return_pct` - Expected return at time of allocation (snapshot)
  - `status` - active / partially_exited / fully_exited / on_hold
  - `created_at`, `updated_at`

  ### 3. `allocation_history`
  Immutable ledger of every penny movement — additions, withdrawals, parking.
  - `id` - UUID primary key
  - `allocation_id` - References client_allocations
  - `client_id` - Denormalized for easy querying
  - `fund_pool_id` - Denormalized for easy querying
  - `broker_id` - Denormalized for RLS
  - `action_by` - Who performed the action
  - `action_type` - invest / park / unpark / withdraw / adjustment
  - `amount` - Amount involved (positive = in, negative = out)
  - `balance_after` - Running balance after this transaction
  - `notes` - Reason or notes
  - `action_date` - When it happened
  - `created_at`

  ## Security
  - RLS enabled on all three tables
  - Brokers can CREATE fund_pools and VIEW all allocations for their clients
  - Employees can VIEW fund_pools (read-only), CREATE/UPDATE allocations for their assigned clients
  - Allocation history is append-only (INSERT only, no UPDATE/DELETE)
*/

-- ─── fund_pools ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fund_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  name text NOT NULL,
  fund_type text NOT NULL DEFAULT 'mutual_fund'
    CHECK (fund_type IN ('equity','mutual_fund','fixed_deposit','recurring_deposit','bond','etf','other')),
  description text DEFAULT '',
  expected_return_pct numeric(5,2) DEFAULT 0,
  risk_level text DEFAULT 'moderate'
    CHECK (risk_level IN ('low','moderate','high')),
  min_investment numeric(15,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fund_pools ENABLE ROW LEVEL SECURITY;

-- Broker: full control over their own funds
CREATE POLICY "Broker can view own fund pools"
  ON fund_pools FOR SELECT
  TO authenticated
  USING (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
        UNION
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'employee'
      )
    )
  );

CREATE POLICY "Broker can insert fund pools"
  ON fund_pools FOR INSERT
  TO authenticated
  WITH CHECK (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
      )
    )
  );

CREATE POLICY "Broker can update own fund pools"
  ON fund_pools FOR UPDATE
  TO authenticated
  USING (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
      )
    )
  )
  WITH CHECK (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
      )
    )
  );

CREATE POLICY "Broker can delete own fund pools"
  ON fund_pools FOR DELETE
  TO authenticated
  USING (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
      )
    )
  );

-- ─── client_allocations ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fund_pool_id uuid NOT NULL REFERENCES fund_pools(id) ON DELETE RESTRICT,
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  allocated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  parked_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (parked_amount >= 0),
  notes text DEFAULT '',
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_pct numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','partially_exited','fully_exited','on_hold')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_allocations_client ON client_allocations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_allocations_broker ON client_allocations(broker_id);
CREATE INDEX IF NOT EXISTS idx_client_allocations_fund ON client_allocations(fund_pool_id);

ALTER TABLE client_allocations ENABLE ROW LEVEL SECURITY;

-- Broker: view all allocations for their clients
CREATE POLICY "Broker can view client allocations"
  ON client_allocations FOR SELECT
  TO authenticated
  USING (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Broker: can insert allocations for their clients
CREATE POLICY "Broker can insert client allocations"
  ON client_allocations FOR INSERT
  TO authenticated
  WITH CHECK (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
    AND
    client_id IN (
      SELECT id FROM clients WHERE broker_id IN (
        SELECT broker_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Broker and assigned employee: can update allocations
CREATE POLICY "Broker and employee can update client allocations"
  ON client_allocations FOR UPDATE
  TO authenticated
  USING (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
    OR
    client_id IN (
      SELECT client_id FROM employee_clients WHERE employee_id = auth.uid()
    )
  )
  WITH CHECK (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
    OR
    client_id IN (
      SELECT client_id FROM employee_clients WHERE employee_id = auth.uid()
    )
  );

-- Only broker can delete allocations
CREATE POLICY "Broker can delete client allocations"
  ON client_allocations FOR DELETE
  TO authenticated
  USING (
    broker_id IN (
      SELECT id FROM brokers WHERE id = (
        SELECT broker_id FROM profiles WHERE id = auth.uid() AND role = 'broker'
      )
    )
  );

-- ─── allocation_history ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS allocation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid REFERENCES client_allocations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fund_pool_id uuid NOT NULL REFERENCES fund_pools(id) ON DELETE RESTRICT,
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  action_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL
    CHECK (action_type IN ('invest','park','unpark','withdraw','adjustment')),
  amount numeric(15,2) NOT NULL,
  balance_after numeric(15,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alloc_history_client ON allocation_history(client_id);
CREATE INDEX IF NOT EXISTS idx_alloc_history_allocation ON allocation_history(allocation_id);
CREATE INDEX IF NOT EXISTS idx_alloc_history_broker ON allocation_history(broker_id);

ALTER TABLE allocation_history ENABLE ROW LEVEL SECURITY;

-- View: broker and assigned employee
CREATE POLICY "Broker and employee can view allocation history"
  ON allocation_history FOR SELECT
  TO authenticated
  USING (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
    OR
    client_id IN (
      SELECT client_id FROM employee_clients WHERE employee_id = auth.uid()
    )
  );

-- Insert: broker and assigned employee (append-only ledger)
CREATE POLICY "Broker and employee can insert allocation history"
  ON allocation_history FOR INSERT
  TO authenticated
  WITH CHECK (
    broker_id IN (
      SELECT broker_id FROM profiles WHERE id = auth.uid()
    )
    OR
    client_id IN (
      SELECT client_id FROM employee_clients WHERE employee_id = auth.uid()
    )
  );
