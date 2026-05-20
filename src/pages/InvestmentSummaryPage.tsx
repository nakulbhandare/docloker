import { useEffect, useState } from 'react';
import {
  ChevronLeft, TrendingUp, TrendingDown, Landmark, RefreshCw,
  Wallet, PieChart, Plus, X, Trash2, ChevronDown, ChevronUp,
  AlertCircle, Building2, BarChart2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type {
  Client, Profile, StockHolding, MutualFund,
  FixedDeposit, RecurringDeposit, ParkedFund, ClientInvestmentSummary,
} from '../lib/types';

const INR = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const PCT = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// ─── asset category config ────────────────────────────────────────────────
const ASSET_CATS = [
  { key: 'equity',         label: 'Equity',          color: 'emerald', icon: TrendingUp },
  { key: 'mutualFunds',    label: 'Mutual Funds',     color: 'blue',    icon: BarChart2 },
  { key: 'fixedDeposits',  label: 'Fixed Deposits',   color: 'amber',   icon: Landmark },
  { key: 'recurringDeposits', label: 'Recurring Deposits', color: 'cyan', icon: RefreshCw },
  { key: 'parked',         label: 'Parked / Liquid',  color: 'slate',   icon: Wallet },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Prop variations:
//  - employeeMode: shows all clients assigned to the employee/impersonated-employee
//  - brokerEmployeeMode: broker viewing a specific employee's investments
//  - clientMode: single client breakdown
// ─────────────────────────────────────────────────────────────────────────
interface Props {
  // Broker viewing a specific employee
  targetEmployee?: Profile;
  // Or show the signed-in user's own summary (employee mode)
  selfMode?: boolean;
  onBack?: () => void;
}

export default function InvestmentSummaryPage({ targetEmployee, selfMode, onBack }: Props) {
  const { user, effectiveProfile, profile } = useAuth();
  const isBroker = profile?.role === 'broker';

  // Determine whose clients to load
  const viewingAs: 'broker-employee' | 'self' = targetEmployee ? 'broker-employee' : 'self';
  const empId = targetEmployee?.id ?? (effectiveProfile?.role === 'employee' ? (effectiveProfile.id ?? user?.id) : user?.id);

  const [clients, setClients] = useState<Client[]>([]);
  const [summaries, setSummaries] = useState<ClientInvestmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // Add modals
  const [addModal, setAddModal] = useState<{ type: 'fd' | 'rd' | 'parked' | 'stock' | 'mf'; clientId: string } | null>(null);

  useEffect(() => { if (user) loadAll(); }, [user, targetEmployee]);

  async function loadAll() {
    if (!user || !empId) return;
    setLoading(true);

    // Load clients
    let clientList: Client[] = [];
    if (viewingAs === 'broker-employee') {
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', empId);
      const ids = (ec ?? []).map(r => r.client_id);
      if (ids.length) {
        const { data } = await supabase.from('clients').select('*').in('id', ids).order('full_name');
        clientList = data ?? [];
      }
    } else if (effectiveProfile?.role === 'employee') {
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', empId);
      const ids = (ec ?? []).map(r => r.client_id);
      if (ids.length) {
        const { data } = await supabase.from('clients').select('*').in('id', ids).order('full_name');
        clientList = data ?? [];
      }
    } else {
      const { data } = await supabase.from('clients').select('*').eq('broker_id', user.id).order('full_name');
      clientList = data ?? [];
    }

    setClients(clientList);
    if (!clientList.length) { setSummaries([]); setLoading(false); return; }

    const ids = clientList.map(c => c.id);
    const [stocksR, mfsR, fdsR, rdsR, parkedR] = await Promise.all([
      supabase.from('stock_holdings').select('*').in('client_id', ids),
      supabase.from('mutual_funds').select('*').in('client_id', ids),
      supabase.from('fixed_deposits').select('*').in('client_id', ids),
      supabase.from('recurring_deposits').select('*').in('client_id', ids),
      supabase.from('parked_funds').select('*').in('client_id', ids),
    ]);

    const stocks: StockHolding[] = stocksR.data ?? [];
    const mfs: MutualFund[] = mfsR.data ?? [];
    const fds: FixedDeposit[] = fdsR.data ?? [];
    const rds: RecurringDeposit[] = rdsR.data ?? [];
    const parked: ParkedFund[] = parkedR.data ?? [];

    const built: ClientInvestmentSummary[] = clientList.map(client => {
      const cid = client.id;
      const cStocks = stocks.filter(s => s.client_id === cid);
      const cMFs = mfs.filter(m => m.client_id === cid);
      const cFDs = fds.filter(f => f.client_id === cid);
      const cRDs = rds.filter(r => r.client_id === cid);
      const cParked = parked.filter(p => p.client_id === cid);

      const equityInvested = cStocks.reduce((s, h) => s + h.quantity * h.buy_price, 0);
      const equityCurrent = cStocks.reduce((s, h) => s + h.quantity * h.current_price, 0);

      const mfInvested = cMFs.reduce((s, m) => s + m.amount, 0);
      const mfCurrent = cMFs.reduce((s, m) => s + m.units * m.nav_value, 0);

      const fdPrincipal = cFDs.reduce((s, f) => s + f.principal_amount, 0);
      const fdMaturity = cFDs.reduce((s, f) => s + (f.maturity_amount || f.principal_amount), 0);

      const rdDeposited = cRDs.reduce((s, r) => s + (r.total_deposited || r.monthly_installment * r.tenure_months), 0);
      const rdMaturity = cRDs.reduce((s, r) => s + (r.maturity_amount || 0), 0);
      const rdMonthly = cRDs.filter(r => r.status === 'active').reduce((s, r) => s + r.monthly_installment, 0);

      const parkedAmount = cParked.reduce((s, p) => s + p.amount, 0);

      const totalInvested = equityInvested + mfInvested + fdPrincipal + rdDeposited + parkedAmount;
      const totalCurrent = equityCurrent + mfCurrent + fdMaturity + rdMaturity + parkedAmount;

      return {
        client,
        equity: { invested: equityInvested, current: equityCurrent, count: cStocks.length },
        mutualFunds: { invested: mfInvested, current: mfCurrent, count: cMFs.length, sipCount: cMFs.filter(m => m.investment_type === 'SIP').length },
        fixedDeposits: { principal: fdPrincipal, maturity: fdMaturity, count: cFDs.length, activeCount: cFDs.filter(f => f.status === 'active').length },
        recurringDeposits: { totalDeposited: rdDeposited, maturity: rdMaturity, count: cRDs.length, monthlyInstallment: rdMonthly },
        parked: { amount: parkedAmount, count: cParked.length },
        total: { invested: totalInvested, current: totalCurrent },
      };
    });

    setSummaries(built);
    setLoading(false);
  }

  // Grand totals across all clients
  const grand = summaries.reduce(
    (acc, s) => ({
      invested: acc.invested + s.total.invested,
      current: acc.current + s.total.current,
      equity: acc.equity + s.equity.current,
      mf: acc.mf + s.mutualFunds.current,
      fd: acc.fd + s.fixedDeposits.principal,
      rd: acc.rd + s.recurringDeposits.totalDeposited,
      parked: acc.parked + s.parked.amount,
      monthlySIP: acc.monthlySIP + s.mutualFunds.sipCount,
      monthlyRD: acc.monthlyRD + s.recurringDeposits.monthlyInstallment,
    }),
    { invested: 0, current: 0, equity: 0, mf: 0, fd: 0, rd: 0, parked: 0, monthlySIP: 0, monthlyRD: 0 }
  );
  const grandPnL = grand.current - grand.invested;
  const grandPct = grand.invested > 0 ? (grandPnL / grand.invested) * 100 : 0;

  const title = targetEmployee
    ? `${targetEmployee.full_name}'s Portfolio`
    : selfMode
    ? 'My Investment Summary'
    : 'Investment Summary';

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/40 rounded-xl transition-all">
            <ChevronLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {targetEmployee?.employee_code && <span className="font-mono text-cyan-400 mr-2">{targetEmployee.employee_code}</span>}
            {clients.length} client{clients.length !== 1 ? 's' : ''} · All investment categories
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : clients.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Grand Total Banner */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/40 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <PieChart size={18} className="text-blue-400" />
              <h2 className="text-white font-semibold">Total Portfolio Overview</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <GrandCard label="Total Invested" value={INR(grand.invested)} sub={`${clients.length} clients`} color="blue" />
              <GrandCard label="Current Value" value={INR(grand.current)} sub="Market value" color="cyan" />
              <GrandCard
                label="Overall P&L"
                value={`${grandPnL >= 0 ? '+' : '-'}${INR(grandPnL)}`}
                sub={PCT(grandPct)}
                color={grandPnL >= 0 ? 'emerald' : 'red'}
              />
              <GrandCard label="Equity" value={INR(grand.equity)} sub="NSE/BSE" color="emerald" />
              <GrandCard label="MF + SIP" value={INR(grand.mf)} sub={`${grand.monthlySIP} SIPs`} color="blue" />
              <GrandCard label="FD + RD" value={INR(grand.fd + grand.rd)} sub={`RD: ${INR(grand.monthlyRD)}/mo`} color="amber" />
            </div>

            {/* Asset allocation bar */}
            <AssetAllocationBar
              equity={grand.equity}
              mf={grand.mf}
              fd={grand.fd}
              rd={grand.rd}
              parked={grand.parked}
              total={grand.current || 1}
            />
          </div>

          {/* Focus areas (where to invest more) */}
          <FocusAreas summaries={summaries} isBroker={isBroker} />

          {/* Per-client cards */}
          <div className="space-y-3">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wider text-slate-400">Client Breakdown</h2>
            {summaries.map(s => (
              <ClientInvestmentCard
                key={s.client.id}
                summary={s}
                expanded={expandedClient === s.client.id}
                onToggle={() => setExpandedClient(expandedClient === s.client.id ? null : s.client.id)}
                onAdd={(type) => setAddModal({ type, clientId: s.client.id })}
                isBroker={isBroker}
                onReload={loadAll}
              />
            ))}
          </div>
        </>
      )}

      {/* Add modals */}
      {addModal?.type === 'fd' && (
        <AddFDModal clientId={addModal.clientId} onClose={() => setAddModal(null)} onSave={loadAll} />
      )}
      {addModal?.type === 'rd' && (
        <AddRDModal clientId={addModal.clientId} onClose={() => setAddModal(null)} onSave={loadAll} />
      )}
      {addModal?.type === 'parked' && (
        <AddParkedModal clientId={addModal.clientId} onClose={() => setAddModal(null)} onSave={loadAll} />
      )}
    </div>
  );
}

// ─── Focus Areas ──────────────────────────────────────────────────────────
function FocusAreas({ summaries, isBroker }: { summaries: ClientInvestmentSummary[]; isBroker: boolean }) {
  const focuses: { label: string; desc: string; color: string; count: number }[] = [];

  const noEquity = summaries.filter(s => s.equity.count === 0).length;
  const noMF = summaries.filter(s => s.mutualFunds.count === 0).length;
  const noFD = summaries.filter(s => s.fixedDeposits.count === 0).length;
  const noRD = summaries.filter(s => s.recurringDeposits.count === 0).length;
  const hasParked = summaries.filter(s => s.parked.amount > 100000).length;

  if (noEquity > 0) focuses.push({ label: 'No Equity', desc: `${noEquity} client${noEquity > 1 ? 's' : ''} without equity holdings — potential for market participation`, color: 'emerald', count: noEquity });
  if (noMF > 0) focuses.push({ label: 'No MF/SIP', desc: `${noMF} client${noMF > 1 ? 's' : ''} without mutual funds — SIP onboarding opportunity`, color: 'blue', count: noMF });
  if (noFD > 0) focuses.push({ label: 'No FD', desc: `${noFD} client${noFD > 1 ? 's' : ''} without fixed deposits — stable income opportunity`, color: 'amber', count: noFD });
  if (noRD > 0) focuses.push({ label: 'No RD', desc: `${noRD} client${noRD > 1 ? 's' : ''} without recurring deposits — disciplined savings gap`, color: 'cyan', count: noRD });
  if (hasParked > 0) focuses.push({ label: 'High Parked Funds', desc: `${hasParked} client${hasParked > 1 ? 's' : ''} with >₹1L parked — consider deploying into higher-yield instruments`, color: 'red', count: hasParked });

  if (!focuses.length) return null;

  return (
    <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={16} className="text-amber-400" />
        <h3 className="text-white font-semibold text-sm">Areas to Focus</h3>
        <span className="ml-auto text-slate-500 text-xs">{isBroker ? 'Action required' : 'Opportunity areas'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {focuses.map(f => (
          <div key={f.label} className={`bg-${f.color}-500/5 border border-${f.color}-500/20 rounded-xl p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-6 h-6 rounded-full bg-${f.color}-500/20 flex items-center justify-center text-${f.color}-400 font-bold text-xs`}>{f.count}</span>
              <p className={`text-${f.color}-400 font-semibold text-sm`}>{f.label}</p>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Asset Allocation Bar ─────────────────────────────────────────────────
function AssetAllocationBar({ equity, mf, fd, rd, parked, total }: {
  equity: number; mf: number; fd: number; rd: number; parked: number; total: number;
}) {
  const segs = [
    { label: 'Equity', value: equity, color: 'bg-emerald-500' },
    { label: 'MF', value: mf, color: 'bg-blue-500' },
    { label: 'FD', value: fd, color: 'bg-amber-500' },
    { label: 'RD', value: rd, color: 'bg-cyan-500' },
    { label: 'Parked', value: parked, color: 'bg-slate-500' },
  ].filter(s => s.value > 0);

  if (!segs.length) return null;

  return (
    <div className="mt-5">
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
        {segs.map(s => (
          <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segs.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-slate-400 text-xs">{s.label}</span>
            <span className="text-slate-500 text-xs">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Per-client investment card ───────────────────────────────────────────
function ClientInvestmentCard({ summary, expanded, onToggle, onAdd, isBroker, onReload }: {
  summary: ClientInvestmentSummary;
  expanded: boolean;
  onToggle: () => void;
  onAdd: (type: 'fd' | 'rd' | 'parked' | 'stock' | 'mf') => void;
  isBroker: boolean;
  onReload: () => void;
}) {
  const { client, equity, mutualFunds, fixedDeposits, recurringDeposits, parked, total } = summary;
  const pnl = total.current - total.invested;
  const pct = total.invested > 0 ? (pnl / total.invested) * 100 : 0;

  return (
    <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden hover:border-slate-600 transition-all">
      {/* Client header row */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold flex-shrink-0">
          {client.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold">{client.full_name}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {client.pan_number && <span className="text-slate-500 text-xs font-mono">PAN: {client.pan_number}</span>}
            <span className="text-slate-600 text-xs">{client.email}</span>
          </div>
        </div>

        {/* Mini allocation pills */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          {equity.count > 0 && <Pill label="EQ" color="emerald" val={INR(equity.current)} />}
          {mutualFunds.count > 0 && <Pill label="MF" color="blue" val={INR(mutualFunds.current)} />}
          {fixedDeposits.count > 0 && <Pill label="FD" color="amber" val={INR(fixedDeposits.principal)} />}
          {recurringDeposits.count > 0 && <Pill label="RD" color="cyan" val={INR(recurringDeposits.totalDeposited)} />}
          {parked.count > 0 && <Pill label="PK" color="slate" val={INR(parked.amount)} />}
        </div>

        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-white font-bold">{INR(total.invested)}</p>
          <p className={`text-xs font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{PCT(pct)}</p>
        </div>
        <div className="ml-2 text-slate-500 flex-shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/30 p-5 space-y-4">
          {/* Add buttons */}
          <div className="flex flex-wrap gap-2">
            {(['fd', 'rd', 'parked'] as const).map(type => (
              <button key={type} onClick={() => onAdd(type)}
                className="flex items-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 border border-slate-600/40 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                <Plus size={11} />
                Add {type === 'fd' ? 'FD' : type === 'rd' ? 'RD' : 'Parked'}
              </button>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AssetBlock
              icon={<TrendingUp size={14} />}
              label="Equity Holdings"
              color="emerald"
              lines={[
                { label: 'Invested', value: INR(equity.invested) },
                { label: 'Current', value: INR(equity.current), highlight: true },
                { label: 'P&L', value: `${equity.current - equity.invested >= 0 ? '+' : ''}${INR(equity.current - equity.invested)}`, pnl: equity.current - equity.invested },
                { label: 'Holdings', value: String(equity.count) },
              ]}
              empty={equity.count === 0}
            />
            <AssetBlock
              icon={<BarChart2 size={14} />}
              label="Mutual Funds"
              color="blue"
              lines={[
                { label: 'Invested', value: INR(mutualFunds.invested) },
                { label: 'Current', value: INR(mutualFunds.current), highlight: true },
                { label: 'P&L', value: `${mutualFunds.current - mutualFunds.invested >= 0 ? '+' : ''}${INR(mutualFunds.current - mutualFunds.invested)}`, pnl: mutualFunds.current - mutualFunds.invested },
                { label: 'SIPs Active', value: String(mutualFunds.sipCount) },
              ]}
              empty={mutualFunds.count === 0}
            />
            <AssetBlock
              icon={<Landmark size={14} />}
              label="Fixed Deposits"
              color="amber"
              lines={[
                { label: 'Principal', value: INR(fixedDeposits.principal) },
                { label: 'At Maturity', value: INR(fixedDeposits.maturity), highlight: true },
                { label: 'Interest', value: `+${INR(fixedDeposits.maturity - fixedDeposits.principal)}`, pnl: fixedDeposits.maturity - fixedDeposits.principal },
                { label: 'Active FDs', value: String(fixedDeposits.activeCount) },
              ]}
              empty={fixedDeposits.count === 0}
            />
            <AssetBlock
              icon={<RefreshCw size={14} />}
              label="Recurring Deposits"
              color="cyan"
              lines={[
                { label: 'Total Deposited', value: INR(recurringDeposits.totalDeposited) },
                { label: 'At Maturity', value: INR(recurringDeposits.maturity), highlight: true },
                { label: 'Monthly RD', value: INR(recurringDeposits.monthlyInstallment) },
                { label: 'Active RDs', value: String(recurringDeposits.count) },
              ]}
              empty={recurringDeposits.count === 0}
            />
            <AssetBlock
              icon={<Wallet size={14} />}
              label="Parked / Liquid Funds"
              color="slate"
              lines={[
                { label: 'Amount', value: INR(parked.amount), highlight: true },
                { label: 'Instruments', value: String(parked.count) },
              ]}
              empty={parked.count === 0}
              wide
            />
          </div>

          {/* Total row */}
          <div className="bg-slate-800/60 border border-slate-700/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs">Total Invested</p>
              <p className="text-white font-bold text-lg">{INR(total.invested)}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs">Current Value</p>
              <p className="text-white font-bold text-lg">{INR(total.current)}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs">Overall P&L</p>
              <p className={`font-bold text-lg ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : '-'}{INR(pnl)} <span className="text-sm">({PCT(pct)})</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, color, val }: { label: string; color: string; val: string }) {
  return (
    <div className={`bg-${color}-500/10 border border-${color}-500/20 rounded-lg px-1.5 py-0.5 text-center`}>
      <p className={`text-${color}-400 text-xs font-bold`}>{label}</p>
      <p className="text-slate-400 text-xs">{val}</p>
    </div>
  );
}

function AssetBlock({ icon, label, color, lines, empty, wide }: {
  icon: React.ReactNode; label: string; color: string;
  lines: { label: string; value: string; highlight?: boolean; pnl?: number }[];
  empty?: boolean; wide?: boolean;
}) {
  return (
    <div className={`bg-${color}-500/5 border border-${color}-500/20 rounded-xl p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <div className={`flex items-center gap-2 mb-3 text-${color}-400`}>
        {icon}
        <p className="text-sm font-semibold">{label}</p>
        {empty && <span className="ml-auto text-slate-600 text-xs">None added</span>}
      </div>
      {empty ? (
        <p className={`text-${color}-400/40 text-xs`}>No records yet — add to track</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map(l => (
            <div key={l.label} className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">{l.label}</span>
              <span className={`text-xs font-semibold ${
                l.pnl !== undefined
                  ? l.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  : l.highlight ? `text-${color}-300` : 'text-slate-300'
              }`}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GrandCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`bg-${color}-500/5 border border-${color}-500/15 rounded-xl p-3`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-${color}-400 font-bold text-base leading-tight`}>{value}</p>
      <p className="text-slate-600 text-xs mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Add FD Modal ─────────────────────────────────────────────────────────
function AddFDModal({ clientId, onClose, onSave }: { clientId: string; onClose: () => void; onSave: () => void }) {
  const [f, setF] = useState({
    bank_name: '', fd_number: '', principal_amount: '', interest_rate: '',
    tenure_months: '12', start_date: new Date().toISOString().split('T')[0],
    maturity_date: '', maturity_amount: '', status: 'active', auto_renew: false, notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: string | boolean) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  // Auto-calculate maturity amount
  useEffect(() => {
    const p = parseFloat(f.principal_amount);
    const r = parseFloat(f.interest_rate);
    const t = parseInt(f.tenure_months);
    if (p > 0 && r > 0 && t > 0) {
      const maturity = p * Math.pow(1 + r / (4 * 100), 4 * t / 12);
      setF(prev => ({ ...prev, maturity_amount: maturity.toFixed(0) }));
    }
  }, [f.principal_amount, f.interest_rate, f.tenure_months]);

  function validate() {
    const e: Record<string, string> = {};
    if (!f.bank_name.trim()) e.bank_name = 'Bank name is required.';
    if (!f.principal_amount || parseFloat(f.principal_amount) <= 0) e.principal_amount = 'Enter a valid amount.';
    if (!f.interest_rate || parseFloat(f.interest_rate) <= 0) e.interest_rate = 'Enter interest rate.';
    if (!f.tenure_months || parseInt(f.tenure_months) <= 0) e.tenure_months = 'Enter tenure.';
    return e;
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await supabase.from('fixed_deposits').insert({
      client_id: clientId,
      bank_name: f.bank_name, fd_number: f.fd_number,
      principal_amount: parseFloat(f.principal_amount),
      interest_rate: parseFloat(f.interest_rate),
      tenure_months: parseInt(f.tenure_months),
      start_date: f.start_date || null,
      maturity_date: f.maturity_date || null,
      maturity_amount: parseFloat(f.maturity_amount) || 0,
      status: f.status, auto_renew: f.auto_renew, notes: f.notes,
    });
    setSaving(false); onSave(); onClose();
  }

  return (
    <FormModal title="Add Fixed Deposit" icon={<Landmark size={16} className="text-amber-400" />} onClose={onClose}>
      <div className="space-y-3">
        <Row2>
          <FField label="Bank Name *" error={errors.bank_name}>
            <input value={f.bank_name} onChange={e => upd('bank_name', e.target.value)} placeholder="HDFC Bank"
              className={inp(errors.bank_name)} />
          </FField>
          <FField label="FD Number">
            <input value={f.fd_number} onChange={e => upd('fd_number', e.target.value)} placeholder="FD/2024/001234"
              className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Principal Amount ₹ *" error={errors.principal_amount}>
            <input type="number" value={f.principal_amount} onChange={e => upd('principal_amount', e.target.value)} placeholder="100000"
              className={inp(errors.principal_amount)} />
          </FField>
          <FField label="Interest Rate % *" error={errors.interest_rate}>
            <input type="number" step="0.01" value={f.interest_rate} onChange={e => upd('interest_rate', e.target.value)} placeholder="7.25"
              className={inp(errors.interest_rate)} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Tenure (months) *" error={errors.tenure_months}>
            <input type="number" value={f.tenure_months} onChange={e => upd('tenure_months', e.target.value)} placeholder="12"
              className={inp(errors.tenure_months)} />
          </FField>
          <FField label="Maturity Amount ₹ (auto)">
            <input type="number" value={f.maturity_amount} onChange={e => upd('maturity_amount', e.target.value)}
              className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Start Date">
            <input type="date" value={f.start_date} onChange={e => upd('start_date', e.target.value)} className={inp()} />
          </FField>
          <FField label="Maturity Date">
            <input type="date" value={f.maturity_date} onChange={e => upd('maturity_date', e.target.value)} className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Status">
            <select value={f.status} onChange={e => upd('status', e.target.value)} className={inp()}>
              {['active','matured','broken','renewed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FField>
          <FField label="Auto-Renew">
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={f.auto_renew} onChange={e => upd('auto_renew', e.target.checked)}
                className="w-4 h-4 accent-amber-500" />
              <span className="text-slate-300 text-sm">Yes, auto-renew on maturity</span>
            </label>
          </FField>
        </Row2>
        <FField label="Notes">
          <textarea value={f.notes} onChange={e => upd('notes', e.target.value)} rows={2} className={`${inp()} resize-none`} />
        </FField>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} label="Add FD" />
    </FormModal>
  );
}

// ─── Add RD Modal ─────────────────────────────────────────────────────────
function AddRDModal({ clientId, onClose, onSave }: { clientId: string; onClose: () => void; onSave: () => void }) {
  const [f, setF] = useState({
    bank_name: '', rd_number: '', monthly_installment: '', interest_rate: '',
    tenure_months: '12', start_date: new Date().toISOString().split('T')[0],
    maturity_date: '', total_deposited: '', maturity_amount: '', status: 'active', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: string) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  useEffect(() => {
    const mi = parseFloat(f.monthly_installment);
    const t = parseInt(f.tenure_months);
    const r = parseFloat(f.interest_rate);
    if (mi > 0 && t > 0) {
      const total = mi * t;
      setF(prev => ({ ...prev, total_deposited: total.toFixed(0) }));
      if (r > 0) {
        // RD maturity formula: MI * [((1+r/400)^(4n/12) - 1) / (1 - (1+r/400)^(-1/3))] roughly
        const maturity = total * (1 + (r / 100) * (t / 12) / 2);
        setF(prev => ({ ...prev, maturity_amount: maturity.toFixed(0) }));
      }
    }
  }, [f.monthly_installment, f.tenure_months, f.interest_rate]);

  function validate() {
    const e: Record<string, string> = {};
    if (!f.bank_name.trim()) e.bank_name = 'Bank name is required.';
    if (!f.monthly_installment || parseFloat(f.monthly_installment) <= 0) e.monthly_installment = 'Enter monthly amount.';
    if (!f.tenure_months || parseInt(f.tenure_months) <= 0) e.tenure_months = 'Enter tenure.';
    return e;
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await supabase.from('recurring_deposits').insert({
      client_id: clientId,
      bank_name: f.bank_name, rd_number: f.rd_number,
      monthly_installment: parseFloat(f.monthly_installment),
      interest_rate: parseFloat(f.interest_rate) || 0,
      tenure_months: parseInt(f.tenure_months),
      start_date: f.start_date || null,
      maturity_date: f.maturity_date || null,
      total_deposited: parseFloat(f.total_deposited) || 0,
      maturity_amount: parseFloat(f.maturity_amount) || 0,
      status: f.status, notes: f.notes,
    });
    setSaving(false); onSave(); onClose();
  }

  return (
    <FormModal title="Add Recurring Deposit" icon={<RefreshCw size={16} className="text-cyan-400" />} onClose={onClose}>
      <div className="space-y-3">
        <Row2>
          <FField label="Bank Name *" error={errors.bank_name}>
            <input value={f.bank_name} onChange={e => upd('bank_name', e.target.value)} placeholder="SBI" className={inp(errors.bank_name)} />
          </FField>
          <FField label="RD Number">
            <input value={f.rd_number} onChange={e => upd('rd_number', e.target.value)} placeholder="Optional" className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Monthly Installment ₹ *" error={errors.monthly_installment}>
            <input type="number" value={f.monthly_installment} onChange={e => upd('monthly_installment', e.target.value)} placeholder="5000" className={inp(errors.monthly_installment)} />
          </FField>
          <FField label="Interest Rate %">
            <input type="number" step="0.01" value={f.interest_rate} onChange={e => upd('interest_rate', e.target.value)} placeholder="6.75" className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Tenure (months) *" error={errors.tenure_months}>
            <input type="number" value={f.tenure_months} onChange={e => upd('tenure_months', e.target.value)} placeholder="24" className={inp(errors.tenure_months)} />
          </FField>
          <FField label="Total Deposited ₹ (auto)">
            <input type="number" value={f.total_deposited} onChange={e => upd('total_deposited', e.target.value)} className={inp()} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Maturity Amount ₹ (est.)">
            <input type="number" value={f.maturity_amount} onChange={e => upd('maturity_amount', e.target.value)} className={inp()} />
          </FField>
          <FField label="Status">
            <select value={f.status} onChange={e => upd('status', e.target.value)} className={inp()}>
              {['active','matured','broken'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FField>
        </Row2>
        <Row2>
          <FField label="Start Date"><input type="date" value={f.start_date} onChange={e => upd('start_date', e.target.value)} className={inp()} /></FField>
          <FField label="Maturity Date"><input type="date" value={f.maturity_date} onChange={e => upd('maturity_date', e.target.value)} className={inp()} /></FField>
        </Row2>
        <FField label="Notes"><textarea value={f.notes} onChange={e => upd('notes', e.target.value)} rows={2} className={`${inp()} resize-none`} /></FField>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} label="Add RD" />
    </FormModal>
  );
}

// ─── Add Parked Modal ─────────────────────────────────────────────────────
function AddParkedModal({ clientId, onClose, onSave }: { clientId: string; onClose: () => void; onSave: () => void }) {
  const [f, setF] = useState({ fund_type: 'savings', institution: '', amount: '', interest_rate: '', notes: '', as_of_date: new Date().toISOString().split('T')[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: string) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  const FUND_TYPES = [
    { value: 'savings', label: 'Savings Account' },
    { value: 'liquid_fund', label: 'Liquid Fund' },
    { value: 'overnight_fund', label: 'Overnight Fund' },
    { value: 'sweep_fd', label: 'Sweep-in FD' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
  ];

  function validate() {
    const e: Record<string, string> = {};
    if (!f.institution.trim()) e.institution = 'Institution is required.';
    if (!f.amount || parseFloat(f.amount) <= 0) e.amount = 'Enter a valid amount.';
    return e;
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await supabase.from('parked_funds').insert({
      client_id: clientId,
      fund_type: f.fund_type, institution: f.institution,
      amount: parseFloat(f.amount),
      interest_rate: parseFloat(f.interest_rate) || 0,
      notes: f.notes, as_of_date: f.as_of_date,
    });
    setSaving(false); onSave(); onClose();
  }

  return (
    <FormModal title="Add Parked / Liquid Fund" icon={<Wallet size={16} className="text-slate-400" />} onClose={onClose}>
      <div className="space-y-3">
        <FField label="Type">
          <select value={f.fund_type} onChange={e => upd('fund_type', e.target.value)} className={inp()}>
            {FUND_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FField>
        <Row2>
          <FField label="Institution *" error={errors.institution}>
            <input value={f.institution} onChange={e => upd('institution', e.target.value)} placeholder="HDFC Bank / Zerodha" className={inp(errors.institution)} />
          </FField>
          <FField label="Amount ₹ *" error={errors.amount}>
            <input type="number" value={f.amount} onChange={e => upd('amount', e.target.value)} placeholder="50000" className={inp(errors.amount)} />
          </FField>
        </Row2>
        <Row2>
          <FField label="Interest Rate % (if any)">
            <input type="number" step="0.01" value={f.interest_rate} onChange={e => upd('interest_rate', e.target.value)} placeholder="3.5" className={inp()} />
          </FField>
          <FField label="As of Date">
            <input type="date" value={f.as_of_date} onChange={e => upd('as_of_date', e.target.value)} className={inp()} />
          </FField>
        </Row2>
        <FField label="Notes"><textarea value={f.notes} onChange={e => upd('notes', e.target.value)} rows={2} className={`${inp()} resize-none`} /></FField>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} label="Add Parked Fund" />
    </FormModal>
  );
}

// ─── Shared form helpers ──────────────────────────────────────────────────
const inp = (err?: string) =>
  `w-full bg-slate-700/40 border ${err ? 'border-red-500/60' : 'border-slate-600'} rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 ${err ? 'focus:ring-red-500/30' : 'focus:ring-blue-500/50'}`;

function FField({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-0.5 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function FormModal({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-2">{icon}<h3 className="text-white font-semibold text-sm">{title}</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, label }: { onClose: () => void; onSave: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-3 pt-4 border-t border-slate-700/40 mt-4">
      <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:text-white">Cancel</button>
      <button onClick={onSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold">
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-52 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />
      <div className="h-24 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 bg-[#111827] border border-slate-700/40 rounded-2xl">
      <Building2 size={32} className="text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400 text-sm">No clients assigned yet</p>
      <p className="text-slate-600 text-xs mt-1">Investment data will appear once clients are assigned</p>
    </div>
  );
}
