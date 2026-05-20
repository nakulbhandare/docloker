import { useEffect, useState } from 'react';
import { ClipboardList, Search, ChevronRight, CheckCircle, Clock, XCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { InvestmentForm, FormSubmission } from '../lib/types';

interface SubRow extends FormSubmission { clientName: string; formName: string; }

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_ICON: Record<string, JSX.Element> = {
  approved: <CheckCircle size={12} />,
  submitted: <Clock size={12} />,
  rejected: <XCircle size={12} />,
};

const FORM_TYPES = ['KYC', 'PAN', 'Bank', 'Trading', 'DP', 'Nominee', 'TDS', 'Risk', 'Other'];
const TYPE_COLORS: Record<string, string> = {
  KYC: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  PAN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Bank: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Trading: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DP: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Nominee: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  TDS: 'bg-red-500/10 text-red-400 border-red-500/20',
  Risk: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function FormsPage() {
  const { user, profile } = useAuth();
  const [forms, setForms] = useState<InvestmentForm[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<SubRow | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);

    const { data: formData } = await supabase.from('investment_forms').select('*').eq('is_active', true).order('form_type');
    setForms((formData ?? []) as InvestmentForm[]);
    const formMap = new Map((formData ?? []).map(f => [f.id, f.name]));

    let clientIds: string[] = [];
    let clientMap = new Map<string, string>();

    if (profile?.role === 'broker') {
      const { data } = await supabase.from('clients').select('id, full_name').eq('broker_id', user.id);
      clientMap = new Map((data ?? []).map(c => [c.id, c.full_name]));
      clientIds = [...clientMap.keys()];
    } else {
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', user.id);
      clientIds = (ec ?? []).map(r => r.client_id);
      if (clientIds.length) {
        const { data } = await supabase.from('clients').select('id, full_name').in('id', clientIds);
        clientMap = new Map((data ?? []).map(c => [c.id, c.full_name]));
      }
    }

    if (!clientIds.length) { setSubs([]); setLoading(false); return; }

    const { data: subData } = await supabase
      .from('form_submissions')
      .select('*')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false });

    setSubs((subData ?? []).map(s => ({
      ...s,
      clientName: clientMap.get(s.client_id) ?? 'Unknown',
      formName: formMap.get(s.form_id) ?? 'Unknown Form',
    })));
    setLoading(false);
  }

  const filtered = subs.filter(s => {
    const ms = s.clientName.toLowerCase().includes(search.toLowerCase()) || s.formName.toLowerCase().includes(search.toLowerCase());
    const mst = statusFilter === 'all' || s.status === statusFilter;
    return ms && mst;
  });

  const stats = {
    total: subs.length,
    draft: subs.filter(s => s.status === 'draft').length,
    approved: subs.filter(s => s.status === 'approved').length,
    submitted: subs.filter(s => s.status === 'submitted').length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Forms & KYC Management</h1>
        <p className="text-slate-400 text-sm mt-1">SEBI-required forms for Indian stock market operations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Forms', value: stats.total, color: 'blue' },
          { label: 'Drafts', value: stats.draft, color: 'slate' },
          { label: 'Pending Review', value: stats.submitted, color: 'amber' },
          { label: 'Approved', value: stats.approved, color: 'emerald' },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] border border-slate-700/40 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Available Form Types */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/40">
          <h2 className="text-white font-semibold text-sm">Available Forms (SEBI / AMFI Compliant)</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {forms.map(f => (
            <div key={f.id} className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 hover:border-slate-600 transition-all">
              <div className="flex items-start gap-2">
                <FileText size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium leading-tight">{f.name}</p>
                  <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded border ${TYPE_COLORS[f.form_type] ?? TYPE_COLORS.Other}`}>{f.form_type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by client or form name..."
            className="w-full bg-[#111827] border border-slate-700/40 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#111827] border border-slate-700/40 rounded-xl px-4 py-3 text-slate-300 text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-[#111827] border border-slate-700/40 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-[#111827] border border-slate-700/40 rounded-2xl">
          <ClipboardList size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No form submissions found</p>
          <p className="text-slate-600 text-xs mt-1">Create forms from the client detail page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sub => (
            <button key={sub.id} onClick={() => setSelected(selected?.id === sub.id ? null : sub)}
              className="w-full bg-[#111827] border border-slate-700/40 rounded-xl p-4 hover:border-slate-600 transition-all text-left group">
              <div className="flex items-center gap-3">
                <ClipboardList size={15} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium">{sub.formName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 capitalize ${STATUS_BADGE[sub.status]}`}>
                      {STATUS_ICON[sub.status]}
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">Client: <span className="text-slate-300">{sub.clientName}</span> &bull; {new Date(sub.updated_at).toLocaleDateString('en-IN')}</p>
                </div>
                <ChevronRight size={14} className={`text-slate-600 flex-shrink-0 transition-transform ${selected?.id === sub.id ? 'rotate-90' : ''}`} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
