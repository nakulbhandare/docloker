import { ReactNode, useState, useRef, useEffect } from 'react';
import {
  TrendingUp, LayoutDashboard, Users, UserCheck, FolderOpen,
  LogOut, Menu, Shield, Building2, Copy, Check,
  BarChart2, ClipboardList, ChevronRight, Lock, User,
  Phone, Hash, Pencil, X, Save, ChevronDown, KeyRound, CheckSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface NavItem { id: string; label: string; icon: ReactNode; role?: 'broker' | 'employee'; divider?: boolean; badge?: ReactNode; }

function TaskNavIcon({ count }: { count: number }) {
  return (
    <div className="relative">
      <CheckSquare size={17} />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 border border-[#0d1424] rounded-full flex items-center justify-center text-white font-bold" style={{ fontSize: '8px' }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
}

interface Props { children: ReactNode; activeView: string; onNavigate: (v: string) => void; }

// ---- Profile Settings Modal ----
function ProfileSettingsModal({ onClose, onNavigateSecurity }: { onClose: () => void; onNavigateSecurity: () => void }) {
  const { profile, user, brokerInfo, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pwSection, setPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  async function saveProfile() {
    if (!fullName.trim()) return;
    setSaving(true); setSaveMsg('');
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      phone: phone.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);
    setSaving(false);
    if (error) { setSaveMsg('Failed to save: ' + error.message); return; }
    await refreshProfile();
    setSaveMsg('Saved!');
    setEditing(false);
    setTimeout(() => setSaveMsg(''), 2500);
  }

  async function changePassword() {
    if (newPw !== confirmPw) { setPwMsg("Passwords don't match."); return; }
    if (newPw.length < 8) { setPwMsg('Password must be at least 8 characters.'); return; }
    setPwLoading(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) { setPwMsg(error.message); return; }
    setPwMsg('Password updated successfully!');
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setTimeout(() => { setPwMsg(''); setPwSection(false); }, 2500);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111827] border border-slate-700/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <User size={16} className="text-blue-400" />
            <h2 className="text-white font-bold text-sm">Profile Settings</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700/40">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600/20 border-2 border-blue-600/40 flex items-center justify-center text-blue-400 font-bold text-xl flex-shrink-0">
              {(fullName || profile?.full_name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold">{profile?.full_name}</p>
              <p className="text-slate-400 text-xs">{user?.email}</p>
              <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded font-medium ${profile?.role === 'broker' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {profile?.role === 'broker' ? 'Broker' : 'Employee'}
              </span>
            </div>
          </div>

          {/* Info fields */}
          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/30">
              <span className="text-slate-300 text-sm font-medium">Account Details</span>
              <button onClick={() => { setEditing(e => !e); setSaveMsg(''); }}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <Pencil size={12} />
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="divide-y divide-slate-700/30">
              <div className="flex items-start gap-3 px-4 py-3">
                <User size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500 text-xs">Full Name</p>
                  {editing ? (
                    <input value={fullName} onChange={e => setFullName(e.target.value)}
                      className="mt-1 w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                  ) : (
                    <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 px-4 py-3">
                <Phone size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500 text-xs">Phone</p>
                  {editing ? (
                    <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="mt-1 w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      placeholder="10-digit mobile" />
                  ) : (
                    <p className="text-white text-sm font-medium">{profile?.phone || <span className="text-slate-500">Not set</span>}</p>
                  )}
                </div>
              </div>

              {profile?.employee_code && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Hash size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-slate-500 text-xs">Employee ID</p>
                    <p className="text-cyan-400 font-mono font-bold text-sm tracking-wider">{profile.employee_code}</p>
                  </div>
                </div>
              )}

              {profile?.role === 'broker' && brokerInfo && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Building2 size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-slate-500 text-xs">Company</p>
                    <p className="text-white text-sm font-medium">{brokerInfo.company_name}</p>
                    <p className="text-cyan-400 font-mono text-xs mt-0.5 tracking-[0.15em]">Code: {brokerInfo.broker_code}</p>
                  </div>
                </div>
              )}
            </div>

            {editing && (
              <div className="px-4 py-3 border-t border-slate-700/30 flex items-center gap-3">
                <button onClick={saveProfile} disabled={saving || !fullName.trim()}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
                  <Save size={13} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveMsg && <p className={`text-xs ${saveMsg.startsWith('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>{saveMsg}</p>}
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl overflow-hidden">
            <button onClick={() => setPwSection(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">Change Password</span>
              </div>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${pwSection ? 'rotate-180' : ''}`} />
            </button>
            {pwSection && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30 pt-3">
                <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwMsg(''); }}
                  placeholder="New password" autoComplete="new-password"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-slate-500" />
                <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwMsg(''); }}
                  placeholder="Confirm new password" autoComplete="new-password"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-slate-500" />
                {pwMsg && <p className={`text-xs ${pwMsg.includes('success') ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg}</p>}
                <button onClick={changePassword} disabled={pwLoading || !newPw || !confirmPw}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="flex gap-3">
            <button onClick={() => { onNavigateSecurity(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 text-slate-300 hover:text-white px-3 py-2.5 rounded-xl text-sm font-medium transition-all">
              <Shield size={14} />
              Security & 2FA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Profile Avatar Button (top-right) ----
function ProfileButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-9 h-9 rounded-full bg-blue-600/20 border-2 border-blue-600/40 hover:border-blue-500 flex items-center justify-center text-blue-400 font-bold text-sm transition-all hover:scale-105">
        {profile?.full_name?.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-48 bg-[#1a2235] border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-700/40">
            <p className="text-white text-sm font-semibold truncate">{profile?.full_name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${profile?.role === 'broker' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {profile?.role === 'broker' ? 'Broker' : 'Employee'}
            </span>
          </div>
          <button onClick={() => { onOpenSettings(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors">
            <User size={14} className="text-slate-400" />
            Profile Settings
          </button>
          <div className="border-t border-slate-700/30" />
          <button onClick={signOut}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, activeView, onNavigate }: Props) {
  const { profile, brokerInfo, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [taskBadgeCount, setTaskBadgeCount] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;
    async function fetchTaskBadge() {
      if (profile!.role === 'employee') {
        const brokerId = profile!.broker_id;
        if (!brokerId) return;
        const { count } = await supabase
          .from('broker_actions')
          .select('*', { count: 'exact', head: true })
          .or(`assigned_to.eq.${user!.id},and(assigned_to.is.null,broker_id.eq.${brokerId})`)
          .in('status', ['open', 'in_progress']);
        setTaskBadgeCount(count ?? 0);
      } else {
        const { count } = await supabase
          .from('broker_actions')
          .select('*', { count: 'exact', head: true })
          .eq('broker_id', user!.id)
          .in('status', ['open', 'in_progress']);
        setTaskBadgeCount(count ?? 0);
      }
    }
    fetchTaskBadge();
  }, [user, profile, activeView]);

  const NAV: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { id: 'employees', label: 'Employees', icon: <Users size={17} />, role: 'broker' },
    { id: 'clients', label: 'Clients', icon: <UserCheck size={17} /> },
    { id: 'portfolio', label: 'Portfolio', icon: <BarChart2 size={17} /> },
    { id: 'tasks', label: 'Tasks', icon: <TaskNavIcon count={taskBadgeCount} /> },
    { id: 'forms', label: 'Forms & KYC', icon: <ClipboardList size={17} /> },
    { id: 'documents', label: 'Documents', icon: <FolderOpen size={17} /> },
    { id: 'audit', label: 'Audit Logs', icon: <Shield size={17} />, role: 'broker', divider: true },
    { id: 'security', label: 'Security & 2FA', icon: <Lock size={17} />, divider: true },
  ];

  const nav = NAV.filter(n => !n.role || n.role === profile?.role);

  async function copyCode() {
    if (brokerInfo?.broker_code) {
      await navigator.clipboard.writeText(brokerInfo.broker_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-[#0d1424]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/40">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30">
          <TrendingUp size={18} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold leading-none text-sm">StockVault Pro</p>
          <p className="text-slate-500 text-xs mt-0.5">India Stock & MF Portal</p>
        </div>
      </div>

      {/* Profile */}
      <div className="px-4 py-4 border-b border-slate-700/40">
        <button onClick={() => setShowProfile(true)}
          className="w-full bg-slate-800/60 hover:bg-slate-700/60 rounded-xl p-3 text-left transition-all group">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0 text-blue-400 font-bold text-sm group-hover:border-blue-500 transition-colors">
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${profile?.role === 'broker' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {profile?.role === 'broker' ? 'Broker' : 'Employee'}
                </span>
              </div>
            </div>
            <Pencil size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
          </div>
          {profile?.role === 'broker' && brokerInfo && (
            <div className="mt-3 pt-3 border-t border-slate-700/40">
              <p className="text-slate-500 text-xs mb-1">{brokerInfo.company_name}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-xs">Broker Code</p>
                  <p className="text-cyan-400 font-mono font-bold text-sm tracking-[0.2em]">{brokerInfo.broker_code}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); copyCode(); }} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-slate-600 text-xs mt-1">Share with employees to register</p>
            </div>
          )}
          {profile?.role === 'employee' && profile.employee_code && (
            <div className="mt-2 pt-2 border-t border-slate-700/40">
              <p className="text-slate-500 text-xs">Employee ID</p>
              <p className="text-cyan-400 font-mono font-bold text-sm tracking-wider">{profile.employee_code}</p>
            </div>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {nav.map((item, idx) => (
          <div key={item.id}>
            {item.divider && idx > 0 && <div className="my-2 border-t border-slate-700/30" />}
            <button onClick={() => { onNavigate(item.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                activeView === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
              }`}>
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {activeView === item.id && <ChevronRight size={13} className="opacity-60" />}
            </button>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-700/40 space-y-1">
        <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-600">
          <Shield size={12} />
          <span>SEBI Compliant &bull; Data Encrypted</span>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0a0f1e] overflow-hidden">
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-slate-700/40">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 border-r border-slate-700/40">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-[#0d1424] border-b border-slate-700/40">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-400" />
            <span className="text-white font-bold text-sm">StockVault Pro</span>
          </div>
          <div className="ml-auto">
            <ProfileButton onOpenSettings={() => setShowProfile(true)} />
          </div>
        </header>

        {/* Desktop top-right profile button */}
        <div className="hidden lg:flex absolute top-4 right-5 z-40">
          <ProfileButton onOpenSettings={() => setShowProfile(true)} />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {showProfile && (
        <ProfileSettingsModal
          onClose={() => setShowProfile(false)}
          onNavigateSecurity={() => { onNavigate('security'); }}
        />
      )}
    </div>
  );
}
