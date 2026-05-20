import { useEffect, useState } from 'react';
import { Users, UserCheck, FolderOpen, TrendingUp, Activity, BarChart2, ClipboardList, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Client, Profile } from '../lib/types';

interface EmployeeRow { employee: Profile; clientCount: number; totalInvested: number; }

const INR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function BrokerDashboard({ onNavigate }: { onNavigate: (v: string, d?: unknown) => void }) {
  const { user, profile, brokerInfo } = useAuth();
  const [stats, setStats] = useState({ employees: 0, clients: 0, documents: 0, grandAum: 0 });
  const [empRows, setEmpRows] = useState<EmployeeRow[]>([]);
  const [recentClients, setRecentClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const [empR, clientR] = await Promise.all([
      supabase.from('profiles').select('*').eq('broker_id', user!.id).eq('role', 'employee'),
      supabase.from('clients').select('*').eq('broker_id', user!.id).order('created_at', { ascending: false }),
    ]);
    const emps: Profile[] = empR.data ?? [];
    const clients: Client[] = clientR.data ?? [];
    const clientIds = clients.map(c => c.id);

    const [docR, ecR, stockR, mfR, fdR, rdR, parkedR] = await Promise.all([
      clientIds.length ? supabase.from('documents').select('id').in('client_id', clientIds) : { data: [] },
      emps.length ? supabase.from('employee_clients').select('employee_id, client_id').in('employee_id', emps.map(e => e.id)) : { data: [] },
      clientIds.length ? supabase.from('stock_holdings').select('client_id, quantity, buy_price').in('client_id', clientIds) : { data: [] },
      clientIds.length ? supabase.from('mutual_funds').select('client_id, amount').in('client_id', clientIds) : { data: [] },
      clientIds.length ? supabase.from('fixed_deposits').select('client_id, principal_amount').in('client_id', clientIds) : { data: [] },
      clientIds.length ? supabase.from('recurring_deposits').select('client_id, total_deposited').in('client_id', clientIds) : { data: [] },
      clientIds.length ? supabase.from('parked_funds').select('client_id, amount').in('client_id', clientIds) : { data: [] },
    ]);

    const invByClient = new Map<string, number>();
    for (const r of (stockR.data ?? [])) {
      invByClient.set(r.client_id, (invByClient.get(r.client_id) ?? 0) + r.quantity * r.buy_price);
    }
    for (const r of (mfR.data ?? [])) {
      invByClient.set(r.client_id, (invByClient.get(r.client_id) ?? 0) + r.amount);
    }
    for (const r of (fdR.data ?? [])) {
      invByClient.set(r.client_id, (invByClient.get(r.client_id) ?? 0) + r.principal_amount);
    }
    for (const r of (rdR.data ?? [])) {
      invByClient.set(r.client_id, (invByClient.get(r.client_id) ?? 0) + (r.total_deposited ?? 0));
    }
    for (const r of (parkedR.data ?? [])) {
      invByClient.set(r.client_id, (invByClient.get(r.client_id) ?? 0) + r.amount);
    }

    const grandAum = Array.from(invByClient.values()).reduce((s, v) => s + v, 0);
    const ecData = ecR.data ?? [];

    setStats({ employees: emps.length, clients: clients.length, documents: docR.data?.length ?? 0, grandAum });
    setRecentClients(clients.slice(0, 6));
    setEmpRows(emps.map(emp => {
      const empClientIds = ecData.filter(ec => ec.employee_id === emp.id).map(ec => ec.client_id);
      const totalInvested = empClientIds.reduce((s, cid) => s + (invByClient.get(cid) ?? 0), 0);
      return { employee: emp, clientCount: empClientIds.length, totalInvested };
    }));
    setLoading(false);
  }

  const statCards = [
    { label: 'Employees', value: stats.employees, icon: <Users size={20} />, color: 'blue', view: 'employees', display: String(stats.employees) },
    { label: 'Clients', value: stats.clients, icon: <UserCheck size={20} />, color: 'emerald', view: 'clients', display: String(stats.clients) },
    { label: 'Documents', value: stats.documents, icon: <FolderOpen size={20} />, color: 'amber', view: 'documents', display: String(stats.documents) },
    { label: 'Total AUM', value: stats.grandAum, icon: <BarChart2 size={20} />, color: 'cyan', view: 'investment-summary', display: INR(stats.grandAum) },
  ];

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-56 bg-slate-700/40 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-800 border border-slate-700/40 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome, {profile?.full_name?.split(' ')[0]}</h1>
        <p className="text-slate-400 mt-1 text-sm">{brokerInfo?.company_name} &mdash; Broker Command Center</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(s => (
          <button key={s.label} onClick={() => onNavigate(s.view)}
            className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5 text-left hover:border-slate-600 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/20 flex items-center justify-center mb-3 text-${s.color}-400 group-hover:scale-110 transition-transform`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-white truncate">{s.display}</p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Overview */}
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Employee Overview</h2>
            </div>
            <button onClick={() => onNavigate('employees')} className="text-blue-400 hover:text-blue-300 text-xs font-medium">Manage</button>
          </div>
          {empRows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <AlertCircle size={22} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No employees yet.</p>
              <p className="text-slate-600 text-xs mt-1">Share broker code: <span className="text-cyan-500 font-mono font-bold">{brokerInfo?.broker_code}</span></p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {empRows.map(({ employee, clientCount, totalInvested }) => (
                <button key={employee.id} onClick={() => onNavigate('employee-investments', employee)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-700/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                    {employee.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{employee.full_name}</p>
                    <p className="text-slate-500 text-xs">{clientCount} client{clientCount !== 1 ? 's' : ''} &middot; {employee.employee_code ?? 'no code'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-emerald-400 font-semibold text-xs">{INR(totalInvested)}</p>
                      <p className="text-slate-600 text-xs">AUM</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Clients */}
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-white font-semibold text-sm">Recent Clients</h2>
            </div>
            <button onClick={() => onNavigate('clients')} className="text-blue-400 hover:text-blue-300 text-xs font-medium">View All</button>
          </div>
          {recentClients.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm">No clients yet.</div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {recentClients.map(client => (
                <button key={client.id} onClick={() => onNavigate('client-detail', client)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-700/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold text-sm flex-shrink-0">
                    {client.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{client.full_name}</p>
                    <p className="text-slate-500 text-xs truncate">{client.pan_number ? `PAN: ${client.pan_number}` : client.email || 'No contact'}</p>
                  </div>
                  <p className="text-slate-600 text-xs flex-shrink-0">{new Date(client.created_at).toLocaleDateString('en-IN')}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
