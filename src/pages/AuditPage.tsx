import { useEffect, useState } from 'react';
import { Shield, Search, Activity, Clock, User, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user_name?: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  read: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  update: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  delete: 'bg-red-500/10 text-red-400 border-red-500/20',
  download: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  login: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  logout: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function AuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: logData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    const logs = logData ?? [];

    // Get user names
    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));
      setLogs(logs.map(l => ({ ...l, user_name: nameMap.get(l.user_id) ?? 'Unknown' })));
    } else {
      setLogs(logs.map(l => ({ ...l, user_name: 'System' })));
    }
    setLoading(false);
  }

  const filtered = logs.filter(l =>
    (l.user_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.entity_type.toLowerCase().includes(search.toLowerCase())
  );

  const actionCounts = logs.reduce((acc, l) => {
    acc[l.action] = (acc[l.action] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield size={22} className="text-blue-400" />
          Audit Logs
        </h1>
        <p className="text-slate-400 text-sm mt-1">Complete activity trail for compliance and security monitoring</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: logs.length, icon: <Activity size={18} /> },
          { label: 'Creates', value: actionCounts.create ?? 0, icon: <Activity size={18} /> },
          { label: 'Updates', value: actionCounts.update ?? 0, icon: <Activity size={18} /> },
          { label: 'Downloads', value: actionCounts.download ?? 0, icon: <Eye size={18} /> },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4">
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user, action, or entity..."
          className="w-full bg-[#111827] border border-slate-700/40 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-[#111827] border border-slate-700/40 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#111827] border border-slate-700/40 rounded-2xl">
          <Shield size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{search ? 'No matching logs.' : 'No audit logs yet. Activity will be recorded as users interact with the system.'}</p>
        </div>
      ) : (
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden divide-y divide-slate-700/30">
          {filtered.map(log => (
            <div key={log.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-700/20 transition-colors">
              <div className="w-8 h-8 rounded-full bg-slate-700/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={13} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-medium">{log.user_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${ACTION_COLORS[log.action] ?? ACTION_COLORS.read}`}>{log.action}</span>
                  <span className="text-slate-400 text-xs capitalize">{log.entity_type}</span>
                </div>
                {log.entity_id && <p className="text-slate-600 text-xs mt-0.5 font-mono truncate">{log.entity_id}</p>}
              </div>
              <div className="flex items-center gap-1 text-slate-600 text-xs flex-shrink-0">
                <Clock size={11} />
                <span>{new Date(log.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
