/*
  # Tasks, Client Checklist & Broker Actions System

  ## Overview
  Adds a full task-tracking and client onboarding checklist system.

  ## New Tables

  ### 1. `client_checklists`
  Predefined onboarding checklist items per client-employee pair.
  Auto-populated when a client is assigned to an employee or created by one.
  - `id` – UUID PK
  - `client_id` – FK clients
  - `employee_id` – FK profiles (the employee responsible)
  - `broker_id` – FK (broker who owns this client)
  - `item_key` – short identifier (e.g. 'pan_verified')
  - `label` – human-readable task name
  - `category` – 'profile' | 'kyc' | 'documents' | 'investment'
  - `is_completed` – boolean
  - `completed_at` – timestamp
  - `completed_by` – who ticked it
  - `sort_order` – display order
  - `created_at`

  ### 2. `broker_actions`
  Broker-created tasks/action items sent to specific employees or all employees.
  - `id` – UUID PK
  - `broker_id` – the broker who created it
  - `assigned_to` – employee profile id (null = all employees)
  - `client_id` – optional linked client
  - `title` – action title
  - `description` – notes/details
  - `priority` – 'low' | 'normal' | 'high' | 'urgent'
  - `status` – 'open' | 'in_progress' | 'done' | 'dismissed'
  - `due_date` – optional
  - `created_at`, `updated_at`

  ### 3. `action_followups`
  Thread of follow-up messages on a broker_action.
  - `id` – UUID PK
  - `action_id` – FK broker_actions
  - `author_id` – profile id of sender
  - `message` – text
  - `created_at`

  ## Security
  - RLS enabled on all tables
  - Brokers can manage their own actions and read all checklists for their clients
  - Employees can read/update checklists and actions assigned to them
*/

-- ── client_checklists ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_checklists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker_id       uuid NOT NULL,
  item_key        text NOT NULL,
  label           text NOT NULL,
  category        text NOT NULL DEFAULT 'profile',
  is_completed    boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  completed_by    uuid,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can view checklists for their clients"
  ON client_checklists FOR SELECT
  TO authenticated
  USING (broker_id = auth.uid());

CREATE POLICY "Employee can view their own checklists"
  ON client_checklists FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Broker can insert checklists"
  ON client_checklists FOR INSERT
  TO authenticated
  WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Employee can insert checklists they own"
  ON client_checklists FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Employee can update their checklist items"
  ON client_checklists FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Broker can update checklists for their clients"
  ON client_checklists FOR UPDATE
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE INDEX IF NOT EXISTS client_checklists_client_idx ON client_checklists(client_id);
CREATE INDEX IF NOT EXISTS client_checklists_employee_idx ON client_checklists(employee_id);
CREATE INDEX IF NOT EXISTS client_checklists_broker_idx ON client_checklists(broker_id);

-- ── broker_actions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id   uuid NOT NULL,
  assigned_to uuid,
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority    text NOT NULL DEFAULT 'normal',
  status      text NOT NULL DEFAULT 'open',
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE broker_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can view their actions"
  ON broker_actions FOR SELECT
  TO authenticated
  USING (broker_id = auth.uid());

CREATE POLICY "Employee can view actions assigned to them"
  ON broker_actions FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (
      assigned_to IS NULL
      AND broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Broker can insert actions"
  ON broker_actions FOR INSERT
  TO authenticated
  WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Broker can update their actions"
  ON broker_actions FOR UPDATE
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE POLICY "Employee can update status of their actions"
  ON broker_actions FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Broker can delete their actions"
  ON broker_actions FOR DELETE
  TO authenticated
  USING (broker_id = auth.uid());

CREATE INDEX IF NOT EXISTS broker_actions_broker_idx ON broker_actions(broker_id);
CREATE INDEX IF NOT EXISTS broker_actions_assigned_idx ON broker_actions(assigned_to);

-- ── action_followups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_followups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id   uuid NOT NULL REFERENCES broker_actions(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL,
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE action_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can view followups on their actions"
  ON action_followups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM broker_actions ba
      WHERE ba.id = action_followups.action_id
        AND ba.broker_id = auth.uid()
    )
  );

CREATE POLICY "Employee can view followups on their actions"
  ON action_followups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM broker_actions ba
      WHERE ba.id = action_followups.action_id
        AND (
          ba.assigned_to = auth.uid()
          OR (ba.assigned_to IS NULL AND ba.broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid()))
        )
    )
  );

CREATE POLICY "Broker and employee can insert followups"
  ON action_followups FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM broker_actions ba
      WHERE ba.id = action_followups.action_id
        AND (
          ba.broker_id = auth.uid()
          OR ba.assigned_to = auth.uid()
          OR (ba.assigned_to IS NULL AND ba.broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid()))
        )
    )
  );

CREATE INDEX IF NOT EXISTS action_followups_action_idx ON action_followups(action_id);
