import { useEffect, useState, useCallback } from 'react';
import {
  Plus, TrendingUp, Wallet, PiggyBank, History,
  ChevronDown, ChevronUp, X, Save, AlertCircle,
  FileDown, Layers, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2, PauseCircle, BarChart3,
  DollarSign, Target, Percent, Edit2, Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type {
  FundPool, ClientAllocation, AllocationHistory,
  FundType, RiskLevel, AllocationStatus
} from '../lib/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

function fmtCompact(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toFixed(2)}`;
}

const FUND_TYPE_LABELS: Record<FundType, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fixed_deposit: 'Fixed Deposit',
  recurring_deposit: 'Recurring Deposit', bond: 'Bond', etf: 'ETF', other: 'Other',
};

const FUND_TYPE_COLORS: Record<FundType, string> = {
  equity: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  mutual_fund: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  fixed_deposit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  recurring_deposit: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  bond: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  etf: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const STATUS_COLORS: Record<AllocationStatus, string> = {
  active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  partially_exited: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  fully_exited: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  on_hold: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const ACTION_CONFIG = {
  invest: { label: 'Invested', color: 'text-emerald-400', icon: ArrowUpRight },
  park: { label: 'Parked', color: 'text-blue-400', icon: PiggyBank },
  unpark: { label: 'Unparked', color: 'text-amber-400', icon: ArrowDownRight },
  withdraw: { label: 'Withdrawn', color: 'text-red-400', icon: ArrowDownRight },
  adjustment: { label: 'Adjusted', color: 'text-slate-400', icon: Edit2 },
};

// ─── prop types ─────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  clientName: string;
  totalClientAmount?: number;
}

// ─── main component ──────────────────────────────────────────────────────────

export default function AllocationTab({ clientId, clientName, totalClientAmount = 0 }: Props) {
  const { profile, effectiveProfile, brokerInfo } = useAuth();
  const activeProfile = effectiveProfile ?? profile;
  const isBroker = profile?.role === 'broker';
  const brokerId = profile?.broker_id ?? (isBroker ? profile?.id : null);

  const [fundPools, setFundPools] = useState<FundPool[]>([]);
  const [allocations, setAllocations] = useState<ClientAllocation[]>([]);
  const [history, setHistory] = useState<AllocationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'allocations' | 'history'>('allocations');

  // modals
  const [showAddFund, setShowAddFund] = useState(false);
  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [showTransact, setShowTransact] = useState<ClientAllocation | null>(null);
  const [showManageFunds, setShowManageFunds] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [poolsR, allocR, histR] = await Promise.all([
      supabase.from('fund_pools').select('*').eq('is_active', true).order('name'),
      supabase.from('client_allocations').select('*, fund_pool:fund_pools(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('allocation_history').select('*, fund_pool:fund_pools(name,fund_type)').eq('client_id', clientId).order('action_date', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    setFundPools(poolsR.data ?? []);
    setAllocations((allocR.data ?? []) as ClientAllocation[]);
    setHistory((histR.data ?? []) as AllocationHistory[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // ── summary calcs ──
  const totalInvested = allocations.filter(a => a.status !== 'fully_exited').reduce((s, a) => s + a.amount, 0);
  const totalParked = allocations.filter(a => a.status !== 'fully_exited').reduce((s, a) => s + a.parked_amount, 0);
  const totalAllocated = totalInvested + totalParked;
  const remaining = totalClientAmount > 0 ? Math.max(0, totalClientAmount - totalAllocated) : 0;

  const activeAllocations = allocations.filter(a => a.status === 'active' || a.status === 'partially_exited' || a.status === 'on_hold');

  // fund type breakdown
  const byType: Record<string, number> = {};
  activeAllocations.forEach(a => {
    const ft = (a.fund_pool as FundPool)?.fund_type ?? 'other';
    byType[ft] = (byType[ft] ?? 0) + a.amount + a.parked_amount;
  });

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[#111827] border border-slate-700/40 rounded-2xl" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Allocated"
          value={fmtCompact(totalAllocated)}
          sub={totalClientAmount > 0 ? `${((totalAllocated / totalClientAmount) * 100).toFixed(1)}% of portfolio` : `${allocations.length} fund(s)`}
          icon={<Layers size={18} className="text-blue-400" />}
          color="blue"
        />
        <SummaryCard
          label="Invested"
          value={fmtCompact(totalInvested)}
          sub={`${activeAllocations.length} active position(s)`}
          icon={<TrendingUp size={18} className="text-emerald-400" />}
          color="emerald"
        />
        <SummaryCard
          label="Parked / Liquid"
          value={fmtCompact(totalParked)}
          sub="Awaiting deployment"
          icon={<PiggyBank size={18} className="text-amber-400" />}
          color="amber"
        />
        <SummaryCard
          label="Unallocated"
          value={totalClientAmount > 0 ? fmtCompact(remaining) : '—'}
          sub={totalClientAmount > 0 ? 'Available to invest' : 'Set client amount'}
          icon={<Wallet size={18} className="text-slate-400" />}
          color="slate"
        />
      </div>

      {/* Fund type breakdown bar */}
      {Object.keys(byType).length > 0 && (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-400 mb-3">Asset Allocation Breakdown</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {Object.entries(byType).map(([ft, amt]) => {
              const pct = totalAllocated > 0 ? (amt / totalAllocated) * 100 : 0;
              const colorMap: Record<string, string> = {
                equity: 'bg-blue-500', mutual_fund: 'bg-emerald-500',
                fixed_deposit: 'bg-amber-500', recurring_deposit: 'bg-orange-500',
                bond: 'bg-cyan-500', etf: 'bg-violet-500', other: 'bg-slate-500',
              };
              return <div key={ft} className={`${colorMap[ft] ?? 'bg-slate-500'} transition-all`} style={{ width: `${pct}%` }} title={`${FUND_TYPE_LABELS[ft as FundType] ?? ft}: ${pct.toFixed(1)}%`} />;
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(byType).map(([ft, amt]) => {
              const pct = totalAllocated > 0 ? (amt / totalAllocated) * 100 : 0;
              return (
                <div key={ft} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    ft === 'equity' ? 'bg-blue-500' : ft === 'mutual_fund' ? 'bg-emerald-500' :
                    ft === 'fixed_deposit' ? 'bg-amber-500' : ft === 'bond' ? 'bg-cyan-500' :
                    ft === 'etf' ? 'bg-violet-500' : ft === 'recurring_deposit' ? 'bg-orange-500' : 'bg-slate-500'
                  }`} />
                  {FUND_TYPE_LABELS[ft as FundType] ?? ft} — {pct.toFixed(1)}% ({fmtCompact(amt)})
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-[#111827] border border-slate-700/40 rounded-xl p-1">
          {(['allocations', 'history'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                view === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              {v === 'allocations' ? 'Allocations' : 'History'}
              {v === 'history' && history.length > 0 && (
                <span className="ml-1.5 bg-slate-700 text-slate-300 text-xs rounded-full px-1.5">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isBroker && (
            <button onClick={() => setShowManageFunds(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-xs transition-all">
              <BarChart3 size={13} />Manage Funds
            </button>
          )}
          <button onClick={() => setShowAddAllocation(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all">
            <Plus size={13} />Add Allocation
          </button>
          <ExportButton allocations={allocations} history={history} clientName={clientName} fundPools={fundPools} />
        </div>
      </div>

      {/* Allocations view */}
      {view === 'allocations' && (
        <div className="space-y-3">
          {allocations.length === 0 ? (
            <EmptyState
              icon={<Layers size={28} className="text-slate-600" />}
              message="No fund allocations yet"
              sub={isBroker ? 'Add funds first, then allocate to this client' : 'Ask your broker to set up funds, then allocate here'}
            />
          ) : (
            allocations.map(alloc => (
              <AllocationCard
                key={alloc.id}
                allocation={alloc}
                onTransact={() => setShowTransact(alloc)}
                onRefresh={load}
                isBroker={isBroker}
                canEdit={isBroker || activeProfile?.id !== undefined}
              />
            ))
          )}
        </div>
      )}

      {/* History view */}
      {view === 'history' && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <EmptyState
              icon={<History size={28} className="text-slate-600" />}
              message="No transaction history yet"
              sub="All fund movements will be tracked here"
            />
          ) : (
            <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden divide-y divide-slate-700/30">
              {history.map(h => <HistoryRow key={h.id} entry={h} />)}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showManageFunds && (
        <ManageFundsModal
          fundPools={fundPools}
          brokerId={brokerId!}
          userId={profile?.id ?? ''}
          onClose={() => { setShowManageFunds(false); load(); }}
        />
      )}

      {showAddFund && (
        <AddFundModal
          brokerId={brokerId!}
          userId={profile?.id ?? ''}
          onClose={() => { setShowAddFund(false); load(); }}
        />
      )}

      {showAddAllocation && (
        <AddAllocationModal
          clientId={clientId}
          brokerId={brokerId!}
          userId={profile?.id ?? ''}
          fundPools={fundPools}
          existingAllocations={allocations}
          onClose={() => { setShowAddAllocation(false); load(); }}
          onNeedFund={() => { setShowAddAllocation(false); setShowAddFund(true); }}
        />
      )}

      {showTransact && (
        <TransactModal
          allocation={showTransact}
          userId={profile?.id ?? ''}
          brokerId={brokerId!}
          onClose={() => { setShowTransact(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: React.ReactNode; color: string }) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/20',
    amber: 'bg-amber-500/10 border-amber-500/20',
    slate: 'bg-slate-500/10 border-slate-500/20',
  };
  return (
    <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center mb-3 ${bg[color]}`}>{icon}</div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
      <p className="text-slate-600 text-xs mt-1">{sub}</p>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div className="text-center py-12 bg-[#111827] border border-slate-700/40 rounded-2xl">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-slate-300 text-sm font-medium">{message}</p>
      <p className="text-slate-500 text-xs mt-1">{sub}</p>
    </div>
  );
}

// ─── AllocationCard ───────────────────────────────────────────────────────────

function AllocationCard({ allocation, onTransact, onRefresh, isBroker, canEdit }: {
  allocation: ClientAllocation;
  onTransact: () => void;
  onRefresh: () => void;
  isBroker: boolean;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fund = allocation.fund_pool as FundPool | undefined;
  const total = allocation.amount + allocation.parked_amount;
  const investedPct = total > 0 ? (allocation.amount / total) * 100 : 0;
  const expectedAnnualReturn = (allocation.amount * (allocation.expected_return_pct / 100));

  async function handleDelete() {
    if (!confirm('Remove this allocation? This cannot be undone.')) return;
    setDeleting(true);
    await supabase.from('client_allocations').delete().eq('id', allocation.id);
    setDeleting(false);
    onRefresh();
  }

  async function toggleStatus(s: AllocationStatus) {
    await supabase.from('client_allocations').update({ status: s, updated_at: new Date().toISOString() }).eq('id', allocation.id);
    onRefresh();
  }

  return (
    <div className={`bg-[#111827] border rounded-2xl overflow-hidden transition-all ${
      allocation.status === 'fully_exited' ? 'border-slate-700/20 opacity-60' : 'border-slate-700/40'
    }`}>
      {/* Header */}
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors text-left">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
          fund ? FUND_TYPE_COLORS[fund.fund_type] : 'bg-slate-500/10 border-slate-500/20'
        }`}>
          <TrendingUp size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-semibold">{fund?.name ?? 'Unknown Fund'}</p>
            {fund && <span className={`text-xs px-2 py-0.5 rounded-full border ${FUND_TYPE_COLORS[fund.fund_type]}`}>{FUND_TYPE_LABELS[fund.fund_type]}</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[allocation.status]}`}>{allocation.status.replace('_', ' ')}</span>
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-slate-400 text-xs">Invested: <span className="text-emerald-400 font-medium">{fmtCompact(allocation.amount)}</span></span>
            {allocation.parked_amount > 0 && <span className="text-slate-400 text-xs">Parked: <span className="text-amber-400 font-medium">{fmtCompact(allocation.parked_amount)}</span></span>}
            {allocation.expected_return_pct > 0 && <span className="text-slate-400 text-xs">Expected: <span className="text-blue-400 font-medium">{allocation.expected_return_pct}% p.a.</span></span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-white text-sm font-bold">{fmtCompact(total)}</p>
            <p className="text-slate-500 text-xs">Total</p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-700/40 p-5 space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Invested ({investedPct.toFixed(0)}%)</span>
              <span>Parked ({(100 - investedPct).toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 transition-all" style={{ width: `${investedPct}%` }} />
              <div className="bg-amber-500 transition-all" style={{ width: `${100 - investedPct}%` }} />
            </div>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DetailCell label="Invested Amount" value={fmt(allocation.amount)} />
            <DetailCell label="Parked Amount" value={fmt(allocation.parked_amount)} />
            <DetailCell label="Total Deployed" value={fmt(total)} />
            <DetailCell label="Expected Return" value={expectedAnnualReturn > 0 ? `${fmt(expectedAnnualReturn)}/yr` : '—'} />
            <DetailCell label="Allocation Date" value={new Date(allocation.allocation_date).toLocaleDateString('en-IN')} />
            <DetailCell label="Return Rate" value={allocation.expected_return_pct > 0 ? `${allocation.expected_return_pct}% p.a.` : '—'} />
            {fund && <DetailCell label="Risk Level" value={fund.risk_level.charAt(0).toUpperCase() + fund.risk_level.slice(1)} />}
            {fund?.min_investment ? <DetailCell label="Min Investment" value={fmtCompact(fund.min_investment)} /> : null}
          </div>

          {allocation.notes && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-slate-500 text-xs mb-1">Notes</p>
              <p className="text-slate-300 text-sm">{allocation.notes}</p>
            </div>
          )}

          {fund?.description && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-slate-500 text-xs mb-1">Fund Description</p>
              <p className="text-slate-400 text-xs">{fund.description}</p>
            </div>
          )}

          {/* Actions */}
          {canEdit && allocation.status !== 'fully_exited' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={onTransact}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all">
                <DollarSign size={12} />Transact / Update
              </button>
              {allocation.status === 'active' && (
                <button onClick={() => toggleStatus('on_hold')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs transition-all">
                  <PauseCircle size={12} />Put on Hold
                </button>
              )}
              {allocation.status === 'on_hold' && (
                <button onClick={() => toggleStatus('active')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs transition-all">
                  <CheckCircle2 size={12} />Reactivate
                </button>
              )}
              {isBroker && (
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs transition-all ml-auto">
                  <Trash2 size={12} />{deleting ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-3">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-medium">{value}</p>
    </div>
  );
}

// ─── HistoryRow ───────────────────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: AllocationHistory }) {
  const cfg = ACTION_CONFIG[entry.action_type];
  const Icon = cfg.icon;
  const isPositive = entry.action_type === 'invest' || entry.action_type === 'park' || (entry.action_type === 'adjustment' && entry.amount >= 0);
  const fund = entry.fund_pool as { name?: string; fund_type?: string } | undefined;

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-700/20 transition-colors">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        entry.action_type === 'invest' ? 'bg-emerald-500/10' :
        entry.action_type === 'park' ? 'bg-blue-500/10' :
        entry.action_type === 'withdraw' ? 'bg-red-500/10' :
        entry.action_type === 'unpark' ? 'bg-amber-500/10' : 'bg-slate-500/10'
      }`}>
        <Icon size={14} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-slate-400 text-xs">{fund?.name ?? 'Unknown Fund'}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-slate-600 text-xs flex items-center gap-1">
            <Clock size={10} />
            {new Date(entry.action_date).toLocaleDateString('en-IN')}
          </span>
          {entry.notes && <span className="text-slate-600 text-xs truncate max-w-[200px]">{entry.notes}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? '+' : '-'}{fmtCompact(Math.abs(entry.amount))}
        </p>
        <p className="text-slate-500 text-xs">Bal: {fmtCompact(entry.balance_after)}</p>
      </div>
    </div>
  );
}

// ─── AddFundModal ─────────────────────────────────────────────────────────────

interface AddFundForm {
  name: string;
  fund_type: FundType;
  description: string;
  expected_return_pct: string;
  risk_level: RiskLevel;
  min_investment: string;
}

function AddFundModal({ brokerId, userId, onClose }: { brokerId: string; userId: string; onClose: () => void }) {
  const [form, setForm] = useState<AddFundForm>({
    name: '', fund_type: 'mutual_fund', description: '',
    expected_return_pct: '', risk_level: 'moderate', min_investment: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.name.trim()) { setErr('Fund name is required'); return; }
    if (!brokerId) { setErr('Broker ID not found'); return; }
    setSaving(true);
    const { error } = await supabase.from('fund_pools').insert({
      broker_id: brokerId,
      name: form.name.trim(),
      fund_type: form.fund_type,
      description: form.description.trim(),
      expected_return_pct: parseFloat(form.expected_return_pct) || 0,
      risk_level: form.risk_level,
      min_investment: parseFloat(form.min_investment) || 0,
      created_by: userId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onClose();
  }

  return (
    <Modal title="Add New Fund" onClose={onClose}>
      <div className="space-y-4">
        {err && <ErrBanner msg={err} />}
        <Field label="Fund Name *">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. HDFC Flexi Cap Fund" className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fund Type">
            <select value={form.fund_type} onChange={e => setForm(p => ({ ...p, fund_type: e.target.value as FundType }))} className={INPUT}>
              {Object.entries(FUND_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Risk Level">
            <select value={form.risk_level} onChange={e => setForm(p => ({ ...p, risk_level: e.target.value as RiskLevel }))} className={INPUT}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Expected Return (% p.a.)">
            <input type="number" value={form.expected_return_pct} onChange={e => setForm(p => ({ ...p, expected_return_pct: e.target.value }))}
              placeholder="12.5" className={INPUT} />
          </Field>
          <Field label="Min Investment (₹)">
            <input type="number" value={form.min_investment} onChange={e => setForm(p => ({ ...p, min_investment: e.target.value }))}
              placeholder="5000" className={INPUT} />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Brief description of this fund..." rows={2} className={INPUT + ' resize-none'} />
        </Field>
        <ModalActions onCancel={onClose} onSave={save} saving={saving} saveLabel="Create Fund" />
      </div>
    </Modal>
  );
}

// ─── ManageFundsModal ─────────────────────────────────────────────────────────

function ManageFundsModal({ fundPools, brokerId, userId, onClose }: {
  fundPools: FundPool[]; brokerId: string; userId: string; onClose: () => void;
}) {
  const [pools, setPools] = useState<FundPool[]>(fundPools);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    const { data } = await supabase.from('fund_pools').select('*').order('name');
    setPools(data ?? []);
    setLoading(false);
  }

  async function toggleActive(pool: FundPool) {
    await supabase.from('fund_pools').update({ is_active: !pool.is_active }).eq('id', pool.id);
    reload();
  }

  async function deletePool(id: string) {
    if (!confirm('Delete this fund? Existing allocations will be preserved.')) return;
    await supabase.from('fund_pools').delete().eq('id', id);
    reload();
  }

  return (
    <Modal title="Manage Fund Pools" onClose={onClose} wide>
      {showAdd ? (
        <AddFundModal brokerId={brokerId} userId={userId} onClose={() => { setShowAdd(false); reload(); }} />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all">
              <Plus size={13} />New Fund
            </button>
          </div>
          {loading ? <div className="h-20 animate-pulse bg-slate-800 rounded-xl" /> : (
            pools.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No funds created yet</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pools.map(p => (
                  <div key={p.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    p.is_active ? 'bg-slate-800/50 border-slate-700/40' : 'bg-slate-800/20 border-slate-700/20 opacity-60'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{p.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${FUND_TYPE_COLORS[p.fund_type]}`}>{FUND_TYPE_LABELS[p.fund_type]}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${RISK_COLORS[p.risk_level]}`}>{p.risk_level}</span>
                        {!p.is_active && <span className="text-xs text-slate-500 border border-slate-600/30 px-1.5 py-0.5 rounded">Inactive</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {p.expected_return_pct > 0 && <span>{p.expected_return_pct}% p.a.</span>}
                        {p.min_investment > 0 && <span>Min: {fmtCompact(p.min_investment)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(p)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-all ${
                          p.is_active
                            ? 'border-slate-600 text-slate-400 hover:text-white'
                            : 'border-emerald-600/30 text-emerald-400 hover:bg-emerald-500/10'
                        }`}>
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deletePool(p.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 hover:text-white text-xs transition-all">Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── AddAllocationModal ───────────────────────────────────────────────────────

function AddAllocationModal({ clientId, brokerId, userId, fundPools, existingAllocations, onClose, onNeedFund }: {
  clientId: string; brokerId: string; userId: string;
  fundPools: FundPool[]; existingAllocations: ClientAllocation[];
  onClose: () => void; onNeedFund: () => void;
}) {
  const [selectedFund, setSelectedFund] = useState(fundPools[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [parked, setParked] = useState('');
  const [returnPct, setReturnPct] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fund = fundPools.find(f => f.id === selectedFund);

  useEffect(() => {
    if (fund) setReturnPct(fund.expected_return_pct > 0 ? String(fund.expected_return_pct) : '');
  }, [selectedFund, fund]);

  async function save() {
    if (!selectedFund) { setErr('Select a fund'); return; }
    const investAmt = parseFloat(amount) || 0;
    const parkAmt = parseFloat(parked) || 0;
    if (investAmt <= 0 && parkAmt <= 0) { setErr('Enter invested or parked amount'); return; }

    setSaving(true);
    const { data: alloc, error } = await supabase.from('client_allocations').insert({
      client_id: clientId,
      fund_pool_id: selectedFund,
      broker_id: brokerId,
      allocated_by: userId,
      amount: investAmt,
      parked_amount: parkAmt,
      notes: notes.trim(),
      allocation_date: date,
      expected_return_pct: parseFloat(returnPct) || 0,
      status: 'active',
    }).select().maybeSingle();

    if (error) { setErr(error.message); setSaving(false); return; }

    if (alloc && (investAmt > 0 || parkAmt > 0)) {
      const histEntries = [];
      if (investAmt > 0) {
        histEntries.push({
          allocation_id: alloc.id, client_id: clientId, fund_pool_id: selectedFund,
          broker_id: brokerId, action_by: userId, action_type: 'invest',
          amount: investAmt, balance_after: investAmt + parkAmt,
          notes: notes.trim(), action_date: date,
        });
      }
      if (parkAmt > 0) {
        histEntries.push({
          allocation_id: alloc.id, client_id: clientId, fund_pool_id: selectedFund,
          broker_id: brokerId, action_by: userId, action_type: 'park',
          amount: parkAmt, balance_after: investAmt + parkAmt,
          notes: notes.trim(), action_date: date,
        });
      }
      if (histEntries.length > 0) await supabase.from('allocation_history').insert(histEntries);
    }

    setSaving(false);
    onClose();
  }

  if (fundPools.length === 0) {
    return (
      <Modal title="Add Allocation" onClose={onClose}>
        <div className="text-center py-8 space-y-4">
          <BarChart3 size={32} className="text-slate-600 mx-auto" />
          <p className="text-slate-300 text-sm">No fund pools available yet</p>
          <p className="text-slate-500 text-xs">Funds must be created by the broker before allocating</p>
          <button onClick={onNeedFund} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all mx-auto">
            <Plus size={14} />Create First Fund
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New Fund Allocation" onClose={onClose}>
      <div className="space-y-4">
        {err && <ErrBanner msg={err} />}

        <Field label="Select Fund *">
          <select value={selectedFund} onChange={e => setSelectedFund(e.target.value)} className={INPUT}>
            {fundPools.map(f => (
              <option key={f.id} value={f.id}>{f.name} — {FUND_TYPE_LABELS[f.fund_type]}</option>
            ))}
          </select>
        </Field>

        {fund && (
          <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${FUND_TYPE_COLORS[fund.fund_type]}`}>{FUND_TYPE_LABELS[fund.fund_type]}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${RISK_COLORS[fund.risk_level]}`}>{fund.risk_level} risk</span>
            {fund.expected_return_pct > 0 && <span className="text-xs text-emerald-400">{fund.expected_return_pct}% p.a.</span>}
            {fund.min_investment > 0 && <span className="text-xs text-slate-400">Min: {fmtCompact(fund.min_investment)}</span>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount to Invest (₹)">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className={INPUT} />
          </Field>
          <Field label="Amount to Park (₹)">
            <input type="number" value={parked} onChange={e => setParked(e.target.value)}
              placeholder="0.00" className={INPUT} />
          </Field>
          <Field label="Expected Return (% p.a.)">
            <input type="number" value={returnPct} onChange={e => setReturnPct(e.target.value)}
              placeholder={fund?.expected_return_pct ? String(fund.expected_return_pct) : '12'} className={INPUT} />
          </Field>
          <Field label="Allocation Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
          </Field>
        </div>

        {(parseFloat(amount) > 0 || parseFloat(parked) > 0) && (
          <div className="bg-slate-800/50 rounded-xl px-4 py-3 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between"><span>Invested:</span><span className="text-emerald-400 font-medium">{fmt(parseFloat(amount) || 0)}</span></div>
            <div className="flex justify-between"><span>Parked:</span><span className="text-amber-400 font-medium">{fmt(parseFloat(parked) || 0)}</span></div>
            <div className="flex justify-between font-semibold text-white border-t border-slate-700 pt-1 mt-1">
              <span>Total:</span><span>{fmt((parseFloat(amount) || 0) + (parseFloat(parked) || 0))}</span>
            </div>
            {parseFloat(returnPct) > 0 && parseFloat(amount) > 0 && (
              <div className="flex justify-between text-blue-400 border-t border-slate-700 pt-1 mt-1">
                <span>Expected Annual Return:</span>
                <span>{fmt((parseFloat(amount) || 0) * (parseFloat(returnPct) / 100))}</span>
              </div>
            )}
          </div>
        )}

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Allocation notes, strategy..." rows={2} className={INPUT + ' resize-none'} />
        </Field>

        <ModalActions onCancel={onClose} onSave={save} saving={saving} saveLabel="Allocate" />
      </div>
    </Modal>
  );
}

// ─── TransactModal ────────────────────────────────────────────────────────────

function TransactModal({ allocation, userId, brokerId, onClose }: {
  allocation: ClientAllocation; userId: string; brokerId: string; onClose: () => void;
}) {
  const [action, setAction] = useState<'invest' | 'park' | 'unpark' | 'withdraw'>('invest');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fund = allocation.fund_pool as FundPool | undefined;

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }

    let newInvested = allocation.amount;
    let newParked = allocation.parked_amount;

    if (action === 'invest') { newInvested += amt; }
    else if (action === 'park') { newParked += amt; }
    else if (action === 'unpark') {
      if (amt > newParked) { setErr(`Cannot unpark more than parked amount (${fmt(newParked)})`); return; }
      newParked -= amt;
      newInvested += amt;
    } else if (action === 'withdraw') {
      if (amt > newInvested + newParked) { setErr(`Cannot withdraw more than total (${fmt(newInvested + newParked)})`); return; }
      if (amt <= newInvested) { newInvested -= amt; }
      else { newParked -= (amt - newInvested); newInvested = 0; }
    }

    const newStatus: AllocationStatus = (newInvested + newParked === 0) ? 'fully_exited'
      : (newInvested + newParked < allocation.amount + allocation.parked_amount) ? 'partially_exited'
      : 'active';

    setSaving(true);
    const { error: upErr } = await supabase.from('client_allocations').update({
      amount: newInvested,
      parked_amount: newParked,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', allocation.id);

    if (upErr) { setErr(upErr.message); setSaving(false); return; }

    await supabase.from('allocation_history').insert({
      allocation_id: allocation.id,
      client_id: allocation.client_id,
      fund_pool_id: allocation.fund_pool_id,
      broker_id: brokerId,
      action_by: userId,
      action_type: action,
      amount: (action === 'withdraw') ? -amt : amt,
      balance_after: newInvested + newParked,
      notes: notes.trim(),
      action_date: date,
    });

    setSaving(false);
    onClose();
  }

  const actions = [
    { id: 'invest' as const, label: 'Add Investment', color: 'emerald', desc: 'Add more invested capital' },
    { id: 'park' as const, label: 'Park Funds', color: 'blue', desc: 'Move funds to parked / liquid' },
    { id: 'unpark' as const, label: 'Deploy Parked', color: 'amber', desc: 'Move parked funds to invested' },
    { id: 'withdraw' as const, label: 'Withdraw', color: 'red', desc: 'Remove capital from this fund' },
  ];

  return (
    <Modal title={`Transact — ${fund?.name ?? 'Fund'}`} onClose={onClose}>
      <div className="space-y-4">
        {err && <ErrBanner msg={err} />}

        <div className="bg-slate-800/50 rounded-xl px-4 py-3 grid grid-cols-3 gap-3 text-center">
          <div><p className="text-xs text-slate-500 mb-0.5">Invested</p><p className="text-emerald-400 font-bold text-sm">{fmtCompact(allocation.amount)}</p></div>
          <div><p className="text-xs text-slate-500 mb-0.5">Parked</p><p className="text-amber-400 font-bold text-sm">{fmtCompact(allocation.parked_amount)}</p></div>
          <div><p className="text-xs text-slate-500 mb-0.5">Total</p><p className="text-white font-bold text-sm">{fmtCompact(allocation.amount + allocation.parked_amount)}</p></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {actions.map(a => (
            <button key={a.id} onClick={() => setAction(a.id)}
              className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                action === a.id
                  ? `bg-${a.color}-600 border-${a.color}-500 text-white`
                  : 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'
              }`}>
              <p className="font-semibold">{a.label}</p>
              <p className={`text-xs mt-0.5 ${action === a.id ? 'text-white/70' : 'text-slate-600'}`}>{a.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹) *">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className={INPUT} autoFocus />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Transaction reason or notes..." rows={2} className={INPUT + ' resize-none'} />
        </Field>

        <ModalActions onCancel={onClose} onSave={save} saving={saving}
          saveLabel={action === 'invest' ? 'Record Investment' : action === 'park' ? 'Park Funds' : action === 'unpark' ? 'Deploy Parked' : 'Withdraw'} />
      </div>
    </Modal>
  );
}

// ─── ExportButton ─────────────────────────────────────────────────────────────

function ExportButton({ allocations, history, clientName, fundPools }: {
  allocations: ClientAllocation[];
  history: AllocationHistory[];
  clientName: string;
  fundPools: FundPool[];
}) {
  const [open, setOpen] = useState(false);

  function exportCSV() {
    const date = new Date().toLocaleDateString('en-IN');
    const rows = [
      ['Fund Allocation Report', clientName, '', '', '', date],
      [],
      ['CURRENT ALLOCATIONS'],
      ['Fund Name', 'Type', 'Invested (₹)', 'Parked (₹)', 'Total (₹)', 'Return %', 'Expected Annual Return (₹)', 'Status', 'Allocation Date', 'Notes'],
      ...allocations.map(a => {
        const f = a.fund_pool as FundPool | undefined;
        const total = a.amount + a.parked_amount;
        const annualReturn = a.amount * (a.expected_return_pct / 100);
        return [
          f?.name ?? 'Unknown',
          f ? FUND_TYPE_LABELS[f.fund_type] : '',
          a.amount.toFixed(2),
          a.parked_amount.toFixed(2),
          total.toFixed(2),
          a.expected_return_pct > 0 ? `${a.expected_return_pct}%` : '',
          annualReturn > 0 ? annualReturn.toFixed(2) : '',
          a.status.replace('_', ' '),
          a.allocation_date,
          a.notes,
        ];
      }),
      [],
      ['TOTALS'],
      ['', '', allocations.reduce((s, a) => s + a.amount, 0).toFixed(2), allocations.reduce((s, a) => s + a.parked_amount, 0).toFixed(2), allocations.reduce((s, a) => s + a.amount + a.parked_amount, 0).toFixed(2)],
      [],
      ['TRANSACTION HISTORY'],
      ['Date', 'Fund', 'Action', 'Amount (₹)', 'Balance After (₹)', 'Notes'],
      ...history.map(h => {
        const f = h.fund_pool as { name?: string } | undefined;
        return [
          h.action_date,
          f?.name ?? 'Unknown',
          ACTION_CONFIG[h.action_type].label,
          h.amount.toFixed(2),
          h.balance_after.toFixed(2),
          h.notes,
        ];
      }),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, '_')}_Allocation_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  function exportPDF() {
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const totalInvested = allocations.reduce((s, a) => s + a.amount, 0);
    const totalParked = allocations.reduce((s, a) => s + a.parked_amount, 0);
    const totalAllocated = totalInvested + totalParked;

    const fundRows = allocations.map(a => {
      const f = a.fund_pool as FundPool | undefined;
      const total = a.amount + a.parked_amount;
      const pct = totalAllocated > 0 ? ((total / totalAllocated) * 100).toFixed(1) : '0';
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;color:#111827">${f?.name ?? 'Unknown'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151">${f ? FUND_TYPE_LABELS[f.fund_type] : ''}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#059669;font-weight:500">₹${a.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#d97706;font-weight:500">₹${a.parked_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#111827">₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${pct}%</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#2563eb">${a.expected_return_pct > 0 ? `${a.expected_return_pct}%` : '—'}</td>
        </tr>`;
    }).join('');

    const histRows = history.slice(0, 20).map(h => {
      const f = h.fund_pool as { name?: string } | undefined;
      const isPos = h.amount >= 0;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${new Date(h.action_date).toLocaleDateString('en-IN')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${f?.name ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${ACTION_CONFIG[h.action_type].label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:${isPos ? '#059669' : '#dc2626'}">${isPos ? '+' : ''}₹${h.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280">₹${h.balance_after.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Fund Allocation — ${clientName}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #111827; background: #fff; }
  .header { background: linear-gradient(135deg, #1e3a5f 0%, #1a5276 100%); color: white; padding: 32px; border-radius: 12px; margin-bottom: 32px; }
  .header h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; }
  .header p { margin: 0; opacity: 0.8; font-size: 14px; }
  .header .date { margin-top: 12px; font-size: 12px; opacity: 0.7; }
  .summary { display: flex; gap: 16px; margin-bottom: 32px; }
  .summary-card { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
  .summary-card .label { font-size: 12px; color: #6b7280; }
  h2 { font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 13px; }
  thead th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
  thead th:nth-child(n+3) { text-align: right; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
  @media print { body { padding: 20px; } .header { -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  <h1>Fund Allocation Report</h1>
  <p>${clientName}</p>
  <div class="date">Generated on ${date}</div>
</div>
<div class="summary">
  <div class="summary-card"><div class="value">₹${totalAllocated.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div><div class="label">Total Allocated</div></div>
  <div class="summary-card"><div class="value" style="color:#059669">₹${totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div><div class="label">Invested</div></div>
  <div class="summary-card"><div class="value" style="color:#d97706">₹${totalParked.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div><div class="label">Parked / Liquid</div></div>
  <div class="summary-card"><div class="value">${allocations.length}</div><div class="label">Fund(s)</div></div>
</div>
<h2>Current Allocations</h2>
<table>
  <thead><tr>
    <th>Fund</th><th>Type</th><th>Invested</th><th>Parked</th><th>Total</th><th>Allocation %</th><th>Return % p.a.</th>
  </tr></thead>
  <tbody>${fundRows}</tbody>
  <tfoot><tr style="background:#f9fafb;font-weight:700">
    <td colspan="2" style="padding:10px 12px">Total</td>
    <td style="padding:10px 12px;text-align:right;color:#059669">₹${totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
    <td style="padding:10px 12px;text-align:right;color:#d97706">₹${totalParked.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
    <td style="padding:10px 12px;text-align:right">₹${totalAllocated.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
    <td style="padding:10px 12px;text-align:right">100%</td>
    <td></td>
  </tr></tfoot>
</table>
${history.length > 0 ? `<h2>Recent Transaction History${history.length > 20 ? ' (Last 20)' : ''}</h2>
<table>
  <thead><tr><th>Date</th><th>Fund</th><th>Action</th><th>Amount</th><th>Balance After</th></tr></thead>
  <tbody>${histRows}</tbody>
</table>` : ''}
<div class="footer">Confidential — For client use only &bull; ${date}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.print(); };
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-xs transition-all">
        <FileDown size={13} />Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-[#111827] border border-slate-700/40 rounded-xl overflow-hidden shadow-xl z-50">
          <button onClick={exportCSV}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors text-left">
            <FileDown size={13} className="text-emerald-400" />Export as CSV
          </button>
          <button onClick={exportPDF}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors text-left border-t border-slate-700/40">
            <FileDown size={13} className="text-red-400" />Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ─── tiny shared ui ───────────────────────────────────────────────────────────

const INPUT = 'w-full bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-xs">{msg}</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`bg-[#0f172a] border border-slate-700/40 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"><X size={16} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 text-xs font-medium hover:text-white transition-all">Cancel</button>
      <button onClick={onSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all">
        {saving ? 'Saving...' : <><Save size={12} />{saveLabel}</>}
      </button>
    </div>
  );
}
