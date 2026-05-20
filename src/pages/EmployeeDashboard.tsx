import { useEffect, useState } from 'react';
import { UserCheck, FolderOpen, ClipboardList, BarChart2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Client } from '../lib/types';

const INR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface InvTotals {
  equity: number;
  mf: number;
  fd: number;
  rd: number;
  parked: number;
}

export default function EmployeeDashboard({ onNavigate }: { onNavigate: (v: string, d?: unknown) => void }) {
  const { user, profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [formCount, setFormCount] = useState(0);
  const [inv, setInv] = useState<InvTotals>({ equity: 0, mf: 0, fd: 0, rd: 0, parked: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', user!.id);
    const ids = (ec ?? []).map(r => r.client_id);
    if (ids.length === 0) { setLoading(false); return; }

    const [clientR, docR, formR, stockR, mfR, fdR, rdR, parkedR] = await Promise.all([
      supabase.from('clients').select('*').in('id', ids).order('full_name'),
      supabase.from('documents').select('id').in('client_id', ids),
      supabase.from('form_submissions').select('id').in('client_id', ids),
      supabase.from('stock_holdings').select('quantity, buy_price').in('client_id', ids),
      supabase.from('mutual_funds').select('amount').in('client_id', ids),
      supabase.from('fixed_deposits').select('principal_amount').in('client_id', ids),
      supabase.from('recurring_deposits').select('total_deposited').in('client_id', ids),
      supabase.from('parked_funds').select('amount').in('client_id', ids),
    ]);

    setClients(clientR.data ?? []);
    setDocCount(docR.data?.length ?? 0);
    setFormCount(formR.data?.length ?? 0);
    setInv({
      equity: (stockR.data ?? []).reduce((s, r) => s + r.quantity * r.buy_price, 0),
      mf: (mfR.data ?? []).reduce((s, r) => s + r.amount, 0),
      fd: (fdR.data ?? []).reduce((s, r) => s + r.principal_amount, 0),
      rd: (rdR.data ?? []).reduce((s, r) => s + (r.total_deposited ?? 0), 0),
      parked: (parkedR.data ?? []).reduce((s, r) => s + r.amount, 0),
    });
    setLoading(false);
  }

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-56 bg-slate-700/40 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );

  const totalInvested = inv.equity + inv.mf + inv.fd + inv.rd + inv.parked;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome, {profile?.full_name?.split(' ')[0]}</h1>
        <p className="text-slate-400 mt-1 text-sm">Your client portfolio at a glance</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Clients', value: String(clients.length), icon: <UserCheck size={20} />, color: 'emerald', view: 'clients' },
          { label: 'Documents', value: String(docCount), icon: <FolderOpen size={20} />, color: 'amber', view: 'documents' },
          { label: 'Forms Filed', value: String(formCount), icon: <ClipboardList size={20} />, color: 'blue', view: 'forms' },
          { label: 'My Investments', value: INR(totalInvested), icon: <BarChart2 size={20} />, color: 'cyan', view: 'investment-summary' },
        ].map(s => (
          <button key={s.label} onClick={() => onNavigate(s.view)}
            className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5 text-left hover:border-slate-600 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/20 flex items-center justify-center mb-3 text-${s.color}-400 group-hover:scale-110 transition-transform`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-white truncate">{s.value}</p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Investment Breakdown */}
      {totalInvested > 0 && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-cyan-400" />
              <h2 className="text-white font-semibold text-sm">Investment Breakdown</h2>
            </div>
            <button onClick={() => onNavigate('investment-summary')} className="text-blue-400 hover:text-blue-300 text-xs font-medium">Full Report</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Equity', amount: inv.equity, color: 'emerald' },
              { label: 'Mutual Funds', amount: inv.mf, color: 'blue' },
              { label: 'Fixed Deposits', amount: inv.fd, color: 'amber' },
              { label: 'Recurring Dep.', amount: inv.rd, color: 'cyan' },
              { label: 'Parked Funds', amount: inv.parked, color: 'slate' },
            ].map(cat => (
              <div key={cat.label} className={`bg-${cat.color}-500/5 border border-${cat.color}-500/20 rounded-xl p-3`}>
                <p className={`text-${cat.color}-400 text-xs font-medium mb-1`}>{cat.label}</p>
                <p className="text-white text-sm font-bold truncate">{INR(cat.amount)}</p>
                <p className="text-slate-500 text-xs mt-0.5">{totalInvested > 0 ? ((cat.amount / totalInvested) * 100).toFixed(1) : 0}%</p>
              </div>
            ))}
          </div>
          {/* Allocation bar */}
          <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
            {[
              { pct: (inv.equity / totalInvested) * 100, cls: 'bg-emerald-500' },
              { pct: (inv.mf / totalInvested) * 100, cls: 'bg-blue-500' },
              { pct: (inv.fd / totalInvested) * 100, cls: 'bg-amber-500' },
              { pct: (inv.rd / totalInvested) * 100, cls: 'bg-cyan-500' },
              { pct: (inv.parked / totalInvested) * 100, cls: 'bg-slate-500' },
            ].filter(s => s.pct > 0).map((seg, i) => (
              <div key={i} className={`${seg.cls} h-full rounded-full transition-all`} style={{ width: `${seg.pct}%` }} />
            ))}
          </div>
          <div className="flex gap-3 mt-2 flex-wrap">
            {[
              { label: 'Equity', cls: 'bg-emerald-500' },
              { label: 'MF', cls: 'bg-blue-500' },
              { label: 'FD', cls: 'bg-amber-500' },
              { label: 'RD', cls: 'bg-cyan-500' },
              { label: 'Parked', cls: 'bg-slate-500' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`w-2 h-2 rounded-full ${l.cls}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Focus Areas */}
      {clients.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-orange-400" />
            <h2 className="text-white font-semibold text-sm">Areas to Focus</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { check: inv.equity === 0, label: 'No Equity investments', sub: 'Consider adding stocks', color: 'orange' },
              { check: inv.mf === 0, label: 'No Mutual Funds', sub: 'SIPs or lump sum', color: 'yellow' },
              { check: inv.fd === 0, label: 'No Fixed Deposits', sub: 'Low-risk stability', color: 'amber' },
              { check: inv.rd === 0, label: 'No Recurring Deposits', sub: 'Regular savings habit', color: 'blue' },
              { check: totalInvested > 0 && inv.parked / totalInvested > 0.4, label: 'High Parked Funds', sub: 'Consider deploying capital', color: 'red' },
            ].filter(f => f.check).map(f => (
              <div key={f.label} className={`bg-${f.color}-500/5 border border-${f.color}-500/20 rounded-xl p-3`}>
                <TrendingDown size={13} className={`text-${f.color}-400 mb-1`} />
                <p className={`text-${f.color}-300 text-xs font-semibold`}>{f.label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{f.sub}</p>
              </div>
            ))}
            {inv.equity === 0 && inv.mf === 0 && inv.fd === 0 && inv.rd === 0 && inv.parked === 0 && (
              <div className="col-span-2 sm:col-span-3 text-center py-4">
                <p className="text-slate-500 text-sm">Start adding investments to see focus areas.</p>
                <button onClick={() => onNavigate('investment-summary')} className="text-blue-400 hover:text-blue-300 text-xs mt-1">
                  Open Investment Summary
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <h2 className="text-white font-semibold text-sm">Assigned Clients</h2>
          </div>
          <button onClick={() => onNavigate('clients')} className="text-blue-400 hover:text-blue-300 text-xs font-medium">View All</button>
        </div>
        {clients.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">No clients assigned yet. Contact your broker.</div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {clients.slice(0, 8).map(c => (
              <button key={c.id} onClick={() => onNavigate('client-detail', c)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-700/20 transition-colors text-left">
                <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold text-sm flex-shrink-0">
                  {c.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.full_name}</p>
                  <p className="text-slate-500 text-xs truncate">{c.pan_number ? `PAN: ${c.pan_number}` : c.email || 'No contact'}</p>
                </div>
                <p className="text-slate-600 text-xs flex-shrink-0">{new Date(c.created_at).toLocaleDateString('en-IN')}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
