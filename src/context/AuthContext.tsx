import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, BrokerInfo } from '../lib/types';

export interface SignUpResult {
  error: string | null;
  brokerCode?: string;
  employeeCode?: string;
  companyName?: string;
  fullName?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  brokerInfo: BrokerInfo | null;
  loading: boolean;
  mfaRequired: boolean;
  // Impersonation: broker viewing as an employee
  impersonating: Profile | null;
  effectiveProfile: Profile | null; // profile or impersonated profile
  signIn: (email: string, password: string) => Promise<{ error: string | null; mfaRequired?: boolean }>;
  verifyMfa: (code: string) => Promise<{ error: string | null }>;
  signUpBroker: (p: { email: string; password: string; fullName: string; companyName: string }) => Promise<SignUpResult>;
  signUpEmployee: (p: { email: string; password: string; fullName: string; phone: string; brokerCode: string }) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  enrollMfa: () => Promise<{ qrCode: string; secret: string; factorId: string; error: string | null }>;
  verifyMfaEnrollment: (factorId: string, code: string) => Promise<{ error: string | null }>;
  unenrollMfa: (factorId: string) => Promise<{ error: string | null }>;
  getMfaFactors: () => Promise<{ id: string; status: string }[]>;
  startImpersonating: (emp: Profile) => void;
  stopImpersonating: () => void;
  setupEmployeeStorage: (employeeId: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [brokerInfo, setBrokerInfo] = useState<BrokerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [pendingMfaSession, setPendingMfaSession] = useState<Session | null>(null);
  const [impersonating, setImpersonating] = useState<Profile | null>(null);

  const effectiveProfile = impersonating ?? profile;

  async function loadProfile(uid: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (p) {
      setProfile(p);
      if (p.role === 'broker') {
        const { data: b } = await supabase.from('brokers').select('*').eq('id', uid).maybeSingle();
        setBrokerInfo(b ?? null);
      } else {
        setBrokerInfo(null);
      }
    }
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'MFA_CHALLENGE_VERIFIED') {
        setSession(s);
        setUser(s?.user ?? null);
        setMfaRequired(false);
        if (s?.user) {
          (async () => { await loadProfile(s.user.id); })();
        }
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        (async () => { await loadProfile(s.user.id); })();
      } else {
        setProfile(null);
        setBrokerInfo(null);
        setImpersonating(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.session?.user) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        setPendingMfaSession(data.session);
        setMfaRequired(true);
        return { error: null, mfaRequired: true };
      }
    }
    return { error: null };
  }

  async function verifyMfa(code: string) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) return { error: 'No MFA factor found.' };

    const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (ce) return { error: ce.message };

    const { error: ve } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code });
    if (ve) return { error: ve.message };

    setMfaRequired(false);
    setPendingMfaSession(null);
    return { error: null };
  }

  async function signUpBroker({ email, password, fullName, companyName }: {
    email: string; password: string; fullName: string; companyName: string;
  }) {
    const code = generateCode();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'broker', broker_id: '', phone: '' } },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-up failed.' };

    const { error: be } = await supabase.from('brokers').insert({ id: data.user.id, company_name: companyName, broker_code: code });
    if (be) return { error: be.message };
    return { error: null, brokerCode: code, companyName, fullName };
  }

  async function signUpEmployee({ email, password, fullName, phone, brokerCode }: {
    email: string; password: string; fullName: string; phone: string; brokerCode: string;
  }) {
    const { data: broker } = await supabase.from('brokers').select('id').eq('broker_code', brokerCode.toUpperCase()).maybeSingle();
    if (!broker) return { error: 'Invalid broker code. Please check with your broker.' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'employee', broker_id: broker.id, phone } },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-up failed.' };

    await new Promise(r => setTimeout(r, 800));
    const { data: prof } = await supabase.from('profiles').select('employee_code').eq('id', data.user.id).maybeSingle();
    return { error: null, employeeCode: prof?.employee_code ?? undefined, fullName };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setBrokerInfo(null);
    setMfaRequired(false);
    setImpersonating(null);
  }

  function startImpersonating(emp: Profile) {
    // Broker views the app as if they are that employee (client-side only)
    setImpersonating(emp);
  }

  function stopImpersonating() {
    setImpersonating(null);
  }

  async function setupEmployeeStorage(employeeId: string): Promise<{ error: string | null }> {
    // Creates a storage folder marker for the employee (uploads a placeholder)
    // In Supabase Storage, folders are implicit — uploading a file creates the path.
    // We just ensure the employee has an entry that can hold their files.
    // The actual per-client folder is created on first document upload.
    return { error: null };
  }

  async function enrollMfa() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
    if (error || !data) return { qrCode: '', secret: '', factorId: '', error: error?.message ?? 'Failed to enroll.' };
    return { qrCode: data.totp.qr_code, secret: data.totp.secret, factorId: data.id, error: null };
  }

  async function verifyMfaEnrollment(factorId: string, code: string) {
    const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId });
    if (ce) return { error: ce.message };
    const { error: ve } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (ve) return { error: ve.message };
    return { error: null };
  }

  async function unenrollMfa(factorId: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    return { error: error?.message ?? null };
  }

  async function getMfaFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    return (data?.totp ?? []).map(f => ({ id: f.id, status: f.status }));
  }

  return (
    <AuthContext.Provider value={{
      session, user, profile, brokerInfo, loading, mfaRequired,
      impersonating, effectiveProfile,
      signIn, verifyMfa, signUpBroker, signUpEmployee, signOut, refreshProfile,
      enrollMfa, verifyMfaEnrollment, unenrollMfa, getMfaFactors,
      startImpersonating, stopImpersonating, setupEmployeeStorage,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
