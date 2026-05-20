import { useEffect, useState } from 'react';
import {
  Users, Search, UserCheck, X, AlertCircle, UserPlus, Copy, Check,
  Eye, EyeOff, ChevronLeft, TrendingUp, FileText, LogIn,
  Settings, Percent, Save, HardDrive, Phone, Mail, Hash, Calendar,
  BarChart2, KeyRound, Trash2, ArrowRightLeft, ShieldAlert, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Profile, Client } from '../lib/types';
import { seedChecklist, seedDefaultBrokerActions } from '../lib/checklist';

interface EmpRow { employee: Profile; assigned: Client[]; }
interface CreatedEmployee { fullName: string; email: string; tempPassword: string; employeeCode: string; }
interface Incentive { return_percentage: number; notes: string; }

// ─── Transfer all data from one employee to another ───────────────────────

async function transferEmployeeData(fromId: string, toId: string, toBrokerId: string) {
  // 1. Get all clients currently assigned to fromEmployee
  const { data: ecRows } = await supabase
    .from('employee_clients')
    .select('client_id')
    .eq('employee_id', fromId);
  const clientIds = (ecRows ?? []).map(r => r.client_id);

  if (clientIds.length === 0) return;

  // 2. Find which clients are not already assigned to the target employee
  const { data: existing } = await supabase
    .from('employee_clients')
    .select('client_id')
    .eq('employee_id', toId)
    .in('client_id', clientIds);
  const alreadyAssigned = new Set((existing ?? []).map(r => r.client_id));
  const toAssign = clientIds.filter(id => !alreadyAssigned.has(id));

  // 3. Assign new clients to target employee
  if (toAssign.length) {
    await supabase.from('employee_clients').insert(
      toAssign.map(cid => ({ employee_id: toId, client_id: cid }))
    );
  }

  // 4. Transfer checklist items (update employee_id for all items from → to)
  await supabase
    .from('client_checklists')
    .update({ employee_id: toId })
    .eq('employee_id', fromId)
    .in('client_id', clientIds);

  // 5. Transfer open/in-progress broker actions (update assigned_to)
  await supabase
    .from('broker_actions')
    .update({ assigned_to: toId, updated_at: new Date().toISOString() })
    .eq('assigned_to', fromId)
    .in('status', ['open', 'in_progress']);
}

// ─── Transfer a single client from one employee to another ────────────────

async function transferClientToEmployee(
  clientId: string, fromEmployeeId: string, toEmployeeId: string, brokerId: string
) {
  // 1. Assign client to new employee (if not already)
  const { data: existing } = await supabase
    .from('employee_clients')
    .select('id')
    .eq('employee_id', toEmployeeId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (!existing) {
    await supabase.from('employee_clients').insert({
      employee_id: toEmployeeId,
      client_id: clientId,
    });
  }

  // 2. Remove client from old employee
  await supabase.from('employee_clients').delete()
    .eq('employee_id', fromEmployeeId)
    .eq('client_id', clientId);

  // 3. Transfer checklist items for this client
  const { data: clItems } = await supabase
    .from('client_checklists')
    .select('id')
    .eq('client_id', clientId)
    .eq('employee_id', fromEmployeeId);

  if (clItems && clItems.length > 0) {
    await supabase.from('client_checklists')
      .update({ employee_id: toEmployeeId })
      .eq('client_id', clientId)
      .eq('employee_id', fromEmployeeId);
  } else {
    // No checklist yet for this client/employee pair — seed one
    await seedChecklist(clientId, toEmployeeId, brokerId);
  }

  // 4. Transfer open/in-progress broker actions for this client
  await supabase.from('broker_actions')
    .update({ assigned_to: toEmployeeId, updated_at: new Date().toISOString() })
    .eq('assigned_to', fromEmployeeId)
    .eq('client_id', clientId)
    .in('status', ['open', 'in_progress']);
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function EmployeesPage({ onNavigate }: { onNavigate?: (v: string, d?: unknown) => void }) {
  const { user, brokerInfo, startImpersonating } = useAuth();
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assignEmp, setAssignEmp] = useState<Profile | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CreatedEmployee | null>(null);
  const [detailEmp, setDetailEmp] = useState<Profile | null>(null);
  const [resetEmp, setResetEmp] = useState<Profile | null>(null);
  const [deleteEmp, setDeleteEmp] = useState<Profile | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [empR, clientR] = await Promise.all([
      supabase.from('profiles').select('*').eq('broker_id', user.id).eq('role', 'employee').order('full_name'),
      supabase.from('clients').select('*').eq('broker_id', user.id).order('full_name'),
    ]);
    const emps = empR.data ?? [];
    const clients = clientR.data ?? [];
    setAllClients(clients);
    if (emps.length > 0) {
      const { data: ec } = await supabase.from('employee_clients').select('employee_id, client_id').in('employee_id', emps.map(e => e.id));
      const clientMap = new Map(clients.map(c => [c.id, c]));
      setRows(emps.map(emp => ({
        employee: emp,
        assigned: (ec ?? []).filter(r => r.employee_id === emp.id).map(r => clientMap.get(r.client_id)).filter(Boolean) as Client[],
      })));
    } else {
      setRows([]);
    }
    setLoading(false);
  }

  async function saveAssign() {
    if (!assignEmp) return;
    setSaving(true);
    const empId = assignEmp.id;
    const { data: curr } = await supabase.from('employee_clients').select('client_id').eq('employee_id', empId);
    const currIds = new Set((curr ?? []).map(r => r.client_id));
    const toAdd = [...checkedIds].filter(id => !currIds.has(id));
    const toRemove = [...currIds].filter(id => !checkedIds.has(id));
    await Promise.all([
      toAdd.length ? supabase.from('employee_clients').insert(toAdd.map(cid => ({ employee_id: empId, client_id: cid }))) : Promise.resolve(),
      toRemove.length ? supabase.from('employee_clients').delete().eq('employee_id', empId).in('client_id', toRemove) : Promise.resolve(),
    ]);
    if (toAdd.length && user) {
      await Promise.all(toAdd.map(cid => seedChecklist(cid, empId, user.id)));
    }
    setSaving(false);
    setAssignEmp(null);
    load();
  }

  const filtered = rows.filter(r => r.employee.full_name.toLowerCase().includes(search.toLowerCase())
    || (r.employee.employee_code ?? '').toLowerCase().includes(search.toLowerCase()));

  const otherEmployees = (emp: Profile) => rows.filter(r => r.employee.id !== emp.id).map(r => r.employee);

  if (detailEmp) {
    const row = rows.find(r => r.employee.id === detailEmp.id);
    return (
      <EmployeeDetailView
        employee={detailEmp}
        assigned={row?.assigned ?? []}
        allEmployees={otherEmployees(detailEmp)}
        brokerId={user?.id ?? ''}
        onBack={() => setDetailEmp(null)}
        onImpersonate={() => startImpersonating(detailEmp)}
        onReload={load}
        onViewInvestments={() => onNavigate?.('employee-investments', detailEmp)}
        onResetPassword={() => setResetEmp(detailEmp)}
        onDeleteEmployee={() => setDeleteEmp(detailEmp)}
      />
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-slate-400 text-sm mt-1">{rows.length} employee{rows.length !== 1 ? 's' : ''} in your organization</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20">
          <UserPlus size={16} /> Create Employee
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee ID..."
          className="w-full bg-[#111827] border border-slate-700/40 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#111827] border border-slate-700/40 rounded-2xl">
          <Users size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{search ? 'No results.' : 'No employees yet.'}</p>
          {!search && brokerInfo?.broker_code && (
            <div className="inline-flex items-center gap-2 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-2 mt-4">
              <span className="text-slate-400 text-xs">Broker Code:</span>
              <span className="text-white font-mono font-bold tracking-widest text-sm">{brokerInfo.broker_code}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(({ employee, assigned }) => (
            <div key={employee.id} className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5 hover:border-slate-600 transition-all flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold flex-shrink-0 text-lg">
                  {employee.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{employee.full_name}</p>
                  {employee.employee_code && <p className="text-cyan-400/80 font-mono text-xs">{employee.employee_code}</p>}
                  {employee.phone && <p className="text-slate-500 text-xs">{employee.phone}</p>}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 mb-4 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs font-medium">Assigned Clients</span>
                  <span className="bg-slate-700 text-white text-xs font-semibold rounded-full px-2 py-0.5">{assigned.length}</span>
                </div>
                {assigned.length === 0 ? (
                  <p className="text-slate-600 text-xs">No clients assigned</p>
                ) : (
                  <div className="space-y-1">
                    {assigned.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-emerald-400 text-xs">{c.full_name.charAt(0)}</span>
                        </div>
                        <span className="text-slate-300 text-xs truncate">{c.full_name}</span>
                      </div>
                    ))}
                    {assigned.length > 3 && <p className="text-slate-600 text-xs">+{assigned.length - 3} more</p>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setDetailEmp(employee)}
                  className="flex items-center justify-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 border border-slate-600/40 text-slate-300 rounded-xl py-2 text-xs font-medium transition-all">
                  <Eye size={13} /> View
                </button>
                <button onClick={() => { setAssignEmp(employee); setCheckedIds(new Set(assigned.map(c => c.id))); }}
                  className="flex items-center justify-center gap-1.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 text-blue-400 rounded-xl py-2 text-xs font-medium transition-all">
                  <UserCheck size={13} /> Assign
                </button>
                <button onClick={() => startImpersonating(employee)}
                  className="flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-xl py-2 text-xs font-medium transition-all">
                  <LogIn size={13} /> Login
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateEmployeeModal brokerId={user?.id ?? ''} onClose={() => setShowCreate(false)}
          onCreated={(emp) => { setCreated(emp); setShowCreate(false); load(); }} />
      )}
      {created && <CreatedSuccessModal employee={created} onClose={() => setCreated(null)} />}
      {assignEmp && (
        <AssignClientsModal emp={assignEmp} allClients={allClients} checkedIds={checkedIds}
          setCheckedIds={setCheckedIds} saving={saving} onClose={() => setAssignEmp(null)} onSave={saveAssign} />
      )}
      {resetEmp && (
        <ResetPasswordModal employee={resetEmp} onClose={() => setResetEmp(null)} />
      )}
      {deleteEmp && (
        <DeleteEmployeeModal
          employee={deleteEmp}
          assignedClients={rows.find(r => r.employee.id === deleteEmp.id)?.assigned ?? []}
          otherEmployees={otherEmployees(deleteEmp)}
          brokerId={user?.id ?? ''}
          onClose={() => setDeleteEmp(null)}
          onDeleted={() => { setDeleteEmp(null); setDetailEmp(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Employee Detail View ──────────────────────────────────────────────────

function EmployeeDetailView({ employee, assigned, allEmployees, brokerId, onBack, onImpersonate, onReload, onViewInvestments, onResetPassword, onDeleteEmployee }: {
  employee: Profile; assigned: Client[]; allEmployees: Profile[]; brokerId: string;
  onBack: () => void; onImpersonate: () => void; onReload: () => void;
  onViewInvestments?: () => void; onResetPassword: () => void; onDeleteEmployee: () => void;
}) {
  const { user } = useAuth();
  const [incentive, setIncentive] = useState<Incentive>({ return_percentage: 0, notes: '' });
  const [loadingInc, setLoadingInc] = useState(true);
  const [savingInc, setSavingInc] = useState(false);
  const [incSaved, setIncSaved] = useState(false);
  const [clientDetails, setClientDetails] = useState<Record<string, { stocks: number; mfs: number; docs: number }>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'incentive' | 'storage'>('overview');
  const [storageSetup, setStorageSetup] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [transferClient, setTransferClient] = useState<Client | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => { loadIncentive(); loadClientDetails(); }, [employee.id]);

  async function loadIncentive() {
    setLoadingInc(true);
    const { data } = await supabase.from('employee_incentives').select('*').eq('employee_id', employee.id).maybeSingle();
    if (data) setIncentive({ return_percentage: data.return_percentage, notes: data.notes });
    setLoadingInc(false);
  }

  async function loadClientDetails() {
    if (!assigned.length) return;
    const ids = assigned.map(c => c.id);
    const [stockRes, mfRes, docRes] = await Promise.all([
      supabase.from('stock_holdings').select('client_id').in('client_id', ids),
      supabase.from('mutual_funds').select('client_id').in('client_id', ids),
      supabase.from('documents').select('client_id').in('client_id', ids),
    ]);
    const details: Record<string, { stocks: number; mfs: number; docs: number }> = {};
    for (const c of assigned) {
      details[c.id] = {
        stocks: (stockRes.data ?? []).filter(r => r.client_id === c.id).length,
        mfs: (mfRes.data ?? []).filter(r => r.client_id === c.id).length,
        docs: (docRes.data ?? []).filter(r => r.client_id === c.id).length,
      };
    }
    setClientDetails(details);
  }

  async function saveIncentive() {
    if (incentive.return_percentage < 0 || incentive.return_percentage > 100) return;
    setSavingInc(true);
    await supabase.from('employee_incentives').upsert({
      employee_id: employee.id, broker_id: brokerId,
      return_percentage: incentive.return_percentage, notes: incentive.notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' });
    setSavingInc(false); setIncSaved(true);
    setTimeout(() => setIncSaved(false), 2500);
  }

  async function setupStorage() {
    setSetupError('');
    let anyError = false;
    for (const client of assigned) {
      const path = `clients/${client.id}/.keep`;
      const { error } = await supabase.storage.from('client-documents').upload(path, new Blob([''], { type: 'text/plain' }), { upsert: true });
      if (error && !error.message.includes('already exists')) anyError = true;
    }
    if (anyError) setSetupError('Some folders could not be created. Check storage settings.');
    else setStorageSetup(true);
  }

  async function doTransferClient() {
    if (!transferClient || !transferTarget || !user) return;
    setTransferring(true);
    await transferClientToEmployee(transferClient.id, employee.id, transferTarget, brokerId);
    setTransferring(false);
    setTransferClient(null);
    setTransferTarget('');
    onReload();
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'clients', label: `Clients (${assigned.length})` },
    { key: 'incentive', label: 'Incentive' },
    { key: 'storage', label: 'Storage' },
  ] as const;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/40 rounded-xl transition-all">
            <ChevronLeft size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-xl">
            {employee.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{employee.full_name}</h1>
            {employee.employee_code && <p className="text-cyan-400/80 font-mono text-xs">{employee.employee_code}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onViewInvestments && (
            <button onClick={onViewInvestments}
              className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 text-blue-400 px-3 py-2 rounded-xl text-xs font-semibold transition-all">
              <BarChart2 size={14} /> Investments
            </button>
          )}
          <button onClick={onImpersonate}
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 px-3 py-2 rounded-xl text-xs font-semibold transition-all">
            <LogIn size={14} /> View as Employee
          </button>
          <button onClick={onResetPassword}
            className="flex items-center gap-2 bg-slate-700/40 hover:bg-slate-700/70 border border-slate-600/40 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold transition-all">
            <KeyRound size={14} /> Reset Password
          </button>
          <button onClick={onDeleteEmployee}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-xl text-xs font-semibold transition-all">
            <Trash2 size={14} /> Delete Employee
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Clients', value: assigned.length, color: 'blue' },
          { label: 'Stocks', value: Object.values(clientDetails).reduce((s, d) => s + d.stocks, 0), color: 'emerald' },
          { label: 'Funds', value: Object.values(clientDetails).reduce((s, d) => s + d.mfs, 0), color: 'cyan' },
          { label: 'Documents', value: Object.values(clientDetails).reduce((s, d) => s + d.docs, 0), color: 'amber' },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] border border-slate-700/40 rounded-xl p-4">
            <p className="text-slate-400 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold text-${s.color}-400 mt-1`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex bg-slate-800/40 border border-slate-700/40 rounded-xl p-1 gap-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-6 space-y-4">
          <h3 className="text-white font-semibold">Employee Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow icon={<Hash size={14} />} label="Employee ID" value={employee.employee_code ?? '—'} mono />
            <InfoRow icon={<Phone size={14} />} label="Phone" value={employee.phone || '—'} />
            <InfoRow icon={<Calendar size={14} />} label="Joined" value={new Date(employee.created_at).toLocaleDateString('en-IN')} />
            <InfoRow icon={<Users size={14} />} label="Role" value="Employee" />
          </div>
        </div>
      )}

      {activeTab === 'clients' && (
        <div className="space-y-3">
          {assigned.length === 0 ? (
            <div className="text-center py-12 bg-[#111827] border border-slate-700/40 rounded-2xl">
              <Users size={24} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No clients assigned yet.</p>
            </div>
          ) : assigned.map(c => {
            const d = clientDetails[c.id] ?? { stocks: 0, mfs: 0, docs: 0 };
            return (
              <div key={c.id} className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4 hover:border-slate-600 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold flex-shrink-0">
                    {c.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{c.full_name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.email && <span className="flex items-center gap-1 text-slate-500 text-xs"><Mail size={10} />{c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1 text-slate-500 text-xs"><Phone size={10} />{c.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><TrendingUp size={11} className="text-emerald-400" />{d.stocks}</span>
                      <span className="flex items-center gap-1"><TrendingUp size={11} className="text-blue-400" />{d.mfs}</span>
                      <span className="flex items-center gap-1"><FileText size={11} className="text-amber-400" />{d.docs}</span>
                    </div>
                    {allEmployees.length > 0 && (
                      <button onClick={() => { setTransferClient(c); setTransferTarget(''); }}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-400 bg-slate-800/60 hover:bg-blue-500/10 border border-slate-700/40 hover:border-blue-500/30 px-2.5 py-1.5 rounded-lg transition-all">
                        <ArrowRightLeft size={11} /> Transfer
                      </button>
                    )}
                  </div>
                </div>
                {c.pan_number && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-slate-600 text-xs">PAN:</span>
                    <span className="text-slate-400 font-mono text-xs">{c.pan_number}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'incentive' && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-6 space-y-5 max-w-lg">
          <div>
            <h3 className="text-white font-semibold mb-1">Incentive Settings</h3>
            <p className="text-slate-500 text-xs">Set the return percentage incentive for this employee.</p>
          </div>
          {loadingInc ? (
            <div className="h-20 bg-slate-800/40 rounded-xl animate-pulse" />
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Incentive Return %</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.1"
                    value={incentive.return_percentage}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setIncentive(p => ({ ...p, return_percentage: v })); }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm pr-10" />
                  <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Notes <span className="text-slate-500 font-normal">(private)</span></label>
                <textarea value={incentive.notes} onChange={e => setIncentive(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="e.g. Based on Q4 performance..."
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none" />
              </div>
              <button onClick={saveIncentive} disabled={savingInc}
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all ${incSaved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'}`}>
                {savingInc ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                  : incSaved ? <><Check size={15} />Saved!</>
                  : <><Save size={15} />Save Incentive</>}
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === 'storage' && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-6 space-y-5 max-w-lg">
          <div>
            <h3 className="text-white font-semibold mb-1 flex items-center gap-2"><HardDrive size={16} className="text-blue-400" /> Storage Setup</h3>
            <p className="text-slate-500 text-xs leading-relaxed">Create dedicated storage folders for each client assigned to this employee.</p>
          </div>
          <div className="space-y-2">
            {assigned.length === 0 ? <p className="text-slate-600 text-sm">No clients assigned.</p>
              : assigned.map(c => (
              <div key={c.id} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/30 rounded-xl px-3 py-2">
                <HardDrive size={12} className="text-slate-500 flex-shrink-0" />
                <span className="text-slate-400 text-xs font-mono truncate">clients/{c.id}/</span>
                <span className="text-slate-600 text-xs ml-auto">{c.full_name}</span>
              </div>
            ))}
          </div>
          {setupError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3"><p className="text-red-400 text-xs">{setupError}</p></div>}
          {storageSetup && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
              <Check size={14} className="text-emerald-400" />
              <p className="text-emerald-400 text-sm">Storage folders created successfully.</p>
            </div>
          )}
          <button onClick={setupStorage} disabled={assigned.length === 0 || storageSetup}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm transition-all">
            <HardDrive size={15} />
            {storageSetup ? 'Storage Configured' : 'Setup Storage Folders'}
          </button>
        </div>
      )}

      {/* Transfer client modal (inline) */}
      {transferClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTransferClient(null)} />
          <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-blue-400" />
                <h3 className="text-white font-semibold text-sm">Transfer Client</h3>
              </div>
              <button onClick={() => setTransferClient(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
                <div className="w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  {transferClient.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{transferClient.full_name}</p>
                  {transferClient.pan_number && <p className="text-slate-500 text-xs font-mono">{transferClient.pan_number}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Transfer to Employee</label>
                <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
                  className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                  <option value="">— Select employee —</option>
                  {allEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-slate-400 space-y-1">
                <p className="text-blue-300 font-semibold">What gets transferred:</p>
                <p>• Client ownership moves to the selected employee</p>
                <p>• All checklist items (with current completion status)</p>
                <p>• All open &amp; in-progress broker actions for this client</p>
                <p>• Document &amp; form access follows the client</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700/40">
              <button onClick={() => setTransferClient(null)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:text-white transition-all">Cancel</button>
              <button onClick={doTransferClient} disabled={!transferTarget || transferring}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
                {transferring ? <><Loader2 size={14} className="animate-spin" /> Transferring...</> : <><ArrowRightLeft size={14} /> Transfer Client</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────

function ResetPasswordModal({ employee, onClose }: { employee: Profile; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [err, setErr] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reset() {
    setLoading(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setErr('Not authenticated. Please refresh and try again.'); setLoading(false); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-employee-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ employeeId: employee.id }),
        }
      );
      const text = await res.text();
      let json: { error?: string; newPassword?: string } = {};
      try { json = JSON.parse(text); } catch { setErr(`Unexpected response: ${text.slice(0, 100)}`); setLoading(false); return; }
      if (!res.ok || json.error) { setErr(json.error ?? `Server error (${res.status})`); setLoading(false); return; }
      setNewPassword(json.newPassword ?? '');
    } catch (e) {
      setErr(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(newPassword);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!newPassword ? onClose : undefined} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-amber-400" />
            <h3 className="text-white font-semibold text-sm">Reset Password</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
            <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-sm">
              {employee.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{employee.full_name}</p>
              {employee.employee_code && <p className="text-cyan-400 font-mono text-xs">{employee.employee_code}</p>}
            </div>
          </div>

          {!newPassword ? (
            <>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <p className="text-amber-300 text-xs font-semibold mb-1 flex items-center gap-1">
                  <ShieldAlert size={12} /> This will generate a new temporary password
                </p>
                <p className="text-slate-400 text-xs">The employee's current password will be invalidated immediately. Share the new password securely.</p>
              </div>
              {err && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400" />
                  <p className="text-red-400 text-sm">{err}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:text-white transition-all">Cancel</button>
                <button onClick={reset} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Resetting...</> : <><KeyRound size={14} /> Reset Password</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
                <Check size={14} className="text-emerald-400 flex-shrink-0" />
                <p className="text-emerald-300 text-sm font-semibold">Password reset successfully</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-2">New Temporary Password</p>
                <div className="flex items-center gap-3">
                  <p className={`text-white font-mono text-base flex-1 ${showPwd ? '' : 'blur-sm select-none'}`}>{newPassword}</p>
                  <button onClick={() => setShowPwd(v => !v)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={copy} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all">
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <p className="text-amber-400/80 text-xs">Share this password securely with the employee. Ask them to change it after first login.</p>
              </div>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete Employee Modal ────────────────────────────────────────────────

function DeleteEmployeeModal({ employee, assignedClients, otherEmployees, brokerId, onClose, onDeleted }: {
  employee: Profile; assignedClients: Client[]; otherEmployees: Profile[];
  brokerId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [transferTo, setTransferTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const hasClients = assignedClients.length > 0;
  const needsTransfer = hasClients && otherEmployees.length > 0;
  const canDelete = !hasClients || (needsTransfer && transferTo) || (hasClients && otherEmployees.length === 0);

  async function doDelete() {
    if (!canDelete) return;
    setDeleting(true); setErr('');

    // Transfer data to another employee if needed
    if (transferTo) {
      await transferEmployeeData(employee.id, transferTo, brokerId);
    } else if (hasClients && otherEmployees.length === 0) {
      // No other employees — unassign clients (they remain under broker)
      await supabase.from('employee_clients').delete().eq('employee_id', employee.id);
    }

    // Remove the employee record (auth user stays but profile role changes so they can't access)
    // We soft-delete by removing broker_id so they lose all access
    const { error } = await supabase
      .from('profiles')
      .update({ broker_id: null, role: 'deleted' })
      .eq('id', employee.id);

    if (error) { setErr(error.message); setDeleting(false); return; }
    setDeleting(false);
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-red-500/30 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-red-400" />
            <h3 className="text-white font-semibold text-sm">Delete Employee</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
            <div className="w-9 h-9 rounded-full bg-red-600/20 border border-red-600/30 flex items-center justify-center text-red-400 font-bold text-sm">
              {employee.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{employee.full_name}</p>
              {employee.employee_code && <p className="text-cyan-400 font-mono text-xs">{employee.employee_code}</p>}
            </div>
          </div>

          {hasClients && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <p className="text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                <ShieldAlert size={13} /> This employee has {assignedClients.length} assigned client{assignedClients.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {assignedClients.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-slate-400 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {c.full_name}
                    {c.pan_number && <span className="font-mono text-slate-600">{c.pan_number}</span>}
                  </div>
                ))}
              </div>
              {otherEmployees.length > 0 ? (
                <div>
                  <p className="text-slate-300 text-xs font-semibold mb-1.5">Transfer all clients, tasks &amp; checklists to:</p>
                  <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                    className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                    <option value="">— Select employee to transfer to —</option>
                    {otherEmployees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>
                    ))}
                  </select>
                  {transferTo && (
                    <div className="mt-2 bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-slate-400 space-y-1">
                      <p className="text-blue-300 font-semibold">What gets transferred to the selected employee:</p>
                      <p>• All {assignedClients.length} client assignment{assignedClients.length !== 1 ? 's' : ''}</p>
                      <p>• All checklist items with current completion status</p>
                      <p>• All open &amp; in-progress broker actions</p>
                      <p>• Document &amp; form access (follows client assignment)</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
                  <p className="text-slate-400 text-xs">No other employees available. Clients will be unassigned but remain under your broker account.</p>
                </div>
              )}
            </div>
          )}

          {!hasClients && (
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
              <p className="text-slate-400 text-xs">This employee has no assigned clients. They can be deleted immediately.</p>
            </div>
          )}

          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-red-300 text-xs font-semibold mb-1">This action is irreversible.</p>
            <p className="text-red-400/70 text-xs">The employee will lose all access immediately. Their account data (auth) is preserved but deactivated.</p>
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400" />
              <p className="text-red-400 text-sm">{err}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700/40">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:text-white transition-all">Cancel</button>
          <button onClick={doDelete} disabled={!canDelete || deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
            {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : <><Trash2 size={14} /> Delete Employee</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-3">
      <span className="text-slate-500 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-slate-500 text-xs">{label}</p>
        <p className={`text-white text-sm font-medium ${mono ? 'font-mono text-cyan-400' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function AssignClientsModal({ emp, allClients, checkedIds, setCheckedIds, saving, onClose, onSave }: {
  emp: Profile; allClients: Client[]; checkedIds: Set<string>;
  setCheckedIds: (s: Set<string>) => void; saving: boolean;
  onClose: () => void; onSave: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = allClients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div>
            <h3 className="text-white font-semibold text-sm">Assign Clients</h3>
            <p className="text-slate-400 text-xs mt-0.5">{emp.full_name} &bull; {checkedIds.size} selected</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
              className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl pl-8 pr-3 py-2 text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {allClients.length === 0 ? (
            <div className="text-center py-8"><AlertCircle size={20} className="text-slate-600 mx-auto mb-2" /><p className="text-slate-500 text-sm">Add clients first.</p></div>
          ) : filtered.map(client => {
            const checked = checkedIds.has(client.id);
            return (
              <label key={client.id}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${checked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-800/40 border border-transparent hover:border-slate-600'}`}>
                <input type="checkbox" checked={checked}
                  onChange={e => { const n = new Set(checkedIds); if (e.target.checked) n.add(client.id); else n.delete(client.id); setCheckedIds(n); }}
                  className="w-4 h-4 accent-emerald-500 rounded" />
                <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-400 text-sm font-semibold">{client.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{client.full_name}</p>
                  <p className="text-slate-500 text-xs truncate">{client.email || client.phone || '—'}</p>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700/40">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white transition-all">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all">
            {saving ? 'Saving...' : `Save (${checkedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEmployeeModal({ brokerId, onClose, onCreated }: {
  brokerId: string; onClose: () => void; onCreated: (emp: CreatedEmployee) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!fullName.trim() || fullName.trim().length < 2) e.fullName = 'Full name must be at least 2 characters.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    if (phone.trim() && !/^[+\d\s\-()]{7,15}$/.test(phone.trim())) e.phone = 'Enter a valid phone number.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true); setError(''); setErrors({});

    const tempPassword = generateTempPassword();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(), password: tempPassword,
      options: { data: { full_name: fullName.trim(), role: 'employee', broker_id: brokerId, phone: phone.trim() } },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (!data.user) { setError('Failed to create user.'); setLoading(false); return; }

    await new Promise(r => setTimeout(r, 1000));
    const { data: prof } = await supabase.from('profiles').select('employee_code').eq('id', data.user.id).maybeSingle();
    setLoading(false);
    onCreated({ fullName: fullName.trim(), email: email.trim(), tempPassword, employeeCode: prof?.employee_code ?? '' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2"><UserPlus size={18} className="text-blue-400" /><h3 className="text-white font-semibold">Create Employee</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })); }} placeholder="Priya Sharma"
              className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${errors.fullName ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
            {errors.fullName && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.fullName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }} placeholder="priya@example.com"
              className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${errors.email ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
            {errors.email && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone <span className="text-slate-500 font-normal">(optional)</span></label>
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })); }} placeholder="+91 98765 43210"
              className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${errors.phone ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
            {errors.phone && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.phone}</p>}
          </div>
          <div className="bg-slate-800/60 border border-slate-700/30 rounded-xl p-3">
            <p className="text-slate-400 text-xs">A temporary password will be generated. Share it with the employee securely.</p>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white transition-all">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-all">
              {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</span> : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreatedSuccessModal({ employee, onClose }: { employee: CreatedEmployee; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  async function copy(val: string, key: string) {
    await navigator.clipboard.writeText(val);
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 pt-6 pb-4 text-center border-b border-slate-700/40">
          <div className="w-14 h-14 bg-emerald-600/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-emerald-400" />
          </div>
          <h3 className="text-white font-bold text-lg">Employee Created!</h3>
          <p className="text-slate-400 text-sm mt-1">{employee.fullName}</p>
        </div>
        <div className="p-6 space-y-3">
          <CredRow label="Employee ID" value={employee.employeeCode || 'Generating...'} onCopy={() => employee.employeeCode && copy(employee.employeeCode, 'eid')} copied={copied === 'eid'} mono />
          <CredRow label="Email" value={employee.email} onCopy={() => copy(employee.email, 'email')} copied={copied === 'email'} />
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-xs mb-1">Temporary Password</p>
              <p className={`text-white font-mono text-sm ${showPwd ? '' : 'blur-sm select-none'}`}>{employee.tempPassword}</p>
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              <button onClick={() => setShowPwd(v => !v)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => copy(employee.tempPassword, 'pwd')} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all">
                {copied === 'pwd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-400/80 text-xs leading-relaxed">Share credentials securely. Ask the employee to change the password after first login.</p>
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

function CredRow({ label, value, onCopy, copied, mono }: { label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className={`text-white text-sm font-medium ${mono ? 'font-mono tracking-wider text-cyan-400' : ''}`}>{value}</p>
      </div>
      <button onClick={onCopy} className="ml-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all flex-shrink-0">
        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
