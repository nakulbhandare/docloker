import { useState } from 'react';
import { Eye, EyeOff, TrendingUp, Shield, Building2, User, Copy, Check, KeyRound, Smartphone, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { SignUpResult } from '../context/AuthContext';

type Mode = 'login' | 'broker' | 'employee';

interface FieldErrors {
  email?: string;
  password?: string;
  fullName?: string;
  companyName?: string;
  phone?: string;
  brokerCode?: string;
}

function validateEmail(v: string) {
  if (!v.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  return '';
}

function validatePassword(v: string, mode: Mode) {
  if (!v) return 'Password is required.';
  if (mode !== 'login') {
    if (v.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(v)) return 'Include at least one uppercase letter.';
    if (!/[0-9]/.test(v)) return 'Include at least one number.';
  }
  return '';
}

function validatePhone(v: string) {
  if (!v.trim()) return '';
  if (!/^[+\d\s\-()]{7,15}$/.test(v.trim())) return 'Enter a valid phone number.';
  return '';
}

function validateBrokerCode(v: string) {
  if (!v.trim()) return 'Broker code is required.';
  if (v.trim().length !== 8) return 'Broker code must be exactly 8 characters.';
  if (!/^[A-Z0-9]+$/.test(v.trim())) return 'Broker code must be alphanumeric (A-Z, 0-9).';
  return '';
}

export default function LoginPage() {
  const { signIn, signUpBroker, signUpEmployee, verifyMfa, mfaRequired } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [signupResult, setSignupResult] = useState<SignUpResult | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const [f, setF] = useState({ email: '', password: '', fullName: '', companyName: '', phone: '', brokerCode: '' });

  function upd(k: keyof typeof f, v: string) {
    setF(p => ({ ...p, [k]: v }));
    setError('');
    // Clear field error on change
    if (fieldErrors[k as keyof FieldErrors]) {
      setFieldErrors(p => ({ ...p, [k]: '' }));
    }
  }

  function touch(k: string) {
    setTouched(p => new Set([...p, k]));
  }

  function validateAll(): FieldErrors {
    const errs: FieldErrors = {};
    errs.email = validateEmail(f.email);
    errs.password = validatePassword(f.password, mode);
    if (mode !== 'login') {
      if (!f.fullName.trim()) errs.fullName = 'Full name is required.';
      else if (f.fullName.trim().length < 2) errs.fullName = 'Name must be at least 2 characters.';
    }
    if (mode === 'broker') {
      if (!f.companyName.trim()) errs.companyName = 'Company name is required.';
      else if (f.companyName.trim().length < 2) errs.companyName = 'Company name must be at least 2 characters.';
    }
    if (mode === 'employee') {
      const phoneErr = validatePhone(f.phone);
      if (phoneErr) errs.phone = phoneErr;
      errs.brokerCode = validateBrokerCode(f.brokerCode);
    }
    // Remove empty strings
    return Object.fromEntries(Object.entries(errs).filter(([, v]) => v)) as FieldErrors;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Mark all as touched
    const allKeys = ['email', 'password', 'fullName', 'companyName', 'phone', 'brokerCode'];
    setTouched(new Set(allKeys));

    const errs = validateAll();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setLoading(true); setError(''); setFieldErrors({});
    if (mode === 'login') {
      const { error: err } = await signIn(f.email, f.password);
      if (err) setError(err);
    } else if (mode === 'broker') {
      const res = await signUpBroker({ email: f.email, password: f.password, fullName: f.fullName, companyName: f.companyName });
      if (res.error) setError(res.error);
      else setSignupResult(res);
    } else {
      const res = await signUpEmployee({ email: f.email, password: f.password, fullName: f.fullName, phone: f.phone, brokerCode: f.brokerCode });
      if (res.error) setError(res.error);
      else setSignupResult(res);
    }
    setLoading(false);
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await verifyMfa(mfaCode);
    if (err) setError(err);
    setLoading(false);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setFieldErrors({});
    setTouched(new Set());
  }

  const fe = (k: keyof FieldErrors) => touched.has(k) && fieldErrors[k] ? fieldErrors[k] : '';

  if (mfaRequired) {
    return (
      <LoginShell>
        <div className="bg-[#111827]/80 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Smartphone size={26} className="text-blue-400" />
            </div>
            <h2 className="text-white font-bold text-xl">Two-Factor Authentication</h2>
            <p className="text-slate-400 text-sm mt-1.5">Open your authenticator app and enter the 6-digit code</p>
          </div>
          <form onSubmit={submitMfa} className="space-y-4">
            <input
              type="text" value={mfaCode} onChange={e => { setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="000000" maxLength={6}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-4 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />
            {error && <ErrorBox msg={error} />}
            <button type="submit" disabled={loading || mfaCode.length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all">
              {loading ? <Spinner /> : 'Verify Code'}
            </button>
          </form>
          <FooterNote />
        </div>
      </LoginShell>
    );
  }

  if (signupResult) {
    return <SignupSuccess result={signupResult} onLogin={() => { setSignupResult(null); setMode('login'); setF({ email: '', password: '', fullName: '', companyName: '', phone: '', brokerCode: '' }); setTouched(new Set()); }} />;
  }

  return (
    <LoginShell>
      <div className="bg-[#111827]/80 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-8 shadow-2xl">
        {/* Tabs */}
        <div className="flex bg-slate-800/60 rounded-xl p-1 mb-6 gap-1">
          {(['login', 'broker', 'employee'] as Mode[]).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === m ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
              {m === 'login' ? 'Sign In' : m === 'broker' ? 'New Broker' : 'New Employee'}
            </button>
          ))}
        </div>

        {mode !== 'login' && (
          <div className={`flex items-center gap-3 p-3 rounded-xl border mb-5 ${mode === 'broker' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${mode === 'broker' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
              {mode === 'broker' ? <Building2 size={18} /> : <User size={18} />}
            </div>
            <div>
              <p className={`text-sm font-semibold ${mode === 'broker' ? 'text-blue-400' : 'text-emerald-400'}`}>
                {mode === 'broker' ? 'Broker Account' : 'Employee Account'}
              </p>
              <p className="text-slate-500 text-xs">{mode === 'broker' ? 'You will receive a unique Broker Code' : 'You will receive a unique Employee ID'}</p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode !== 'login' && (
            <ValidatedField label="Full Name" type="text" value={f.fullName}
              onChange={v => upd('fullName', v)}
              onBlur={() => { touch('fullName'); const e = !f.fullName.trim() ? 'Full name is required.' : f.fullName.trim().length < 2 ? 'Name too short.' : ''; setFieldErrors(p => ({ ...p, fullName: e })); }}
              placeholder="Rajesh Kumar" error={fe('fullName')} />
          )}

          <ValidatedField label="Email Address" type="email" value={f.email}
            onChange={v => upd('email', v)}
            onBlur={() => { touch('email'); setFieldErrors(p => ({ ...p, email: validateEmail(f.email) })); }}
            placeholder="you@example.com" error={fe('email')} />

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} value={f.password}
                onChange={e => upd('password', e.target.value)}
                onBlur={() => { touch('password'); setFieldErrors(p => ({ ...p, password: validatePassword(f.password, mode) })); }}
                placeholder={mode === 'login' ? 'Your password' : 'Min. 8 chars, 1 uppercase, 1 number'}
                className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 pr-12 text-sm transition-colors ${fe('password') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fe('password') && <FieldError msg={fe('password')!} />}
            {mode !== 'login' && !fe('password') && (
              <PasswordStrength password={f.password} />
            )}
          </div>

          {mode === 'broker' && (
            <ValidatedField label="Company / Brokerage Name" type="text" value={f.companyName}
              onChange={v => upd('companyName', v)}
              onBlur={() => { touch('companyName'); setFieldErrors(p => ({ ...p, companyName: !f.companyName.trim() ? 'Company name is required.' : '' })); }}
              placeholder="Artha Securities Pvt. Ltd." error={fe('companyName')} />
          )}

          {mode === 'employee' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone Number <span className="text-slate-500 font-normal">(optional)</span></label>
                <input type="tel" value={f.phone}
                  onChange={e => upd('phone', e.target.value)}
                  onBlur={() => { touch('phone'); setFieldErrors(p => ({ ...p, phone: validatePhone(f.phone) })); }}
                  placeholder="+91 98765 43210"
                  className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm transition-colors ${fe('phone') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
                {fe('phone') && <FieldError msg={fe('phone')!} />}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Broker Code <span className="text-slate-500 font-normal">(from your broker)</span></label>
                <input type="text" value={f.brokerCode}
                  onChange={e => upd('brokerCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                  onBlur={() => { touch('brokerCode'); setFieldErrors(p => ({ ...p, brokerCode: validateBrokerCode(f.brokerCode) })); }}
                  placeholder="AB3X9KYZ" maxLength={8}
                  className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 font-mono text-sm tracking-widest transition-colors ${fe('brokerCode') ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
                {fe('brokerCode') && <FieldError msg={fe('brokerCode')!} />}
                {f.brokerCode.length > 0 && f.brokerCode.length < 8 && !fe('brokerCode') && (
                  <p className="text-slate-500 text-xs mt-1">{f.brokerCode.length}/8 characters</p>
                )}
              </div>
            </>
          )}

          {error && <ErrorBox msg={error} />}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 mt-2 text-sm">
            {loading ? <Spinner /> : mode === 'login' ? 'Sign In to Dashboard' : mode === 'broker' ? 'Create Broker Account' : 'Register as Employee'}
          </button>
        </form>

        <FooterNote />
      </div>
    </LoginShell>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { ok: password.length >= 8, label: '8+ characters' },
    { ok: /[A-Z]/.test(password), label: 'Uppercase' },
    { ok: /[0-9]/.test(password), label: 'Number' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'Symbol' },
  ];
  const passed = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < passed ? colors[passed - 1] : 'bg-slate-700'}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <span key={c.label} className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-slate-600'}`}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ValidatedField({ label, type, value, onChange, onBlur, placeholder, error }: {
  label: string; type: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className={`w-full bg-slate-700/50 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 text-sm transition-colors ${error ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-600 focus:ring-blue-500/50'}`} />
      {error && <FieldError msg={error} />}
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
      <p className="text-red-400 text-xs">{msg}</p>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
      <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-sm">{msg}</p>
    </div>
  );
}

function FooterNote() {
  return (
    <div className="flex items-center justify-center gap-2 mt-6 pt-5 border-t border-slate-700/40">
      <Shield size={12} className="text-slate-500" />
      <p className="text-slate-500 text-xs">256-bit encryption &bull; SEBI compliant data storage</p>
    </div>
  );
}

function SignupSuccess({ result, onLogin }: { result: SignUpResult; onLogin: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const isBroker = !!result.brokerCode;

  async function copy(val: string, key: string) {
    await navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <LoginShell>
      <div className="bg-[#111827]/80 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-emerald-400" />
          </div>
          <h2 className="text-white font-bold text-xl">Account Created!</h2>
          <p className="text-slate-400 text-sm mt-1.5">
            Welcome, <span className="text-white font-medium">{result.fullName}</span>
          </p>
          {isBroker && result.companyName && (
            <p className="text-slate-500 text-xs mt-1">{result.companyName}</p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {isBroker ? (
            <>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2">Your Broker Code</p>
                <div className="flex items-center justify-between">
                  <p className="text-white font-mono font-bold text-3xl tracking-[0.3em]">{result.brokerCode}</p>
                  <button onClick={() => copy(result.brokerCode!, 'broker')} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition-all">
                    {copied === 'broker' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-blue-400/70 text-xs mt-3 leading-relaxed">
                  Share this code with your employees when they register. Keep it safe.
                </p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 flex items-center gap-2">
                <KeyRound size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-slate-400 text-xs">After signing in, set up 2FA in your account settings for extra security.</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">Your Employee ID</p>
                <div className="flex items-center justify-between">
                  <p className="text-white font-mono font-bold text-2xl tracking-[0.2em]">{result.employeeCode ?? 'Generating...'}</p>
                  {result.employeeCode && (
                    <button onClick={() => copy(result.employeeCode!, 'emp')} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition-all">
                      {copied === 'emp' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
                <p className="text-emerald-400/70 text-xs mt-3 leading-relaxed">
                  This is your unique Employee ID. Note it down for your records.
                </p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 flex items-center gap-2">
                <KeyRound size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-slate-400 text-xs">After signing in, set up 2FA in account settings for extra security.</p>
              </div>
            </>
          )}
        </div>

        <button onClick={onLogin}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-sm">
          Proceed to Sign In
        </button>
      </div>
    </LoginShell>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-0 w-[300px] h-[300px] bg-emerald-600/5 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-2xl shadow-blue-600/40">
            <TrendingUp size={30} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">StockVault Pro</h1>
          <p className="text-slate-400 mt-1.5 text-sm">India Equity & MF Management Platform</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-slate-500">
            <span>NSE</span><span className="w-1 h-1 rounded-full bg-slate-600" /><span>BSE</span><span className="w-1 h-1 rounded-full bg-slate-600" /><span>SEBI Compliant</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Processing...
    </span>
  );
}
