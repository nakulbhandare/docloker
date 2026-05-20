import { useEffect, useState } from 'react';
import { UserCheck, Plus, Search, Phone, Mail, Trash2, X, CreditCard, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Client, Profile } from '../lib/types';
import { seedChecklist, seedDefaultBrokerActions } from '../lib/checklist';

interface FieldErrors {
  full_name?: string;
  email?: string;
  phone?: string;
  pan_number?: string;
  aadhar_number?: string;
}

const emptyForm = { full_name: '', email: '', phone: '', address: '', pan_number: '', aadhar_number: '', date_of_birth: '', notes: '' };

function validatePAN(v: string) {
  if (!v) return '';
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v.toUpperCase())) return 'Invalid PAN (e.g. ABCDE1234F).';
  return '';
}
function validateEmail(v: string) {
  if (!v) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  return '';
}
function validatePhone(v: string) {
  if (!v) return '';
  if (!/^[+\d\s\-()]{7,15}$/.test(v.trim())) return 'Enter a valid phone number.';
  return '';
}

type ClientRow = Client & { docCount: number; assignedEmployee?: string; readinessPct?: number; pendingTasks?: number };

export default function ClientsPage({ onNavigate }: { onNavigate: (v: string, d?: unknown) => void }) {
  const { user, profile, effectiveProfile } = useAuth();
  const activeProfile = effectiveProfile ?? profile;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [assignToEmployee, setAssignToEmployee] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErr, setFormErr] = useState('');

  useEffect(() => { if (user) load(); }, [user, effectiveProfile]);

  async function load() {
    if (!user) return;
    setLoading(true);

    let q = supabase.from('clients').select('*').order('full_name');
    let empList: Profile[] = [];

    if (activeProfile?.role === 'employee') {
      const empId = effectiveProfile?.id ?? user.id;
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', empId);
      const ids = (ec ?? []).map(r => r.client_id);
      if (!ids.length) { setClients([]); setLoading(false); return; }
      q = q.in('id', ids);
    } else {
      q = q.eq('broker_id', user.id);
      const { data: emps } = await supabase.from('profiles').select('*').eq('broker_id', user.id).eq('role', 'employee').order('full_name');
      empList = emps ?? [];
      setEmployees(empList);
    }

    const { data: list } = await q;
    const clientList = list ?? [];

    if (clientList.length) {
      const cIds = clientList.map(c => c.id);
      const [docsR, ecAllR, checklistR] = await Promise.all([
        supabase.from('documents').select('id, client_id').in('client_id', cIds),
        supabase.from('employee_clients').select('client_id, employee_id').in('client_id', cIds),
        supabase.from('client_checklists').select('client_id, is_completed').in('client_id', cIds),
      ]);

      const cnt = new Map<string, number>();
      (docsR.data ?? []).forEach(d => cnt.set(d.client_id, (cnt.get(d.client_id) ?? 0) + 1));

      const empMap = new Map([...empList.map(e => [e.id, e.full_name] as [string, string])]);
      const assignMap = new Map<string, string>();
      (ecAllR.data ?? []).forEach(r => {
        const name = empMap.get(r.employee_id);
        if (name) assignMap.set(r.client_id, name);
      });

      // Readiness calculation per client
      const totalMap = new Map<string, number>();
      const doneMap = new Map<string, number>();
      (checklistR.data ?? []).forEach(row => {
        totalMap.set(row.client_id, (totalMap.get(row.client_id) ?? 0) + 1);
        if (row.is_completed) doneMap.set(row.client_id, (doneMap.get(row.client_id) ?? 0) + 1);
      });

      setClients(clientList.map(c => {
        const total = totalMap.get(c.id) ?? 0;
        const done = doneMap.get(c.id) ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : null;
        return {
          ...c,
          docCount: cnt.get(c.id) ?? 0,
          assignedEmployee: assignMap.get(c.id),
          readinessPct: pct ?? undefined,
          pendingTasks: total > 0 ? total - done : undefined,
        };
      }));
    } else {
      setClients([]);
    }
    setLoading(false);
  }

  function validateForm(): FieldErrors {
    const e: FieldErrors = {};
    if (!form.full_name.trim() || form.full_name.trim().length < 2) e.full_name = 'Full name must be at least 2 characters.';
    const emailErr = validateEmail(form.email);
    if (emailErr) e.email = emailErr;
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) e.phone = phoneErr;
    const panErr = validatePAN(form.pan_number);
    if (panErr) e.pan_number = panErr;
    if (form.aadhar_number && !/^\d{4}$/.test(form.aadhar_number)) e.aadhar_number = 'Enter last 4 digits only.';
    return e;
  }

  async function addClient() {
    if (!user || !profile) return;
    const errs = validateForm();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setSaving(true); setFormErr(''); setFieldErrors({});

    const brokerId = profile.role === 'broker' ? user.id : profile.broker_id;
    if (!brokerId) { setFormErr('Cannot determine broker.'); setSaving(false); return; }

    const { data: newClient, error } = await supabase.from('clients').insert({
      ...form,
      pan_number: form.pan_number.toUpperCase(),
      broker_id: brokerId,
      created_by: user.id,
    }).select().maybeSingle();

    if (error) { setFormErr(error.message); setSaving(false); return; }

    // Auto-assign to selected employee (broker) or to self (employee)
    const assignId = profile.role === 'employee' ? user.id : assignToEmployee;
    if (assignId && newClient) {
      await supabase.from('employee_clients').insert({ employee_id: assignId, client_id: newClient.id });
      // Seed onboarding checklist + default broker actions immediately
      await Promise.all([
        seedChecklist(newClient.id, assignId, brokerId),
        profile.role === 'broker'
          ? seedDefaultBrokerActions(newClient.id, newClient.full_name, assignId, brokerId)
          : Promise.resolve(),
      ]);
    }

    setSaving(false);
    setShowAdd(false);
    setForm({ ...emptyForm });
    setAssignToEmployee('');
    load();
  }

  async function deleteClient(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this client and all their records? This cannot be undone.')) return;
    await supabase.from('clients').delete().eq('id', id);
    load();
  }

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.pan_number.toLowerCase().includes(search.toLowerCase())
  );

  const fe = (k: keyof FieldErrors) => fieldErrors[k];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-slate-400 text-sm mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm({ ...emptyForm }); setFormErr(''); setFieldErrors({}); setAssignToEmployee(''); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20">
          <Plus size={16} />
          Add Client
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, phone, or PAN..."
          className="w-full bg-[#111827] border border-slate-700/40 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#111827] border border-slate-700/40 rounded-2xl">
          <UserCheck size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{search ? 'No clients match your search.' : 'No clients yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => {
            const ready = client.readinessPct === 100;
            const hasTasks = client.readinessPct !== undefined;
            const pct = client.readinessPct ?? 0;
            const pending = client.pendingTasks ?? 0;

            return (
              <div key={client.id} onClick={() => onNavigate('client-detail', client)}
                className={`bg-[#111827] border rounded-2xl p-5 cursor-pointer transition-all group ${
                  ready ? 'border-emerald-500/30 hover:border-emerald-400/50' : hasTasks && pending > 0 ? 'border-red-500/20 hover:border-red-400/40' : 'border-slate-700/40 hover:border-slate-600'
                }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full border flex items-center justify-center font-bold flex-shrink-0 text-base ${
                      ready ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400' : 'bg-slate-700/40 border-slate-600/40 text-slate-300'
                    }`}>
                      {client.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate leading-tight">{client.full_name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{client.docCount} doc{client.docCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasTasks && (
                      ready
                        ? <CheckCircle2 size={18} className="text-emerald-400" />
                        : <span className="flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                            {pending}
                          </span>
                    )}
                    {profile?.role === 'broker' && (
                      <button onClick={e => deleteClient(client.id, e)}
                        className="text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1 ml-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Readiness bar */}
                {hasTasks && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-500 text-xs">Investment readiness</span>
                      <span className={`text-xs font-semibold ${ready ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${ready ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {client.pan_number && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <CreditCard size={12} className="flex-shrink-0" />
                      <span className="text-xs font-mono">{client.pan_number}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Mail size={12} className="flex-shrink-0" />
                      <span className="text-xs truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone size={12} className="flex-shrink-0" />
                      <span className="text-xs">{client.phone}</span>
                    </div>
                  )}
                  {client.assignedEmployee && (
                    <div className="flex items-center gap-2">
                      <UserCheck size={12} className="text-blue-400 flex-shrink-0" />
                      <span className="text-blue-400/80 text-xs truncate">{client.assignedEmployee}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700/30 flex items-center justify-between">
                  <p className="text-slate-600 text-xs">Added {new Date(client.created_at).toLocaleDateString('en-IN')}</p>
                  {ready && <span className="text-emerald-400 text-xs font-semibold">Ready for investment</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 sticky top-0 bg-[#111827] z-10">
              <h3 className="text-white font-semibold">Add New Client</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Default actions notice */}
              {profile?.role === 'broker' && assignToEmployee && (
                <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-emerald-300 text-xs font-semibold">Default onboarding tasks will be auto-created</p>
                    <p className="text-slate-400 text-xs mt-0.5">13 standard tasks (PAN, Aadhaar, KYC, bank docs, risk profile, etc.) will appear in the assigned employee's task list immediately.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
                  <input type="text" value={form.full_name}
                    onChange={e => { setForm(p => ({ ...p, full_name: e.target.value })); setFieldErrors(p => ({ ...p, full_name: '' })); }}
                    placeholder="Ramesh Sharma"
                    className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${fe('full_name') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/40'}`} />
                  {fe('full_name') && <FieldErr msg={fe('full_name')!} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setFieldErrors(p => ({ ...p, email: '' })); }}
                    placeholder="ramesh@gmail.com"
                    className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${fe('email') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/40'}`} />
                  {fe('email') && <FieldErr msg={fe('email')!} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone</label>
                  <input type="tel" value={form.phone}
                    onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); setFieldErrors(p => ({ ...p, phone: '' })); }}
                    placeholder="+91 98765 43210"
                    className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm ${fe('phone') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/40'}`} />
                  {fe('phone') && <FieldErr msg={fe('phone')!} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">PAN Number</label>
                  <input type="text" value={form.pan_number}
                    onChange={e => { setForm(p => ({ ...p, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })); setFieldErrors(p => ({ ...p, pan_number: '' })); }}
                    placeholder="ABCDE1234F" maxLength={10}
                    className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm font-mono ${fe('pan_number') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/40'}`} />
                  {fe('pan_number') && <FieldErr msg={fe('pan_number')!} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Aadhaar (last 4)</label>
                  <input type="text" value={form.aadhar_number}
                    onChange={e => { setForm(p => ({ ...p, aadhar_number: e.target.value.replace(/\D/g, '').slice(0, 4) })); setFieldErrors(p => ({ ...p, aadhar_number: '' })); }}
                    placeholder="XXXX" maxLength={4}
                    className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm font-mono ${fe('aadhar_number') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/40'}`} />
                  {fe('aadhar_number') && <FieldErr msg={fe('aadhar_number')!} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Date of Birth</label>
                  <input type="date" value={form.date_of_birth}
                    onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))}
                    className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Address</label>
                <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="Full address..." rows={2}
                  className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional notes..." rows={2}
                  className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm resize-none" />
              </div>

              {profile?.role === 'broker' && employees.length > 0 && (
                <div className="border-t border-slate-700/40 pt-4">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Assign to Employee <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <select value={assignToEmployee} onChange={e => setAssignToEmployee(e.target.value)}
                    className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                    <option value="">— Don't assign yet —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}{emp.employee_code ? ` (${emp.employee_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {profile?.role === 'employee' && (
                <div className="border-t border-slate-700/40 pt-4">
                  <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
                    <UserCheck size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-300 text-xs font-semibold">Added under your broker</p>
                      <p className="text-slate-400 text-xs mt-0.5">This client will be registered under your broker and automatically assigned to you. Onboarding checklist tasks will appear in your Tasks section.</p>
                    </div>
                  </div>
                </div>
              )}

              {formErr && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{formErr}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700/40 sticky bottom-0 bg-[#111827]">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white">Cancel</button>
              <button onClick={addClient} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all">
                {saving ? 'Adding...' : assignToEmployee ? 'Add & Assign' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldErr({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <AlertCircle size={11} className="text-red-400 flex-shrink-0" />
      <p className="text-red-400 text-xs">{msg}</p>
    </div>
  );
}
