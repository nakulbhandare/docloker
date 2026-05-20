import { useEffect, useState, useRef } from 'react';
import {
  CheckSquare, Square, AlertCircle, Clock, ChevronDown, ChevronRight,
  Plus, X, Send, MessageSquare, User, Users, Calendar, Trash2,
  Flag, CheckCheck, Filter, Loader2, RefreshCw, Zap, Bell,
  CheckCircle2, Circle, PlusCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Client, Profile, ClientChecklist, BrokerAction, ActionFollowup, ActionPriority, ActionStatus } from '../lib/types';
import { seedDefaultBrokerActions } from '../lib/checklist';

// ─── constants ───────────────────────────────────────────────────────────────

const PRIORITY_META: Record<ActionPriority, { label: string; color: string; bg: string; border: string; ring: string }> = {
  urgent: { label: 'Urgent',  color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/40',    ring: 'focus:ring-red-500/30' },
  high:   { label: 'High',    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', ring: 'focus:ring-orange-500/30' },
  normal: { label: 'Normal',  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   ring: 'focus:ring-blue-500/30' },
  low:    { label: 'Low',     color: 'text-slate-400',  bg: 'bg-slate-700/40',  border: 'border-slate-600/40',  ring: 'focus:ring-slate-500/30' },
};

const STATUS_META: Record<ActionStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'text-amber-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-400' },
  done:        { label: 'Done',        color: 'text-emerald-400' },
  dismissed:   { label: 'Dismissed',   color: 'text-slate-500' },
};

const CAT_COLOR: Record<string, string> = {
  profile:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  kyc:        'text-amber-400 bg-amber-500/10 border-amber-500/20',
  documents:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  investment: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function PriorityBadge({ p }: { p: ActionPriority }) {
  const m = PRIORITY_META[p];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.color} ${m.bg} ${m.border}`}>
      {p === 'urgent' ? <Zap size={9} /> : <Flag size={9} />}
      {m.label}
    </span>
  );
}

function StatusBadge({ s }: { s: ActionStatus }) {
  const m = STATUS_META[s];
  return <span className={`text-xs font-medium ${m.color}`}>{m.label}</span>;
}

// ─── Followup thread ─────────────────────────────────────────────────────────

function FollowupThread({ action, currentUserId }: { action: BrokerAction; currentUserId: string }) {
  const [followups, setFollowups] = useState<ActionFollowup[]>([]);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [action.id]);

  async function load() {
    const { data } = await supabase.from('action_followups').select('*').eq('action_id', action.id).order('created_at');
    const fu = data ?? [];
    setFollowups(fu);
    const ids = [...new Set(fu.map(f => f.author_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(new Map((profs ?? []).map(p => [p.id, p.full_name])));
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  async function send() {
    if (!msg.trim() || sending) return;
    setSending(true);
    await supabase.from('action_followups').insert({ action_id: action.id, author_id: currentUserId, message: msg.trim() });
    setMsg('');
    setSending(false);
    load();
  }

  return (
    <div className="border-t border-slate-700/40 mt-3 pt-3">
      <p className="text-slate-500 text-xs font-medium mb-2 flex items-center gap-1.5">
        <MessageSquare size={11} /> Follow-up thread ({followups.length})
      </p>
      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
        {followups.length === 0 && <p className="text-slate-600 text-xs italic">No messages yet. Start a follow-up below.</p>}
        {followups.map(fu => {
          const isMe = fu.author_id === currentUserId;
          return (
            <div key={fu.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isMe ? 'bg-blue-600/30 text-blue-400' : 'bg-slate-700 text-slate-300'}`}>
                {(names.get(fu.author_id) ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isMe ? 'bg-blue-600/15 border border-blue-500/20' : 'bg-slate-800/60 border border-slate-700/40'}`}>
                <p className="text-xs text-slate-500 mb-0.5">{names.get(fu.author_id) ?? 'Unknown'} &bull; {new Date(fu.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                <p className="text-white text-sm leading-relaxed">{fu.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-2">
        <input value={msg} onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a follow-up…"
          className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        <button onClick={send} disabled={!msg.trim() || sending}
          className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all flex-shrink-0">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Action Card ─────────────────────────────────────────────────────────────

function ActionCard({ action, currentUserId, isBroker, clients, employees, onRefresh, onDelete }: {
  action: BrokerAction; currentUserId: string; isBroker: boolean;
  clients: Client[]; employees: Profile[];
  onRefresh: () => void; onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const client = clients.find(c => c.id === action.client_id);
  const assignee = employees.find(e => e.id === action.assigned_to);
  const pm = PRIORITY_META[action.priority];
  const isUrgent = action.priority === 'urgent';

  async function updateStatus(status: ActionStatus) {
    await supabase.from('broker_actions').update({ status, updated_at: new Date().toISOString() }).eq('id', action.id);
    onRefresh();
  }

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${
      isUrgent && action.status !== 'done' ? 'bg-red-950/20 border-red-500/40 shadow-lg shadow-red-900/20' :
      action.status === 'done' ? 'bg-[#111827] border-slate-700/30 opacity-55' :
      `bg-[#111827] ${pm.border}`
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <PriorityBadge p={action.priority} />
              {action.status !== 'open' && <StatusBadge s={action.status} />}
              {isUrgent && action.status !== 'done' && (
                <span className="flex items-center gap-1 text-xs text-red-300 font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Immediate attention needed
                </span>
              )}
            </div>
            <p className={`font-semibold text-sm leading-snug ${isUrgent && action.status !== 'done' ? 'text-red-100' : 'text-white'}`}>
              {action.title}
            </p>
            {action.description && (
              <p className="text-slate-400 text-xs mt-1 leading-relaxed line-clamp-2">{action.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {client && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <User size={10} /> {client.full_name}
                </span>
              )}
              {isBroker && assignee && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users size={10} /> {assignee.full_name}
                </span>
              )}
              {isBroker && !action.assigned_to && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users size={10} /> All employees
                </span>
              )}
              {action.due_date && (
                <span className={`flex items-center gap-1 text-xs ${new Date(action.due_date) < new Date() && action.status !== 'done' ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
                  <Calendar size={10} /> Due {new Date(action.due_date).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isBroker && action.status !== 'done' && (
              <>
                {action.status === 'open' && (
                  <button onClick={() => updateStatus('in_progress')}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-all">
                    <Clock size={11} /> Start
                  </button>
                )}
                <button onClick={() => updateStatus('done')}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-all">
                  <CheckCheck size={11} /> Done
                </button>
              </>
            )}
            {isBroker && onDelete && (
              <button onClick={() => onDelete(action.id)}
                className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all">
                <Trash2 size={13} />
              </button>
            )}
            <button onClick={() => setExpanded(e => !e)}
              className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700/40 transition-all">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {action.description && (
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{action.description}</p>
            </div>
          )}
          {isBroker && (
            <div className="flex gap-2 flex-wrap">
              {(['open','in_progress','done','dismissed'] as ActionStatus[]).map(s => (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${action.status === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-white'}`}>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
          <FollowupThread action={action} currentUserId={currentUserId} />
        </div>
      )}
    </div>
  );
}

// ─── Custom Task Row ──────────────────────────────────────────────────────────

function CustomTaskInput({ clientId, employeeId, brokerId, onAdded }: {
  clientId: string; employeeId: string; brokerId: string; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<string>('profile');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    const { data: maxSort } = await supabase
      .from('client_checklists')
      .select('sort_order')
      .eq('client_id', clientId)
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from('client_checklists').insert({
      client_id: clientId,
      employee_id: employeeId,
      broker_id: brokerId,
      item_key: `custom_${Date.now()}`,
      label: label.trim(),
      category,
      sort_order: (maxSort?.sort_order ?? 100) + 1,
      mandatory: false,
      is_custom: true,
    });
    setLabel('');
    setSaving(false);
    setOpen(false);
    onAdded();
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center gap-2 text-slate-500 hover:text-slate-300 text-xs py-2 px-3 rounded-lg hover:bg-slate-700/20 transition-all border border-dashed border-slate-700/40 hover:border-slate-600">
      <PlusCircle size={13} /> Add custom task
    </button>
  );

  return (
    <div className="flex gap-2 mt-1">
      <select value={category} onChange={e => setCategory(e.target.value)}
        className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-2 py-1.5 text-slate-300 text-xs focus:outline-none w-28 flex-shrink-0">
        <option value="profile">Profile</option>
        <option value="kyc">KYC</option>
        <option value="documents">Documents</option>
        <option value="investment">Investment</option>
      </select>
      <input value={label} onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
        autoFocus placeholder="Task description…"
        className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
      <button onClick={save} disabled={!label.trim() || saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 px-1.5">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Checklist Section ────────────────────────────────────────────────────────

function ChecklistSection({ clientId, employeeId, brokerId, clientName, isBroker }: {
  clientId: string; employeeId: string; brokerId: string; clientName: string; isBroker: boolean;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<ClientChecklist[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (expanded) loadItems(); }, [expanded, clientId]);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase
      .from('client_checklists')
      .select('*')
      .eq('client_id', clientId)
      .eq('employee_id', employeeId)
      .order('sort_order');
    setItems(data ?? []);
    setLoading(false);
  }

  async function toggle(item: ClientChecklist) {
    if (isBroker) return;
    const now = new Date().toISOString();
    await supabase.from('client_checklists').update({
      is_completed: !item.is_completed,
      completed_at: !item.is_completed ? now : null,
      completed_by: !item.is_completed ? user!.id : null,
    }).eq('id', item.id);
    loadItems();
  }

  async function deleteCustom(id: string) {
    await supabase.from('client_checklists').delete().eq('id', id);
    loadItems();
  }

  const total = items.length;
  const done = items.filter(i => i.is_completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const pending = total - done;

  const byCategory = items.reduce<Record<string, ClientChecklist[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${allDone ? 'border-emerald-500/30' : pending > 0 ? 'border-slate-700/40' : 'border-slate-700/40'}`}
      style={{ background: '#111827' }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-700/10 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <p className="text-white font-semibold text-sm truncate">{clientName}</p>
            {allDone ? (
              <span className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle2 size={11} /> Ready for investment
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> {pending} pending
              </span>
            )}
          </div>
          <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-slate-500 text-xs mt-1">{done}/{total} tasks • {pct}% complete</p>
        </div>
        {expanded ? <ChevronDown size={15} className="text-slate-500 flex-shrink-0" /> : <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-700/40">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="divide-y divide-slate-700/20">
              {Object.entries(byCategory).map(([cat, catItems]) => (
                <div key={cat} className="p-4">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border mb-3 ${CAT_COLOR[cat] ?? 'text-slate-400 bg-slate-700/40 border-slate-600/40'}`}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    {catItems.some(i => !i.is_completed) && <span className="w-1.5 h-1.5 rounded-full bg-red-400 ml-1" />}
                  </span>
                  <div className="space-y-1">
                    {catItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2 group/item">
                        <button onClick={() => toggle(item)} disabled={isBroker}
                          className={`flex items-center gap-2.5 flex-1 text-left rounded-lg px-2.5 py-2 transition-all ${isBroker ? 'cursor-default' : 'hover:bg-slate-700/20'}`}>
                          {item.is_completed
                            ? <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
                            : <Circle size={15} className="text-slate-600 flex-shrink-0 group-hover/item:text-slate-400" />
                          }
                          <span className={`text-sm flex-1 leading-snug ${item.is_completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                            {item.label}
                          </span>
                          {!item.mandatory && (
                            <span className="text-slate-600 text-xs flex-shrink-0">custom</span>
                          )}
                          {item.is_completed && item.completed_at && (
                            <span className="text-slate-600 text-xs flex-shrink-0">{new Date(item.completed_at).toLocaleDateString('en-IN')}</span>
                          )}
                        </button>
                        {item.is_custom && !isBroker && (
                          <button onClick={() => deleteCustom(item.id)}
                            className="text-slate-700 hover:text-red-400 p-1 opacity-0 group-hover/item:opacity-100 transition-all">
                            <X size={12} />
                          </button>
                        )}
                        {isBroker && item.is_custom && (
                          <button onClick={() => deleteCustom(item.id)}
                            className="text-slate-700 hover:text-red-400 p-1 opacity-0 group-hover/item:opacity-100 transition-all">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* Add custom task */}
              {!isBroker && (
                <div className="p-4">
                  <CustomTaskInput
                    clientId={clientId}
                    employeeId={employeeId}
                    brokerId={brokerId}
                    onAdded={loadItems}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Action Modal ──────────────────────────────────────────────────────

function CreateActionModal({ employees, clients, brokerId, onClose, onCreated }: {
  employees: Profile[]; clients: Client[]; brokerId: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ActionPriority>('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!title.trim()) { setErr('Title is required.'); return; }
    setSaving(true);
    const { error } = await supabase.from('broker_actions').insert({
      broker_id: brokerId,
      title: title.trim(),
      description: description.trim(),
      priority,
      assigned_to: assignedTo || null,
      client_id: clientId || null,
      due_date: dueDate || null,
      status: 'open',
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onCreated();
    onClose();
  }

  const pm = PRIORITY_META[priority];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <Flag size={14} className="text-blue-400" /> New Action / Task
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Title *</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setErr(''); }}
              placeholder="e.g. Complete KYC for Ramesh Sharma"
              className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes / Instructions</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Key details, instructions, or context for the employee…" rows={3}
              className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as ActionPriority)}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${pm.bg} ${pm.border} ${pm.color} ${pm.ring}`}>
                <option value="urgent">Urgent — Immediate</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Assign To <span className="text-slate-500 font-normal">(blank = all employees)</span>
            </label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Linked Client <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option value="">— No specific client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          {priority === 'urgent' && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <Zap size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-xs">This will be shown as an <strong>immediate action required</strong> on the employee's task list with a prominent alert.</p>
            </div>
          )}
          {err && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400" />
              <p className="text-red-400 text-sm">{err}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700/40">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:text-white transition-all">Cancel</button>
          <button onClick={save} disabled={saving}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 ${priority === 'urgent' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {saving ? 'Creating…' : priority === 'urgent' ? 'Send Urgent Action' : 'Create Action'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user, profile, effectiveProfile } = useAuth();
  const activeProfile = effectiveProfile ?? profile;
  const isBroker = profile?.role === 'broker' && !effectiveProfile;

  const [actions, setActions] = useState<BrokerAction[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [checklistEntries, setChecklistEntries] = useState<{ clientId: string; clientName: string; employeeId: string; brokerId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ActionPriority | 'all'>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');

  useEffect(() => { if (user) load(); }, [user, effectiveProfile]);

  async function load() {
    setLoading(true);
    if (isBroker) await loadBroker();
    else await loadEmployee();
    setLoading(false);
  }

  async function loadBroker() {
    const [empR, clientR, actR] = await Promise.all([
      supabase.from('profiles').select('*').eq('broker_id', user!.id).eq('role', 'employee').order('full_name'),
      supabase.from('clients').select('*').eq('broker_id', user!.id).order('full_name'),
      supabase.from('broker_actions').select('*').eq('broker_id', user!.id).order('created_at', { ascending: false }),
    ]);
    const emps: Profile[] = empR.data ?? [];
    const cls: Client[] = clientR.data ?? [];
    setEmployees(emps);
    setClients(cls);
    setActions(actR.data ?? []);

    if (emps.length && cls.length) {
      const { data: ecAll } = await supabase
        .from('employee_clients')
        .select('employee_id, client_id')
        .in('employee_id', emps.map(e => e.id));
      const entries = (ecAll ?? []).map(ec => {
        const c = cls.find(c => c.id === ec.client_id);
        return c ? { clientId: c.id, clientName: c.full_name, employeeId: ec.employee_id, brokerId: user!.id } : null;
      }).filter(Boolean) as typeof checklistEntries;
      setChecklistEntries(entries);
    }
  }

  async function loadEmployee() {
    const empId = activeProfile!.id;
    const brokerId = profile!.broker_id!;
    const [ecR, actR] = await Promise.all([
      supabase.from('employee_clients').select('client_id').eq('employee_id', empId),
      supabase.from('broker_actions').select('*')
        .or(`assigned_to.eq.${empId},and(assigned_to.is.null,broker_id.eq.${brokerId})`)
        .order('created_at', { ascending: false }),
    ]);
    const clientIds = (ecR.data ?? []).map(r => r.client_id);
    setActions(actR.data ?? []);
    if (clientIds.length) {
      const { data: cls } = await supabase.from('clients').select('*').in('id', clientIds).order('full_name');
      setClients(cls ?? []);
      setChecklistEntries((cls ?? []).map(c => ({ clientId: c.id, clientName: c.full_name, employeeId: empId, brokerId })));
    }
  }

  async function deleteAction(id: string) {
    if (!confirm('Delete this action?')) return;
    await supabase.from('broker_actions').delete().eq('id', id);
    load();
  }

  const urgentOpenActions = actions.filter(a => a.priority === 'urgent' && a.status !== 'done' && a.status !== 'dismissed');
  const highActions = actions.filter(a => a.priority === 'high' && a.status !== 'done' && a.status !== 'dismissed');

  const filteredActions = actions.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
    if (isBroker && selectedEmployee !== 'all') {
      if (selectedEmployee === '__all__') return a.assigned_to === null;
      if (a.assigned_to !== selectedEmployee) return false;
    }
    return true;
  });

  // Sort: urgent first, then high, then by date
  const sortedActions = [...filteredActions].sort((a, b) => {
    const pOrder: Record<ActionPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const doneDiff = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
    if (doneDiff) return doneDiff;
    const pDiff = pOrder[a.priority] - pOrder[b.priority];
    if (pDiff) return pDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const openCount = actions.filter(a => a.status === 'open').length;
  const doneCount = actions.filter(a => a.status === 'done').length;
  const pendingChecklistCount = checklistEntries.length;

  const checklistByEmployee = employees.reduce<Record<string, typeof checklistEntries>>((acc, emp) => {
    acc[emp.id] = checklistEntries.filter(e => e.employeeId === emp.id);
    return acc;
  }, {});

  if (loading) return (
    <div className="p-6 space-y-6">
      <div className="h-7 w-48 bg-slate-700/40 rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-24 bg-[#111827] border border-slate-700/40 rounded-2xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <div className="relative">
              <CheckSquare size={22} className="text-blue-400" />
              {(urgentOpenActions.length > 0 || (openCount > 0 && !isBroker)) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#0a0f1e]" />
              )}
            </div>
            {isBroker ? 'Tasks & Tracking' : 'My Tasks'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {isBroker ? 'Monitor employee progress and send action items' : 'Your to-do list, client checklists, and broker-assigned actions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2.5 text-slate-400 hover:text-white bg-[#111827] border border-slate-700/40 rounded-xl hover:border-slate-600 transition-all">
            <RefreshCw size={15} />
          </button>
          {isBroker && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20">
              <Plus size={16} /> New Action
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-amber-500/20 rounded-2xl p-4">
          <p className="text-3xl font-bold text-amber-400">{openCount}</p>
          <p className="text-slate-400 text-xs mt-1">Open Actions</p>
        </div>
        <div className={`bg-[#111827] border rounded-2xl p-4 ${urgentOpenActions.length > 0 ? 'border-red-500/40 shadow-lg shadow-red-900/20' : 'border-red-500/20'}`}>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold text-red-400">{urgentOpenActions.length}</p>
            {urgentOpenActions.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
          </div>
          <p className="text-slate-400 text-xs mt-1">Urgent Actions</p>
        </div>
        <div className="bg-[#111827] border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-3xl font-bold text-emerald-400">{doneCount}</p>
          <p className="text-slate-400 text-xs mt-1">Completed</p>
        </div>
        <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-4">
          <p className="text-3xl font-bold text-blue-400">{pendingChecklistCount}</p>
          <p className="text-slate-400 text-xs mt-1">Clients Tracked</p>
        </div>
      </div>

      {/* Urgent alert banner (employee) */}
      {!isBroker && urgentOpenActions.length > 0 && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-2xl px-5 py-4 flex items-start gap-4 shadow-lg shadow-red-900/20">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap size={18} className="text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-red-200 font-bold text-sm">{urgentOpenActions.length} Urgent Action{urgentOpenActions.length !== 1 ? 's' : ''} — Immediate Attention Required</p>
            <p className="text-red-400/70 text-xs mt-1">Your broker has flagged these as urgent. Complete them as soon as possible.</p>
            <div className="mt-2 space-y-1">
              {urgentOpenActions.slice(0, 3).map(a => (
                <p key={a.id} className="text-red-300 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" /> {a.title}
                </p>
              ))}
              {urgentOpenActions.length > 3 && <p className="text-red-400/60 text-xs">+{urgentOpenActions.length - 3} more urgent actions below</p>}
            </div>
          </div>
        </div>
      )}

      {/* High priority callout (employee) */}
      {!isBroker && urgentOpenActions.length === 0 && highActions.length > 0 && (
        <div className="bg-orange-950/20 border border-orange-500/30 rounded-2xl px-5 py-3 flex items-center gap-3">
          <Bell size={16} className="text-orange-400 flex-shrink-0" />
          <p className="text-orange-300 text-sm">{highActions.length} high-priority action{highActions.length !== 1 ? 's' : ''} awaiting your attention.</p>
        </div>
      )}

      {/* Actions section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Flag size={15} className="text-orange-400" />
            {isBroker ? 'Actions Sent to Employees' : 'Assigned Actions'}
            {openCount > 0 && <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-bold">{openCount} open</span>}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={12} className="text-slate-500" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ActionStatus | 'all')}
              className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-2 py-1.5 text-slate-300 text-xs focus:outline-none">
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as ActionPriority | 'all')}
              className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-2 py-1.5 text-slate-300 text-xs focus:outline-none">
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            {isBroker && (
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-2 py-1.5 text-slate-300 text-xs focus:outline-none">
                <option value="all">All Employees</option>
                <option value="__all__">Sent to Everyone</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            )}
          </div>
        </div>

        {sortedActions.length === 0 ? (
          <div className="bg-[#111827] border border-slate-700/40 rounded-2xl py-12 text-center">
            <CheckCheck size={28} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No actions found.</p>
            {isBroker && <p className="text-slate-600 text-xs mt-1">Click "New Action" to send tasks to employees.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedActions.map(a => (
              <ActionCard key={a.id} action={a} currentUserId={user!.id} isBroker={isBroker}
                clients={clients} employees={employees} onRefresh={load}
                onDelete={isBroker ? deleteAction : undefined} />
            ))}
          </div>
        )}
      </div>

      {/* Client Onboarding Checklists */}
      <div className="space-y-4">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <CheckSquare size={15} className="text-emerald-400" />
          Client Onboarding Checklists
          <span className="text-slate-500 text-xs font-normal">— complete all tasks before investment can begin</span>
        </h2>

        {isBroker ? (
          employees.length === 0 ? (
            <div className="bg-[#111827] border border-slate-700/40 rounded-2xl py-10 text-center text-slate-500 text-sm">No employees yet.</div>
          ) : (
            <div className="space-y-6">
              {employees.map(emp => {
                const empEntries = checklistByEmployee[emp.id] ?? [];
                return (
                  <div key={emp.id}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                        {emp.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{emp.full_name}</p>
                        {emp.employee_code && <p className="text-cyan-400 font-mono text-xs">{emp.employee_code}</p>}
                      </div>
                      <span className="text-slate-500 text-xs">— {empEntries.length} client{empEntries.length !== 1 ? 's' : ''} assigned</span>
                    </div>
                    {empEntries.length === 0 ? (
                      <p className="text-slate-600 text-xs ml-10">No clients assigned yet.</p>
                    ) : (
                      <div className="ml-10 space-y-3">
                        {empEntries.map(e => (
                          <ChecklistSection key={`${e.clientId}-${e.employeeId}`}
                            clientId={e.clientId} employeeId={e.employeeId}
                            brokerId={e.brokerId} clientName={e.clientName} isBroker={true} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          checklistEntries.length === 0 ? (
            <div className="bg-[#111827] border border-slate-700/40 rounded-2xl py-10 text-center text-slate-500 text-sm">
              No clients assigned yet. Checklists will appear here once clients are assigned to you.
            </div>
          ) : (
            <div className="space-y-3">
              {checklistEntries.map(e => (
                <ChecklistSection key={`${e.clientId}-${e.employeeId}`}
                  clientId={e.clientId} employeeId={e.employeeId}
                  brokerId={e.brokerId} clientName={e.clientName} isBroker={false} />
              ))}
            </div>
          )
        )}
      </div>

      {showCreate && (
        <CreateActionModal employees={employees} clients={clients} brokerId={user!.id}
          onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
