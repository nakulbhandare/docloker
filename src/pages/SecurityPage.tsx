import { useEffect, useState } from 'react';
import { Shield, Smartphone, Check, X, AlertCircle, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Step = 'overview' | 'setup-scan' | 'setup-verify' | 'done';

export default function SecurityPage() {
  const { profile, enrollMfa, verifyMfaEnrollment, unenrollMfa, getMfaFactors, user } = useAuth();
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [step, setStep] = useState<Step>('overview');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => { loadFactors(); }, []);

  async function loadFactors() {
    const f = await getMfaFactors();
    setFactors(f);
  }

  async function startSetup() {
    setLoading(true); setError('');
    const res = await enrollMfa();
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setQrCode(res.qrCode);
    setSecret(res.secret);
    setFactorId(res.factorId);
    setStep('setup-scan');
  }

  async function verifySetup() {
    if (code.length !== 6) return;
    setLoading(true); setError('');
    const res = await verifyMfaEnrollment(factorId, code);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setStep('done');
    loadFactors();
  }

  async function remove(fid: string) {
    if (!confirm('Remove 2FA from your account? You will no longer need a code to sign in.')) return;
    setRemoving(true);
    await unenrollMfa(fid);
    setRemoving(false);
    loadFactors();
  }

  const verified = factors.filter(f => f.status === 'verified');
  const has2FA = verified.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield size={22} className="text-blue-400" />
          Security Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account security and two-factor authentication</p>
      </div>

      {/* Account Info */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Account Information</h2>
        <div className="space-y-3">
          <Row label="Name" value={profile?.full_name ?? ''} />
          <Row label="Email" value={user?.email ?? ''} />
          <Row label="Role" value={profile?.role === 'broker' ? 'Broker (Admin)' : 'Employee'} />
          {profile?.employee_code && <Row label="Employee ID" value={profile.employee_code} mono />}
        </div>
      </div>

      {/* 2FA Section */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700/40">
          <Smartphone size={18} className={has2FA ? 'text-emerald-400' : 'text-slate-400'} />
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Two-Factor Authentication (2FA)</h2>
            <p className="text-slate-500 text-xs mt-0.5">Protect your account with an authenticator app</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${has2FA ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700/60 text-slate-400'}`}>
            {has2FA ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="p-5">
          {step === 'overview' && (
            <>
              {has2FA ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                    <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-emerald-400 text-sm font-medium">2FA is active on your account</p>
                      <p className="text-slate-400 text-xs mt-1">Every login requires a 6-digit code from your authenticator app in addition to your password.</p>
                    </div>
                  </div>
                  {verified.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center">
                          <Smartphone size={16} className="text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">Authenticator App</p>
                          <p className="text-slate-500 text-xs">TOTP &bull; Active</p>
                        </div>
                      </div>
                      <button onClick={() => remove(f.id)} disabled={removing}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-all disabled:opacity-50">
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-400 text-sm font-medium">2FA is not enabled</p>
                      <p className="text-slate-400 text-xs mt-1">Your account is protected only by your password. Enable 2FA for stronger security.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['Google Authenticator', 'Microsoft Authenticator', 'Authy'].map(app => (
                      <div key={app} className="bg-slate-800/40 rounded-xl p-3 text-center border border-slate-700/30">
                        <Smartphone size={18} className="text-slate-400 mx-auto mb-1.5" />
                        <p className="text-slate-300 text-xs font-medium">{app}</p>
                      </div>
                    ))}
                  </div>
                  {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                  <button onClick={startSetup} disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2">
                    <KeyRound size={15} />
                    {loading ? 'Preparing...' : 'Enable Two-Factor Authentication'}
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'setup-scan' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-white font-semibold text-sm mb-1">Step 1: Scan QR Code</h3>
                <p className="text-slate-400 text-xs">Open your authenticator app (Google Authenticator, Authy, etc.) and scan this QR code.</p>
              </div>
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-2xl shadow-xl">
                  <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                <p className="text-slate-500 text-xs mb-2">Or enter this key manually:</p>
                <p className="text-white font-mono text-xs break-all tracking-wider">{secret}</p>
              </div>
              <button onClick={() => setStep('setup-verify')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all text-sm">
                I've scanned it — Next
              </button>
            </div>
          )}

          {step === 'setup-verify' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-white font-semibold text-sm mb-1">Step 2: Enter Verification Code</h3>
                <p className="text-slate-400 text-xs">Enter the 6-digit code shown in your authenticator app to confirm setup.</p>
              </div>
              <input
                type="text" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000" maxLength={6} autoFocus
                className="w-full bg-slate-700/40 border border-slate-600 rounded-xl px-4 py-4 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div className="flex gap-3">
                <button onClick={() => { setStep('setup-scan'); setCode(''); setError(''); }}
                  className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:text-white transition-all">
                  Back
                </button>
                <button onClick={verifySetup} disabled={loading || code.length !== 6}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-all">
                  {loading ? 'Verifying...' : 'Enable 2FA'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                <Check size={28} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">2FA Enabled Successfully!</h3>
                <p className="text-slate-400 text-sm mt-1.5">Your account is now protected with two-factor authentication. You'll need your authenticator app on every login.</p>
              </div>
              <button onClick={() => setStep('overview')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all text-sm">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`text-white text-sm font-medium ${mono ? 'font-mono tracking-wider text-cyan-400' : ''}`}>{value}</span>
    </div>
  );
}
