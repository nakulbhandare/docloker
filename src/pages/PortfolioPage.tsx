import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Plus, Search, Trash2, X, Percent, Award, IndianRupee } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Client, StockHolding, MutualFund } from '../lib/types';

interface Incentive { return_percentage: number; notes: string; }
interface ClientSummary { client: Client; totalInvested: number; currentValue: number; }

export default function PortfolioPage() {
  const { user, effectiveProfile } = useAuth();
  const role = effectiveProfile?.role ?? 'broker';
  const effectiveUserId = effectiveProfile?.id ?? user?.id;

  const [clients, setClients] = useState<Client[]>([]);
  const [selClient, setSelClient] = useState<Client | null>(null);
  const [stocks, setStocks] = useState<StockHolding[]>([]);
  const [mfs, setMFs] = useState<MutualFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddMF, setShowAddMF] = useState(false);

  // Employee incentive summary
  const [incentive, setIncentive] = useState<Incentive | null>(null);
  const [clientSummaries, setClientSummaries] = useState<ClientSummary[]>([]);
  const [loadingIncentive, setLoadingIncentive] = useState(false);

  useEffect(() => { if (user) loadClients(); }, [user, effectiveProfile]);

  async function loadClients() {
    if (!user || !effectiveUserId) return;
    setLoading(true);
    let q = supabase.from('clients').select('*').order('full_name');
    if (role === 'employee') {
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', effectiveUserId);
      const ids = (ec ?? []).map(r => r.client_id);
      if (!ids.length) { setClients([]); setLoading(false); return; }
      q = q.in('id', ids);
    } else {
      q = q.eq('broker_id', user.id);
    }
    const { data } = await q;
    const list = data ?? [];
    setClients(list);
    if (list.length) { setSelClient(list[0]); loadPortfolio(list[0].id); }
    else setLoading(false);

    if (role === 'employee') {
      loadIncentiveSummary(list, effectiveUserId);
    }
  }

  async function loadPortfolio(cid: string) {
    setLoading(true);
    const [sr, mr] = await Promise.all([
      supabase.from('stock_holdings').select('*').eq('client_id', cid).order('symbol'),
      supabase.from('mutual_funds').select('*').eq('client_id', cid).order('fund_name'),
    ]);
    setStocks(sr.data ?? []);
    setMFs(mr.data ?? []);
    setLoading(false);
  }

  async function loadIncentiveSummary(clientList: Client[], empId: string) {
    setLoadingIncentive(true);
    // Load incentive set by broker
    const { data: inc } = await supabase.from('employee_incentives').select('*').eq('employee_id', empId).maybeSingle();
    if (inc) setIncentive({ return_percentage: inc.return_percentage, notes: inc.notes });
    else setIncentive(null);

    // Load portfolio totals for all clients
    const summaries: ClientSummary[] = [];
    for (const c of clientList) {
      const [sr, mr] = await Promise.all([
        supabase.from('stock_holdings').select('quantity, buy_price, current_price').eq('client_id', c.id),
        supabase.from('mutual_funds').select('amount, units, nav_value').eq('client_id', c.id),
      ]);
      const stockInvested = (sr.data ?? []).reduce((s, h) => s + h.quantity * h.buy_price, 0);
      const stockCurrent = (sr.data ?? []).reduce((s, h) => s + h.quantity * h.current_price, 0);
      const mfInvested = (mr.data ?? []).reduce((s, m) => s + m.amount, 0);
      const mfCurrent = (mr.data ?? []).reduce((s, m) => s + m.units * m.nav_value, 0);
      summaries.push({
        client: c,
        totalInvested: stockInvested + mfInvested,
        currentValue: stockCurrent + mfCurrent,
      });
    }
    setClientSummaries(summaries);
    setLoadingIncentive(false);
  }

  const totalStock = stocks.reduce((s, h) => s + h.quantity * h.current_price, 0);
  const totalMF = mfs.reduce((s, m) => s + m.units * m.nav_value, 0);

  const filteredStocks = stocks.filter(s => s.symbol.toLowerCase().includes(search.toLowerCase()) || s.notes.toLowerCase().includes(search.toLowerCase()));
  const filteredMFs = mfs.filter(m => m.fund_name.toLowerCase().includes(search.toLowerCase()));

  const grandTotalInvested = clientSummaries.reduce((s, c) => s + c.totalInvested, 0);
  const grandCurrentValue = clientSummaries.reduce((s, c) => s + c.currentValue, 0);
  const grandPnL = grandCurrentValue - grandTotalInvested;
  const grandPnLPct = grandTotalInvested > 0 ? (grandPnL / grandTotalInvested) * 100 : 0;
  const incentiveAmount = incentive ? (grandTotalInvested * incentive.return_percentage) / 100 : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Portfolio Management</h1>
        <p className="text-slate-400 text-sm mt-1">NSE/BSE stocks and mutual fund investments</p>
      </div>

      {/* Employee Incentive Summary (shown only in employee view) */}
      {role === 'employee' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Award size={18} className="text-blue-400" />
              <h2 className="text-white font-semibold">Your Portfolio Summary</h2>
              <span className="ml-auto text-xs text-slate-500">{clients.length} clients</span>
            </div>
            {loadingIncentive ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-700/30 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Total Invested" value={`₹${grandTotalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub="Across all clients" color="blue" />
                <SummaryCard label="Current Value" value={`₹${grandCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub="Market value" color="cyan" />
                <SummaryCard
                  label="Total P&L"
                  value={`${grandPnL >= 0 ? '+' : ''}₹${Math.abs(grandPnL).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  sub={`${grandPnLPct >= 0 ? '+' : ''}${grandPnLPct.toFixed(2)}% return`}
                  color={grandPnL >= 0 ? 'emerald' : 'red'}
                />
                <SummaryCard
                  label="Your Incentive"
                  value={incentive ? `₹${incentiveAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'Not set'}
                  sub={incentive ? `${incentive.return_percentage}% of invested` : 'Set by broker'}
                  color="amber"
                  badge={incentive ? `${incentive.return_percentage}%` : undefined}
                />
              </div>
            )}
          </div>

          {/* Per-client breakdown */}
          {!loadingIncentive && clientSummaries.length > 0 && (
            <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700/40 bg-slate-800/30">
                <h3 className="text-white text-sm font-semibold">Client-wise Breakdown</h3>
              </div>
              <div className="divide-y divide-slate-700/20">
                {clientSummaries.map(({ client, totalInvested, currentValue }) => {
                  const pnl = currentValue - totalInvested;
                  const pct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
                  const inc = incentive ? (totalInvested * incentive.return_percentage) / 100 : 0;
                  return (
                    <div key={client.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-700/20 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0 text-emerald-400 font-bold text-sm">
                        {client.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{client.full_name}</p>
                        <p className="text-slate-500 text-xs">Invested: ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </p>
                        {incentive && (
                          <p className="text-amber-400/80 text-xs flex items-center justify-end gap-1">
                            <Percent size={10} />₹{inc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-slate-700/40 pt-2">
            <p className="text-slate-500 text-xs mb-4">View individual client portfolio below:</p>
          </div>
        </div>
      )}

      {/* Client Select */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">Select Client</label>
        <select value={selClient?.id ?? ''} onChange={e => {
          const c = clients.find(c => c.id === e.target.value);
          if (c) { setSelClient(c); loadPortfolio(c.id); }
        }} className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
          <option value="">Select a client...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} {c.pan_number ? `(${c.pan_number})` : ''}</option>)}
        </select>
      </div>

      {selClient && (
        <>
          {/* Portfolio Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Equity Value', value: totalStock, color: 'emerald', sub: `${stocks.length} holdings` },
              { label: 'MF Value', value: totalMF, color: 'blue', sub: `${mfs.length} funds` },
              { label: 'Total Portfolio', value: totalStock + totalMF, color: 'cyan', sub: 'Combined' },
            ].map(s => (
              <div key={s.label} className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5">
                <p className="text-slate-400 text-xs uppercase font-medium">{s.label}</p>
                <p className={`text-2xl font-bold text-${s.color}-400 mt-2`}>₹{s.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                <p className="text-slate-500 text-xs mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Search + Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stocks or funds..."
                className="w-full bg-[#111827] border border-slate-700/40 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
            </div>
            <button onClick={() => setShowAddStock(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-all">
              <Plus size={15} /> Add Stock
            </button>
            <button onClick={() => setShowAddMF(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-all">
              <Plus size={15} /> Add MF
            </button>
          </div>

          {/* Stocks */}
          <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40 bg-slate-800/40 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-white font-semibold text-sm">Equity Holdings (NSE/BSE)</h2>
              <span className="ml-auto text-xs text-slate-500">{filteredStocks.length} stocks</span>
            </div>
            {loading ? <div className="p-6 text-center text-slate-500 text-sm">Loading...</div> :
              filteredStocks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No stocks added yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/30 bg-slate-800/20">
                        {['Symbol', 'Qty', 'Buy ₹', 'CMP ₹', 'Value', 'P&L', 'Return%', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/20">
                      {filteredStocks.map(s => {
                        const val = s.quantity * s.current_price;
                        const cost = s.quantity * s.buy_price;
                        const pnl = val - cost;
                        const pct = cost ? ((pnl / cost) * 100).toFixed(2) : '0.00';
                        return (
                          <tr key={s.id} className="hover:bg-slate-700/20 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-white font-bold">{s.symbol}</p>
                              <p className="text-slate-600 text-xs">{new Date(s.purchase_date).toLocaleDateString('en-IN')}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-300">{s.quantity}</td>
                            <td className="px-4 py-3 text-slate-300">{s.buy_price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-white font-medium">{s.current_price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-white font-medium">₹{val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                            <td className={`px-4 py-3 font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`px-4 py-3 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              <span className="flex items-center gap-1">
                                {pnl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{pct}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={async () => { if (confirm('Delete this holding?')) { await supabase.from('stock_holdings').delete().eq('id', s.id); loadPortfolio(selClient.id); } }}
                                className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          {/* Mutual Funds */}
          <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40 bg-slate-800/40 flex items-center gap-2">
              <IndianRupee size={16} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Mutual Funds (AMFI)</h2>
              <span className="ml-auto text-xs text-slate-500">{filteredMFs.length} funds</span>
            </div>
            {filteredMFs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No mutual funds added yet</div>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {filteredMFs.map(mf => {
                  const cur = mf.units * mf.nav_value;
                  const pnl = cur - mf.amount;
                  const pct = mf.amount > 0 ? (pnl / mf.amount) * 100 : 0;
                  return (
                    <div key={mf.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{mf.fund_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{mf.investment_type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${mf.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>{mf.status}</span>
                          <span className="text-slate-500 text-xs">NAV: ₹{mf.nav_value.toFixed(2)}</span>
                          <span className="text-slate-500 text-xs">{mf.units} units</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-white font-bold text-sm">₹{cur.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        <p className="text-slate-500 text-xs">Invested: ₹{mf.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        <p className={`text-xs font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </p>
                      </div>
                      <button onClick={async () => { if (confirm('Delete this fund?')) { await supabase.from('mutual_funds').delete().eq('id', mf.id); loadPortfolio(selClient.id); } }}
                        className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {showAddStock && selClient && <AddStockModal client={selClient} onClose={() => setShowAddStock(false)} onSave={() => { loadPortfolio(selClient.id); setShowAddStock(false); }} />}
      {showAddMF && selClient && <AddMFModal client={selClient} onClose={() => setShowAddMF(false)} onSave={() => { loadPortfolio(selClient.id); setShowAddMF(false); }} />}
    </div>
  );
}

function SummaryCard({ label, value, sub, color, badge }: { label: string; value: string; sub: string; color: string; badge?: string }) {
  return (
    <div className={`bg-${color}-500/5 border border-${color}-500/20 rounded-xl p-4 relative`}>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`text-xl font-bold text-${color}-400 mt-1`}>{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
      {badge && (
        <span className={`absolute top-3 right-3 text-xs font-bold text-${color}-400 bg-${color}-500/10 border border-${color}-500/20 px-2 py-0.5 rounded-full`}>{badge}</span>
      )}
    </div>
  );
}

function AddStockModal({ client, onClose, onSave }: { client: Client; onClose: () => void; onSave: () => void }) {
  const [f, setF] = useState({ symbol: '', quantity: '', buy_price: '', current_price: '', purchase_date: new Date().toISOString().split('T')[0], broker_reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: string) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  function validate() {
    const e: Record<string, string> = {};
    if (!f.symbol.trim()) e.symbol = 'Symbol is required.';
    if (!f.quantity || parseFloat(f.quantity) <= 0) e.quantity = 'Enter a valid quantity.';
    if (!f.buy_price || parseFloat(f.buy_price) <= 0) e.buy_price = 'Enter a valid buy price.';
    return e;
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await supabase.from('stock_holdings').insert({
      client_id: client.id, symbol: f.symbol.toUpperCase(),
      quantity: parseFloat(f.quantity), buy_price: parseFloat(f.buy_price),
      current_price: parseFloat(f.current_price) || parseFloat(f.buy_price),
      purchase_date: f.purchase_date,
      broker_reference: f.broker_reference, notes: f.notes,
    });
    setSaving(false); onSave();
  }

  return (
    <Modal title="Add Stock Holding" onClose={onClose}>
      <div className="space-y-3">
        {[
          { label: 'Symbol *', key: 'symbol', type: 'text', ph: 'HDFCBANK' },
          { label: 'Quantity *', key: 'quantity', type: 'number', ph: '100' },
          { label: 'Buy Price ₹ *', key: 'buy_price', type: 'number', ph: '1640.00' },
          { label: 'Current Market Price ₹', key: 'current_price', type: 'number', ph: '1750.00' },
          { label: 'Purchase Date', key: 'purchase_date', type: 'date', ph: '' },
          { label: 'Broker Reference No.', key: 'broker_reference', type: 'text', ph: 'Optional' },
        ].map(field => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-slate-300 mb-1">{field.label}</label>
            <input type={field.type} value={f[field.key as keyof typeof f]} onChange={e => upd(field.key, e.target.value)} placeholder={field.ph}
              className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 ${errors[field.key] ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
            {errors[field.key] && <p className="text-red-400 text-xs mt-0.5">{errors[field.key]}</p>}
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Notes</label>
          <textarea value={f.notes} onChange={e => upd('notes', e.target.value)} rows={2}
            className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none" />
        </div>
      </div>
      <div className="flex gap-3 pt-4 border-t border-slate-700/40 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium">
          {saving ? 'Adding...' : 'Add Stock'}
        </button>
      </div>
    </Modal>
  );
}

function AddMFModal({ client, onClose, onSave }: { client: Client; onClose: () => void; onSave: () => void }) {
  const [f, setF] = useState({ fund_name: '', investment_type: 'Lump Sum', amount: '', frequency: 'Monthly', nav_value: '', units: '', status: 'active', aum: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: string) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  function validate() {
    const e: Record<string, string> = {};
    if (!f.fund_name.trim()) e.fund_name = 'Fund name is required.';
    if (!f.amount || parseFloat(f.amount) <= 0) e.amount = 'Enter a valid investment amount.';
    return e;
  }

  async function submit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await supabase.from('mutual_funds').insert({
      client_id: client.id, fund_name: f.fund_name, investment_type: f.investment_type,
      amount: parseFloat(f.amount), frequency: f.frequency,
      nav_value: parseFloat(f.nav_value) || 0, units: parseFloat(f.units) || 0,
      status: f.status, aum: f.aum,
    });
    setSaving(false); onSave();
  }

  return (
    <Modal title="Add Mutual Fund" onClose={onClose}>
      <div className="space-y-3">
        {[
          { label: 'Fund Name *', key: 'fund_name', type: 'text', ph: 'HDFC Mid Cap Opportunities' },
          { label: 'Investment Type', key: 'investment_type', type: 'select', opts: ['SIP', 'Lump Sum'] },
          { label: 'Amount Invested ₹ *', key: 'amount', type: 'number', ph: '50000' },
          { label: 'SIP Frequency', key: 'frequency', type: 'select', opts: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'One-Time'] },
          { label: 'NAV Value ₹', key: 'nav_value', type: 'number', ph: '52.40' },
          { label: 'Units', key: 'units', type: 'number', ph: '954.198' },
          { label: 'Status', key: 'status', type: 'select', opts: ['active', 'inactive', 'matured', 'closed'] },
          { label: 'Fund House / AUM', key: 'aum', type: 'text', ph: 'HDFC AMC - 25000 Cr' },
        ].map(field => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-slate-300 mb-1">{field.label}</label>
            {field.type === 'select' ? (
              <select value={f[field.key as keyof typeof f]} onChange={e => upd(field.key, e.target.value)}
                className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50">
                {field.opts?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={field.type} value={f[field.key as keyof typeof f]} onChange={e => upd(field.key, e.target.value)} placeholder={field.ph}
                className={`w-full bg-slate-700/40 border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 ${errors[field.key] ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
            )}
            {errors[field.key] && <p className="text-red-400 text-xs mt-0.5">{errors[field.key]}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-4 border-t border-slate-700/40 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium">
          {saving ? 'Adding...' : 'Add Fund'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 sticky top-0 bg-[#111827]">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
