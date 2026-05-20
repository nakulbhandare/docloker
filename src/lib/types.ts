export type Role = 'broker' | 'employee';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  broker_id: string | null;
  phone: string;
  employee_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerInfo {
  id: string;
  company_name: string;
  broker_code: string;
  created_at: string;
}

export interface Client {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  pan_number: string;
  aadhar_number: string;
  date_of_birth: string;
  notes: string;
  broker_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  client_id: string;
  uploaded_by: string | null;
  name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  category: string;
  description: string;
  created_at: string;
}

export interface StockHolding {
  id: string;
  client_id: string;
  symbol: string;
  quantity: number;
  buy_price: number;
  current_price: number;
  notes: string;
  purchase_date: string;
  broker_reference: string;
  created_at: string;
  updated_at: string;
}

export interface MutualFund {
  id: string;
  client_id: string;
  fund_name: string;
  investment_type: 'SIP' | 'Lump Sum';
  amount: number;
  frequency: string;
  nav_value: number;
  units: number;
  status: 'active' | 'inactive' | 'matured' | 'closed';
  next_sip_date: string | null;
  aum: string;
  created_at: string;
}

export interface InvestmentForm {
  id: string;
  name: string;
  form_type: string;
  description: string;
  required_fields: FormField[];
  version: number;
  is_active: boolean;
}

export interface FormField {
  name: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'email' | 'tel';
  required: boolean;
  options?: string[];
  label?: string;
}

export interface FormSubmission {
  id: string;
  client_id: string;
  form_id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  data: Record<string, string | number | boolean>;
  rejection_reason: string;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  client_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface FixedDeposit {
  id: string;
  client_id: string;
  bank_name: string;
  fd_number: string;
  principal_amount: number;
  interest_rate: number;
  tenure_months: number;
  start_date: string | null;
  maturity_date: string | null;
  maturity_amount: number;
  status: 'active' | 'matured' | 'broken' | 'renewed';
  auto_renew: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface RecurringDeposit {
  id: string;
  client_id: string;
  bank_name: string;
  rd_number: string;
  monthly_installment: number;
  interest_rate: number;
  tenure_months: number;
  start_date: string | null;
  maturity_date: string | null;
  total_deposited: number;
  maturity_amount: number;
  status: 'active' | 'matured' | 'broken';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ParkedFund {
  id: string;
  client_id: string;
  fund_type: 'savings' | 'liquid_fund' | 'overnight_fund' | 'sweep_fd' | 'cash' | 'other';
  institution: string;
  amount: number;
  interest_rate: number;
  notes: string;
  as_of_date: string;
  created_at: string;
  updated_at: string;
}

export type ChecklistCategory = 'profile' | 'kyc' | 'documents' | 'investment';

export interface ClientChecklist {
  id: string;
  client_id: string;
  employee_id: string;
  broker_id: string;
  item_key: string;
  label: string;
  category: ChecklistCategory;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
}

export type ActionPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ActionStatus = 'open' | 'in_progress' | 'done' | 'dismissed';

export interface BrokerAction {
  id: string;
  broker_id: string;
  assigned_to: string | null;
  client_id: string | null;
  title: string;
  description: string;
  priority: ActionPriority;
  status: ActionStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionFollowup {
  id: string;
  action_id: string;
  author_id: string;
  message: string;
  created_at: string;
}

export type FundType = 'equity' | 'mutual_fund' | 'fixed_deposit' | 'recurring_deposit' | 'bond' | 'etf' | 'other';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type AllocationStatus = 'active' | 'partially_exited' | 'fully_exited' | 'on_hold';
export type AllocationActionType = 'invest' | 'park' | 'unpark' | 'withdraw' | 'adjustment';

export interface FundPool {
  id: string;
  broker_id: string;
  name: string;
  fund_type: FundType;
  description: string;
  expected_return_pct: number;
  risk_level: RiskLevel;
  min_investment: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientAllocation {
  id: string;
  client_id: string;
  fund_pool_id: string;
  broker_id: string;
  allocated_by: string | null;
  amount: number;
  parked_amount: number;
  notes: string;
  allocation_date: string;
  expected_return_pct: number;
  status: AllocationStatus;
  created_at: string;
  updated_at: string;
  fund_pool?: FundPool;
}

export interface AllocationHistory {
  id: string;
  allocation_id: string | null;
  client_id: string;
  fund_pool_id: string;
  broker_id: string;
  action_by: string | null;
  action_type: AllocationActionType;
  amount: number;
  balance_after: number;
  notes: string;
  action_date: string;
  created_at: string;
  fund_pool?: FundPool;
  actor_name?: string;
}

export interface ClientInvestmentSummary {
  client: Client;
  equity: { invested: number; current: number; count: number };
  mutualFunds: { invested: number; current: number; count: number; sipCount: number };
  fixedDeposits: { principal: number; maturity: number; count: number; activeCount: number };
  recurringDeposits: { totalDeposited: number; maturity: number; count: number; monthlyInstallment: number };
  parked: { amount: number; count: number };
  total: { invested: number; current: number };
}
