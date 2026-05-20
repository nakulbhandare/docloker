import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft, Upload, FileText, Trash2, Download,
  Mail, Phone, MapPin, CreditCard, Calendar,
  Edit2, Save, X, Plus, AlertCircle, ClipboardList,
  FileCheck, Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import AllocationTab from '../components/AllocationTab';
import type { Client, Document, InvestmentForm, FormSubmission } from '../lib/types';

const CATEGORY_COLORS: Record<string, string> = {
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

type Tab = 'overview' | 'documents' | 'forms' | 'allocation';

export default function ClientDetailPage({ client: init, onBack }: { client: Client; onBack: () => void }) {
  const { user, profile, effectiveProfile } = useAuth();
  const activeProfile = effectiveProfile ?? profile;
  const [client, setClient] = useState(init);
  const [tab, setTab] = useState<Tab>('overview');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [forms, setForms] = useState<InvestmentForm[]>([]);
  const [submissions, setSubmissions] = useState<(FormSubmission & { form_name: string })[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ ...init });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState('general');
  const [uploadErr, setUploadErr] = useState('');
  const [newFormId, setNewFormId] = useState('');
  const [addingForm, setAddingForm] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDocs(); loadForms(); }, []);

  async function loadDocs() {
    setLoadingDocs(true);
    const { data } = await supabase.from('documents').select('*').eq('client_id', client.id).order('created_at', { ascending: false });
    setDocuments(data ?? []);
    setLoadingDocs(false);
  }

  async function loadForms() {
    const [formR, subR] = await Promise.all([
      supabase.from('investment_forms').select('*').eq('is_active', true).order('form_type'),
      supabase.from('form_submissions').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
    ]);
    setForms(formR.data ?? []);
    const formMap = new Map((formR.data ?? []).map(f => [f.id, f.name]));
    setSubmissions((subR.data ?? []).map(s => ({ ...s, form_name: formMap.get(s.form_id) ?? 'Unknown Form' })));
    if (formR.data?.length) setNewFormId(formR.data[0].id);
  }

  async function saveClient() {
    setSaving(true);
    const { data } = await supabase.from('clients').update({
      full_name: editForm.full_name, email: editForm.email, phone: editForm.phone,
      address: editForm.address, pan_number: editForm.pan_number.toUpperCase(),
      aadhar_number: editForm.aadhar_number, date_of_birth: editForm.date_of_birth, notes: editForm.notes,
    }).eq('id', client.id).select().maybeSingle();
    setSaving(false);
    if (data) { setClient(data); setEditMode(false); }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !user) return;
    setUploading(true); setUploadErr('');
    for (const file of Array.from(e.target.files)) {
      // Store in per-client folder: clients/{clientId}/{timestamp}_{filename}
      const path = `clients/${client.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { error } = await supabase.storage.from('client-documents').upload(path, file);
      if (error) { setUploadErr(`Failed: ${error.message}`); continue; }
      await supabase.from('documents').insert({
        client_id: client.id, uploaded_by: user.id, name: file.name,
        storage_path: path, file_size: file.size, mime_type: file.type, category: uploadCat,
      });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    loadDocs();
  }

  async function downloadDoc(doc: Document) {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = doc.name; a.click(); }
  }

  async function deleteDoc(doc: Document) {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await supabase.storage.from('client-documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    loadDocs();
  }

  async function createFormSubmission() {
    if (!newFormId) return;
    setAddingForm(true);
    const form = forms.find(f => f.id === newFormId);
    const initialData: Record<string, string> = {};
    (form?.required_fields ?? []).forEach(field => { initialData[field.name] = ''; });
    await supabase.from('form_submissions').insert({ client_id: client.id, form_id: newFormId, data: initialData, status: 'draft' });
    setAddingForm(false);
    loadForms();
  }

  const tabs: { id: Tab; label: string; icon: JSX.Element; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <FileCheck size={14} /> },
    { id: 'documents', label: 'Documents', icon: <FileText size={14} />, count: documents.length },
    { id: 'forms', label: 'Forms & KYC', icon: <ClipboardList size={14} />, count: submissions.length },
    { id: 'allocation', label: 'Allocation', icon: <Layers size={14} /> },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
        <ArrowLeft size={16} />
        Back to Clients
      </button>

      {/* Client Header */}
      <div className="bg-[#111827] border border-slate-700/40 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center text-emerald-400 font-bold text-2xl flex-shrink-0">
              {client.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{client.full_name}</h1>
              <p className="text-slate-400 text-sm mt-0.5">Client since {new Date(client.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
              {client.pan_number && (
                <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-lg font-mono">
                  <CreditCard size={11} />
                  {client.pan_number}
                </span>
              )}
            </div>
          </div>
          <div>
            {editMode ? (
              <div className="flex gap-2">
                <button onClick={() => setEditMode(false)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-600 text-slate-300 text-xs hover:text-white transition-all"><X size={12} />Cancel</button>
                <button onClick={saveClient} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all">
                  <Save size={12} />{saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <button onClick={() => { setEditMode(true); setEditForm({ ...client }); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-all">
                <Edit2 size={12} />Edit
              </button>
            )}
          </div>
        </div>

        {/* Client Info Grid */}
        {editMode ? (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Full Name', key: 'full_name', type: 'text' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Phone', key: 'phone', type: 'tel' },
              { label: 'PAN Number', key: 'pan_number', type: 'text' },
              { label: 'Date of Birth', key: 'date_of_birth', type: 'date' },
              { label: 'Aadhaar (last 4)', key: 'aadhar_number', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                <input type={f.type} value={editForm[f.key as keyof typeof editForm] as string}
                  onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
              </div>
            ))}
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Address</label>
              <textarea value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} rows={2}
                className="w-full bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none" />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                className="w-full bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none" />
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: <Mail size={12} />, label: 'Email', val: client.email },
              { icon: <Phone size={12} />, label: 'Phone', val: client.phone },
              { icon: <MapPin size={12} />, label: 'Address', val: client.address },
              { icon: <Calendar size={12} />, label: 'DOB', val: client.date_of_birth ? new Date(client.date_of_birth).toLocaleDateString('en-IN') : '' },
            ].filter(f => f.val).map(f => (
              <div key={f.label} className="bg-slate-800/50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">{f.icon}<span className="text-xs">{f.label}</span></div>
                <p className="text-white text-xs truncate">{f.val}</p>
              </div>
            ))}
          </div>
        )}
        {!editMode && client.notes && (
          <div className="mt-3 bg-slate-800/40 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">Notes</p>
            <p className="text-slate-300 text-sm whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/40 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="bg-slate-700 text-slate-300 text-xs rounded-full px-1.5 py-0.5">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-white font-semibold">Client Documents</h2>
            <div className="flex items-center gap-2">
              <select value={uploadCat} onChange={e => setUploadCat(e.target.value)}
                className="bg-[#111827] border border-slate-700/40 rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none">
                {['general','identity','financial','legal','kyc','tax'].map(c => (
                  <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all">
                <Upload size={13} />{uploading ? 'Uploading...' : 'Upload'}
                <input ref={fileRef} type="file" multiple className="hidden" onChange={uploadFile} disabled={uploading} />
              </label>
            </div>
          </div>

          {uploadErr && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{uploadErr}</p>
          </div>}

          {loadingDocs ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-[#111827] border border-slate-700/40 rounded-xl animate-pulse" />)}</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 bg-[#111827] border border-slate-700/40 rounded-2xl">
              <FileText size={24} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden divide-y divide-slate-700/30">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-700/20 transition-colors group">
                  <FileText size={16} className="text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.general}`}>{doc.category}</span>
                      <span className="text-slate-600 text-xs">{fmtBytes(doc.file_size)}</span>
                      <span className="text-slate-600 text-xs">{new Date(doc.created_at).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => downloadDoc(doc)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all" title="Download PDF">
                      <Download size={14} />
                    </button>
                    <button onClick={() => deleteDoc(doc)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Forms Tab */}
      {tab === 'forms' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">KYC & Investment Forms</h2>
            <div className="flex items-center gap-2">
              <select value={newFormId} onChange={e => setNewFormId(e.target.value)}
                className="bg-[#111827] border border-slate-700/40 rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none">
                {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <button onClick={createFormSubmission} disabled={addingForm}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all">
                <Plus size={13} />{addingForm ? 'Creating...' : 'New Form'}
              </button>
            </div>
          </div>

          {submissions.length === 0 ? (
            <div className="text-center py-10 bg-[#111827] border border-slate-700/40 rounded-2xl">
              <ClipboardList size={24} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No forms created yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map(sub => (
                <FormCard key={sub.id} submission={sub} onRefresh={loadForms} isBroker={activeProfile?.role === 'broker'} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Documents', value: documents.length, icon: <FileText size={20} className="text-amber-400" />, color: 'amber' },
            { label: 'Forms Filed', value: submissions.length, icon: <ClipboardList size={20} className="text-blue-400" />, color: 'blue' },
            { label: 'Approved', value: submissions.filter(s => s.status === 'approved').length, icon: <FileCheck size={20} className="text-emerald-400" />, color: 'emerald' },
          ].map(s => (
            <div key={s.label} className={`bg-[#111827] border border-slate-700/40 rounded-2xl p-5 text-center`}>
              <div className={`w-10 h-10 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/20 flex items-center justify-center mx-auto mb-3`}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-slate-400 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Allocation Tab */}
      {tab === 'allocation' && (
        <AllocationTab
          clientId={client.id}
          clientName={client.full_name}
        />
      )}
    </div>
  );
}

function FormCard({ submission, onRefresh, isBroker }: { submission: FormSubmission & { form_name: string }; onRefresh: () => void; isBroker: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [data, setData] = useState<Record<string, string | number | boolean>>({ ...submission.data });
  const [saving, setSaving] = useState(false);

  const STATUS_BADGE: Record<string, string> = {
    draft: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  async function saveForm() {
    setSaving(true);
    await supabase.from('form_submissions').update({ data, updated_at: new Date().toISOString() }).eq('id', submission.id);
    setSaving(false);
    setEditMode(false);
    onRefresh();
  }

  async function submitForm() {
    setSaving(true);
    await supabase.from('form_submissions').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', submission.id);
    setSaving(false);
    onRefresh();
  }

  async function approveForm() {
    setSaving(true);
    await supabase.from('form_submissions').update({ status: 'approved', verified_at: new Date().toISOString() }).eq('id', submission.id);
    setSaving(false);
    onRefresh();
  }

  async function deleteForm() {
    if (!confirm('Delete this form submission?')) return;
    await supabase.from('form_submissions').delete().eq('id', submission.id);
    onRefresh();
  }

  return (
    <div className="bg-[#111827] border border-slate-700/40 rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-700/20 transition-colors text-left">
        <ClipboardList size={16} className="text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium">{submission.form_name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_BADGE[submission.status]}`}>{submission.status}</span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">{new Date(submission.updated_at).toLocaleDateString('en-IN')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {submission.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); setEditMode(true); setExpanded(true); }}
              className="text-xs text-slate-400 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">Edit</button>
          )}
          <button onClick={e => { e.stopPropagation(); deleteForm(); }}
            className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/40 p-5 space-y-3">
          <div className="space-y-3">
            {Object.entries(data).map(([key, val]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-400 mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                {editMode ? (
                  <input type="text" value={String(val)}
                    onChange={e => setData(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
                ) : (
                  <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-slate-300 text-xs">{String(val) || <span className="text-slate-600 italic">Empty</span>}</div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 text-xs font-medium hover:text-white">Cancel</button>
                <button onClick={saveForm} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {submission.status === 'draft' && (
                  <button onClick={submitForm} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50">
                    {saving ? '...' : 'Submit Form'}
                  </button>
                )}
                {isBroker && submission.status === 'submitted' && (
                  <button onClick={approveForm} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50">
                    {saving ? '...' : 'Approve'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
