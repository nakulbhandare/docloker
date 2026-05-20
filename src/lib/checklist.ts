import type { ChecklistCategory } from './types';
import { supabase } from './supabase';

export interface ChecklistTemplate {
  item_key: string;
  label: string;
  category: ChecklistCategory;
  sort_order: number;
  mandatory: boolean;
}

export const CLIENT_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  // Profile
  { item_key: 'profile_name',         label: 'Full name verified',                      category: 'profile',    sort_order: 1,  mandatory: true  },
  { item_key: 'profile_dob',          label: 'Date of birth recorded',                  category: 'profile',    sort_order: 2,  mandatory: true  },
  { item_key: 'profile_phone',        label: 'Phone number confirmed',                  category: 'profile',    sort_order: 3,  mandatory: true  },
  { item_key: 'profile_email',        label: 'Email address confirmed',                 category: 'profile',    sort_order: 4,  mandatory: true  },
  { item_key: 'profile_address',      label: 'Residential address filled',              category: 'profile',    sort_order: 5,  mandatory: true  },
  // KYC
  { item_key: 'kyc_pan',              label: 'PAN card number entered',                 category: 'kyc',        sort_order: 10, mandatory: true  },
  { item_key: 'kyc_aadhaar',          label: 'Aadhaar (last 4 digits) entered',         category: 'kyc',        sort_order: 11, mandatory: true  },
  { item_key: 'kyc_pan_doc',          label: 'PAN card document uploaded',              category: 'kyc',        sort_order: 12, mandatory: true  },
  { item_key: 'kyc_aadhaar_doc',      label: 'Aadhaar document uploaded',               category: 'kyc',        sort_order: 13, mandatory: true  },
  { item_key: 'kyc_photo',            label: 'Passport-size photo uploaded',            category: 'kyc',        sort_order: 14, mandatory: true  },
  { item_key: 'kyc_signature',        label: 'Signature specimen collected',            category: 'kyc',        sort_order: 15, mandatory: true  },
  // Documents
  { item_key: 'doc_bank_statement',   label: 'Bank statement uploaded (3 months)',      category: 'documents',  sort_order: 20, mandatory: true  },
  { item_key: 'doc_cancelled_cheque', label: 'Cancelled cheque / IFSC verified',        category: 'documents',  sort_order: 21, mandatory: true  },
  { item_key: 'doc_income_proof',     label: 'Income proof / ITR uploaded',             category: 'documents',  sort_order: 22, mandatory: true  },
  { item_key: 'doc_address_proof',    label: 'Address proof document uploaded',         category: 'documents',  sort_order: 23, mandatory: true  },
  { item_key: 'doc_photo_id',         label: 'Photo ID proof uploaded',                 category: 'documents',  sort_order: 24, mandatory: true  },
  // Investment readiness
  { item_key: 'inv_risk_profile',     label: 'Risk profile assessment completed',       category: 'investment', sort_order: 30, mandatory: true  },
  { item_key: 'inv_demat_account',    label: 'Demat account details collected',         category: 'investment', sort_order: 31, mandatory: true  },
  { item_key: 'inv_trading_account',  label: 'Trading account details collected',       category: 'investment', sort_order: 32, mandatory: true  },
  { item_key: 'inv_nominee',          label: 'Nominee details recorded',                category: 'investment', sort_order: 33, mandatory: true  },
  { item_key: 'inv_bank_mandate',     label: 'Bank mandate / NACH form signed',         category: 'investment', sort_order: 34, mandatory: true  },
  { item_key: 'inv_form_submitted',   label: 'Investment form submitted & approved',    category: 'investment', sort_order: 35, mandatory: true  },
];

export async function seedChecklist(clientId: string, employeeId: string, brokerId: string) {
  const rows = CLIENT_CHECKLIST_TEMPLATES.map(t => ({
    client_id: clientId,
    employee_id: employeeId,
    broker_id: brokerId,
    item_key: t.item_key,
    label: t.label,
    category: t.category,
    sort_order: t.sort_order,
    mandatory: t.mandatory,
  }));
  await supabase.from('client_checklists').insert(rows);
}

export async function seedDefaultBrokerActions(
  clientId: string,
  clientName: string,
  employeeId: string,
  brokerId: string,
) {
  const DEFAULT_ACTIONS = [
    { title: `Complete profile details for ${clientName}`, description: 'Verify and fill in full name, date of birth, phone, email, and residential address.', priority: 'high' },
    { title: `Upload PAN card for ${clientName}`, description: 'Collect PAN card copy and upload to the Documents section. Verify PAN number format (ABCDE1234F).', priority: 'urgent' },
    { title: `Upload Aadhaar card for ${clientName}`, description: 'Collect Aadhaar card copy and upload. Record last 4 digits in the client profile.', priority: 'urgent' },
    { title: `Upload bank statement for ${clientName}`, description: 'Collect last 3 months bank statement and upload to Documents.', priority: 'high' },
    { title: `Collect cancelled cheque / IFSC for ${clientName}`, description: 'Get a cancelled cheque or bank passbook copy with IFSC code for mandate setup.', priority: 'high' },
    { title: `Upload income proof / ITR for ${clientName}`, description: 'Collect latest ITR or Form 16 as income proof. Upload to Documents section.', priority: 'high' },
    { title: `Collect address proof for ${clientName}`, description: 'Upload a valid address proof document (Aadhaar, utility bill, or bank statement).', priority: 'normal' },
    { title: `Complete KYC for ${clientName}`, description: 'Ensure all KYC documents are uploaded: PAN, Aadhaar, photo, signature. Mark checklist items complete.', priority: 'urgent' },
    { title: `Complete risk profile assessment for ${clientName}`, description: 'Conduct the risk profile questionnaire and determine the client\'s investment risk appetite (conservative / moderate / aggressive).', priority: 'high' },
    { title: `Collect demat & trading account details for ${clientName}`, description: 'Get the client\'s demat account number, DP ID, and trading account details. Record in client notes.', priority: 'high' },
    { title: `Collect nominee details for ${clientName}`, description: 'Record nominee name, relationship, and contact details for all investment accounts.', priority: 'normal' },
    { title: `Get bank mandate / NACH form signed for ${clientName}`, description: 'Get the NACH mandate signed for SIP auto-debits. Submit to the bank/AMC.', priority: 'normal' },
    { title: `Submit investment form for ${clientName}`, description: 'Once all documents are collected and KYC is done, fill and submit the investment application form. Get client sign-off.', priority: 'normal' },
  ];

  const rows = DEFAULT_ACTIONS.map(a => ({
    broker_id: brokerId,
    assigned_to: employeeId,
    client_id: clientId,
    title: a.title,
    description: a.description,
    priority: a.priority,
    status: 'open',
  }));
  await supabase.from('broker_actions').insert(rows);
}
