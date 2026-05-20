import { useState } from 'react';
import { LogOut, UserCog } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import BrokerDashboard from './pages/BrokerDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeesPage from './pages/EmployeesPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import FormsPage from './pages/FormsPage';
import PortfolioPage from './pages/PortfolioPage';
import InvestmentSummaryPage from './pages/InvestmentSummaryPage';
import AuditPage from './pages/AuditPage';
import SecurityPage from './pages/SecurityPage';
import TasksPage from './pages/TasksPage';
import type { Client, Profile } from './lib/types';

type View =
  | 'dashboard' | 'employees' | 'clients' | 'documents' | 'forms'
  | 'portfolio' | 'audit' | 'security' | 'client-detail'
  | 'investment-summary' | 'employee-investments' | 'tasks';

function AppInner() {
  const { session, profile, effectiveProfile, impersonating, stopImpersonating, loading } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [selClient, setSelClient] = useState<Client | null>(null);
  const [selEmployee, setSelEmployee] = useState<Profile | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading StockVault Pro...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) return <LoginPage />;

  function navigate(v: string, data?: unknown) {
    if (v === 'client-detail' && data) {
      setSelClient(data as Client);
      setView('client-detail');
    } else if (v === 'employee-investments' && data) {
      setSelEmployee(data as Profile);
      setView('employee-investments');
    } else {
      setView(v as View);
    }
  }

  function renderPage() {
    const role = effectiveProfile?.role ?? profile!.role;

    if (view === 'client-detail' && selClient) {
      return <ClientDetailPage client={selClient} onBack={() => setView('clients')} />;
    }
    if (view === 'employee-investments' && selEmployee) {
      return (
        <InvestmentSummaryPage
          targetEmployee={selEmployee}
          onBack={() => setView('employees')}
        />
      );
    }
    if (view === 'investment-summary') {
      return (
        <InvestmentSummaryPage
          selfMode
          onBack={() => setView('dashboard')}
        />
      );
    }

    switch (view) {
      case 'dashboard':
        return role === 'broker' && !impersonating
          ? <BrokerDashboard onNavigate={navigate} />
          : <EmployeeDashboard onNavigate={navigate} />;
      case 'employees':
        return !impersonating
          ? <EmployeesPage onNavigate={navigate} />
          : <ClientsPage onNavigate={navigate} />;
      case 'clients': return <ClientsPage onNavigate={navigate} />;
      case 'documents': return <DocumentsPage />;
      case 'forms': return <FormsPage />;
      case 'portfolio': return <PortfolioPage />;
      case 'tasks': return <TasksPage />;
      case 'audit': return <AuditPage />;
      case 'security': return <SecurityPage />;
      default:
        return role === 'broker' && !impersonating
          ? <BrokerDashboard onNavigate={navigate} />
          : <EmployeeDashboard onNavigate={navigate} />;
    }
  }

  const activeNav = view === 'client-detail' ? 'clients'
    : view === 'employee-investments' ? 'employees'
    : view === 'investment-summary' ? 'portfolio'
    : view;

  return (
    <div className="relative">
      {impersonating && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-semibold shadow-lg">
          <div className="flex items-center gap-2">
            <UserCog size={16} />
            <span>Viewing as: <strong>{impersonating.full_name}</strong></span>
            {impersonating.employee_code && (
              <span className="font-mono text-amber-800 text-xs bg-amber-600/20 px-2 py-0.5 rounded-md">{impersonating.employee_code}</span>
            )}
          </div>
          <button onClick={() => { stopImpersonating(); setView('employees'); }}
            className="flex items-center gap-1.5 bg-amber-950/20 hover:bg-amber-950/40 border border-amber-950/30 px-3 py-1 rounded-lg transition-all text-xs font-bold">
            <LogOut size={13} /> Exit Employee View
          </button>
        </div>
      )}
      <div className={impersonating ? 'pt-10' : ''}>
        <Layout activeView={activeNav} onNavigate={navigate}>
          {renderPage()}
        </Layout>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
