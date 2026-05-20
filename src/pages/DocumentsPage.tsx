import { useEffect, useState } from 'react';
import { FolderOpen, Search, Download, Trash2, FileText, Filter, Hash, Phone, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Document, Client } from '../lib/types';

interface DocWithClient extends Document { clientName: string; clientPhone: string; clientEmail: string; clientId: string; }

const CATS = ['general', 'identity', 'financial', 'legal', 'kyc', 'tax'];
const CAT_COLORS: Record<string, string> = {
  general: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  identity: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  financial: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  legal: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  kyc: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  tax: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function fmtBytes(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

type SearchField = 'all' | 'name' | 'id' | 'phone' | 'email';

export default function DocumentsPage() {
  const { user, effectiveProfile } = useAuth();
  const effectiveUserId = effectiveProfile?.id ?? user?.id;
  const role = effectiveProfile?.role ?? 'broker';

  const [docs, setDocs] = useState<DocWithClient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [catFilter, setCatFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  useEffect(() => { if (user && effectiveUserId) load(); }, [user, effectiveProfile]);

  async function load() {
    if (!user || !effectiveUserId) return;
    setLoading(true);

    let clientMap = new Map<string, Client>();

    if (role === 'broker') {
      const { data } = await supabase.from('clients').select('*').eq('broker_id', user.id);
      (data ?? []).forEach(c => clientMap.set(c.id, c));
    } else {
      const { data: ec } = await supabase.from('employee_clients').select('client_id').eq('employee_id', effectiveUserId);
      const ids = (ec ?? []).map(r => r.client_id);
      if (ids.length) {
        const { data } = await supabase.from('clients').select('*').in('id', ids);
        (data ?? []).forEach(c => clientMap.set(c.id, c));
      }
    }

    const clientIds = [...clientMap.keys()];
    setClients([...clientMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)));

    if (!clientIds.length) { setDocs([]); setLoading(false); return; }

    const { data: docData } = await supabase.from('documents').select('*').in('client_id', clientIds).order('created_at', { ascending: false });
    setDocs((docData ?? []).map(d => {
      const c = clientMap.get(d.client_id);
      return {
        ...d,
        clientName: c?.full_name ?? 'Unknown',
        clientPhone: c?.phone ?? '',
        clientEmail: c?.email ?? '',
        clientId: d.client_id,
      };
    }));
    setLoading(false);
  }

  async function download(doc: Document) {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = doc.name; a.click(); }
  }

  async function del(doc: Document) {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await supabase.storage.from('client-documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    load();
  }

  function matches(doc: DocWithClient): boolean {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    switch (searchField) {
      case 'name': return doc.clientName.toLowerCase().includes(q) || doc.name.toLowerCase().includes(q);
      case 'id': return doc.clientId.toLowerCase().includes(q);
      case 'phone': return doc.clientPhone.toLowerCase().includes(q);
      case 'email': return doc.clientEmail.toLowerCase().includes(q);
      default:
        return (
          doc.name.toLowerCase().includes(q) ||
          doc.clientName.toLowerCase().includes(q) ||
          doc.clientId.toLowerCase().includes(q) ||
          doc.clientPhone.toLowerCase().includes(q) ||
          doc.clientEmail.toLowerCase().includes(q)
        );
    }
  }

  const filtered = docs.filter(d => {
    if (!matches(d)) return false;
    if (catFilter !== 'all' && d.category !== catFilter) return false;
    if (clientFilter !== 'all' && d.clientId !== clientFilter) return false;
    return true;
  });

  // Group by client for folder view
  const byClient = new Map<string, DocWithClient[]>();
  filtered.forEach(d => {
    const arr = byClient.get(d.clientId) ?? [];
    arr.push(d);
    byClient.set(d.clientId, arr);
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">All Documents</h1>
        <p className="text-slate-400 text-sm mt-1">{docs.length} document{docs.length !== 1 ? 's' : ''} across {clients.length} clients</p>
      </div>

      {/* Search bar with field selector */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Field type selector */}
          <div className="flex gap-1 flex-wrap">
            {([
              { key: 'all', label: 'All', icon: Search },
              { key: 'name', label: 'Name', icon: User },
              { key: 'id', label: 'Client ID', icon: Hash },
              { key: 'phone', label: 'Phone', icon: Phone },
              { key: 'email', label: 'Email', icon: Mail },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setSearchField(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchField === f.key ? 'bg-blue-600 text-white' : 'bg-slate-700/40 text-slate-400 hover:text-white'}`}>
                <f.icon size={11} />{f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search by ${searchField === 'all' ? 'name, client ID, phone or email' : searchField}...`}
              className="w-full bg-slate-700/40 border border-slate-600/40 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm" />
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-slate-500" />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="bg-slate-700/40 border border-slate-600/40 rounded-xl px-3 py-2.5 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40">
                <option value="all">All Categories</option>
                {CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="bg-slate-700/40 border border-slate-600/40 rounded-xl px-3 py-2.5 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40">
              <option value="all">All Clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-[#111827] border border-slate-700/40 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#111827] border border-slate-700/40 rounded-2xl">
          <FolderOpen size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No documents found</p>
          {search && <p className="text-slate-600 text-xs mt-1">Try adjusting your search or filters</p>}
        </div>
      ) : (
        /* Per-client folder view */
        <div className="space-y-4">
          {[...byClient.entries()].map(([clientId, clientDocs]) => {
            const c = clients.find(cl => cl.id === clientId);
            return (
              <div key={clientId} className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
                {/* Folder header */}
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/50 border-b border-slate-700/30">
                  <FolderOpen size={16} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{c?.full_name ?? 'Unknown Client'}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c?.email && <span className="flex items-center gap-1 text-slate-500 text-xs"><Mail size={10} />{c.email}</span>}
                      {c?.phone && <span className="flex items-center gap-1 text-slate-500 text-xs"><Phone size={10} />{c.phone}</span>}
                      <span className="flex items-center gap-1 text-slate-600 text-xs"><Hash size={10} />{clientId.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 bg-slate-700/40 px-2.5 py-1 rounded-full flex-shrink-0">{clientDocs.length} file{clientDocs.length !== 1 ? 's' : ''}</span>
                </div>
                {/* Documents */}
                <div className="divide-y divide-slate-700/20">
                  {clientDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-700/20 transition-colors group">
                      <FileText size={15} className="text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${CAT_COLORS[doc.category] ?? CAT_COLORS.general}`}>{doc.category}</span>
                          {doc.description && <span className="text-slate-600 text-xs truncate max-w-[200px]">{doc.description}</span>}
                          <span className="text-slate-600 text-xs hidden sm:inline">{fmtBytes(doc.file_size)}</span>
                          <span className="text-slate-600 text-xs hidden sm:inline">{new Date(doc.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => download(doc)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all" title="Download">
                          <Download size={14} />
                        </button>
                        {role === 'broker' && (
                          <button onClick={() => del(doc)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Folder path info */}
                <div className="px-5 py-2 bg-slate-800/20 border-t border-slate-700/20">
                  <p className="text-slate-600 text-xs font-mono">clients/{clientId}/</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
