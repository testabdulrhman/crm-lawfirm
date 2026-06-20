// أنواع TypeScript لجداول Supabase المستخدمة في هذه الوحدة.
// مطابقة لأعمدة القاعدة (القسم 9 من المهمة) مع nullability صحيح.

export interface TeamMember {
  id: string
  name: string
  short_name: string | null
  role: string | null
  email: string | null
  phone: string | null
  is_director: boolean | null
  is_active: boolean | null
  avatar_color: string | null
  avatar_initial: string | null
  avatar_url: string | null
  auth_id: string | null // الربط بـ auth.users
  date_of_birth: string | null
  id_number: string | null
  national_address: string | null
  join_date: string | null
  bank_name: string | null
  bank_iban: string | null
  qualifications: string | null
  cv_url: string | null
  lawyer_license_url: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  qualification_doc_url: string | null
  created_at: string | null
}

// الحقول القابلة للكتابة عند الإضافة/التعديل (نكتب فقط في team_members)
export type TeamMemberInput = Partial<
  Omit<TeamMember, 'id' | 'created_at' | 'auth_id'>
> & {
  name: string
}

export interface OfficeInfo {
  id: string
  office_name: string | null
  address: string | null
  phone: string | null
  email: string | null
  tax_number: string | null
  commercial_register: string | null
  bank_name: string | null
  iban: string | null
  account_number: string | null
  account_short_name: string | null
  details: string | null
  logo_url: string | null
  stamp_url: string | null
  favicon_url: string | null
  updated_at: string | null
}

export type OfficeInfoInput = Partial<Omit<OfficeInfo, 'id' | 'updated_at'>>

export interface LookupValue {
  id: string
  type: string
  value: string
  label: string
  color: string | null
  icon: string | null
  sort_order: number | null
  created_at: string | null
}

export type LookupValueInput = {
  type: string
  value: string
  label: string
  color?: string | null
  icon?: string | null
  sort_order?: number | null
}

/* ===================== الطلبات الواردة ===================== */

export type RequestStatus =
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'deferred'

export type RequestType =
  | 'case'
  | 'consultation'
  | 'regulation'
  | 'contract'
  | 'other'

export interface IncomingRequest {
  id: string
  client_name: string
  client_phone: string | null
  client_id: string | null
  request_type: string | null
  received_at: string | null
  description: string | null
  status: string | null
  rejection_reason: string | null
  decision_at: string | null
  decision_by: string | null
  converted_to_type: string | null
  converted_to_id: string | null
  converted_at: string | null
  assigned_to_id: string | null
  assigned_to_name: string | null
  assigned_at: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export type IncomingRequestInput = {
  client_name: string
  client_phone?: string | null
  client_id?: string | null
  request_type?: string | null
  received_at?: string | null
  description?: string | null
  status?: string | null
  created_by?: string | null
}

export interface RequestEvaluation {
  id: string
  request_id: string | null
  evaluator_id: string | null
  evaluator_name: string | null
  summary: string | null
  strengths: string | null
  weaknesses: string | null
  recommendation: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type RequestEvaluationInput = {
  request_id: string
  evaluator_id?: string | null
  evaluator_name?: string | null
  summary?: string | null
  strengths?: string | null
  weaknesses?: string | null
  recommendation?: string | null
  notes?: string | null
}

export interface RequestDocument {
  id: string
  request_id: string | null
  name: string | null
  file_url: string | null
  created_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

/* ===================== جهات الاتصال ===================== */

// التصنيف المعتمد = category (client | caller | service). type عمود قديم للتوافق فقط.
export type ContactCategory = 'client' | 'caller' | 'service'
export type ContactEntityType = 'فرد' | 'منشأة'
export type ContactSource = 'manual' | 'whatsapp' | 'imported' | 'hatif'

export interface Contact {
  id: string
  name: string | null
  phone: string | null
  phone2: string | null
  email: string | null
  city: string | null
  nationality: string | null
  id_number: string | null
  gender: string | null
  birth_date: string | null
  occupation: string | null
  notes: string | null
  contract_date: string | null
  serial_number: string | null
  category: string | null // مصدر الحقيقة للتصنيف
  type: string | null // قديم — للتوافق فقط
  entity_type: string | null
  source: string | null
  hatif_call_id: string | null
  created_at: string | null
  updated_at: string | null
}

// مدخلات النموذج (نكتب category و type معاً)
export interface ContactInput {
  name: string
  category: string
  type: string
  entity_type?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  city?: string | null
  nationality?: string | null
  id_number?: string | null
  gender?: string | null
  birth_date?: string | null
  occupation?: string | null
  contract_date?: string | null
  serial_number?: string | null
  notes?: string | null
  source?: string | null
}

export interface ContactWorkLinks {
  contact_id: string
  cases_count: number
  services_count: number
  appointments_count: number
  requests_count: number
  property_count: number
  total_links: number
}

/* ===================== القضايا ===================== */

export type CaseStatus = 'jarri' | 'muntahia' | 'muallaq'

// شكل الـ join المختصر
export interface CaseContactRef {
  id: string
  name: string | null
  phone: string | null
}
export interface CaseAssigneeRef {
  id: string
  name: string | null
  short_name: string | null
}

export interface Case {
  id: string
  office_num: string | null
  court_num: string | null
  title: string | null
  type: string | null
  status: string | null
  court: string | null
  court_division: string | null
  subject: string | null
  assignee_id: string | null
  contact_id: string | null
  progress: number | null
  hearing_date: string | null
  hearing_label: string | null
  docs_count: number | null
  open_date: string | null
  close_date: string | null
  created_at: string | null
  updated_at: string | null
  // علاقات (join)
  contact?: CaseContactRef | null
  assignee?: CaseAssigneeRef | null
}

export interface CaseInput {
  title: string
  type?: string | null
  status?: string | null
  office_num?: string | null
  court_num?: string | null
  court?: string | null
  court_division?: string | null
  contact_id?: string | null
  assignee_id?: string | null
  subject?: string | null
  open_date?: string | null
  progress?: number | null
}

/* ===== القضايا: الأطراف ===== */

export type PartySide = 'plaintiff' | 'defendant'

export interface CaseParty {
  id: string
  case_id: string | null
  name: string | null
  role: string | null
  party_side: string | null
  phone: string | null
  id_number: string | null
  nationality: string | null
  notes: string | null
  contact_id: string | null // ربط اختياري بجهة اتصال
  created_at: string | null
}

export interface CasePartyInput {
  case_id: string
  name: string
  party_side: string
  role?: string | null
  phone?: string | null
  id_number?: string | null
  nationality?: string | null
  notes?: string | null
  contact_id?: string | null
}

/* ===== القضايا: الجلسات (public.sessions) ===== */

export interface CaseSession {
  id: string
  case_id: string | null
  title: string | null
  session_date: string | null
  session_time: string | null
  court: string | null
  status: string | null
  preparation: string | null
  outcome: string | null
  minutes_url: string | null
  gcal_event_id: string | null // للتكامل لاحقاً — لا تلمسه
  created_at: string | null
}

export interface CaseSessionInput {
  case_id: string
  title?: string | null
  session_date: string
  session_time?: string | null
  court?: string | null
  status?: string | null
  preparation?: string | null
}

/* ===== القضايا: الأحكام (rulings) ===== */

export interface Ruling {
  id: string
  case_id: string | null
  title: string | null
  ruling_number: string | null
  ruling_date: string | null
  court_name: string | null
  result: string | null
  summary: string | null
  document_url: string | null
  uploaded_by_name: string | null
  document_uploaded_at: string | null
  is_dropped: boolean | null
  drop_date: string | null
  drop_reason: string | null
  drop_document_url: string | null
  dropped_by_name: string | null
  drop_uploaded_at: string | null
  created_at: string | null
}

export interface RulingInput {
  case_id: string
  title?: string | null
  ruling_number?: string | null
  ruling_date?: string | null
  court_name?: string | null
  result?: string | null
  summary?: string | null
  document_url?: string | null
  uploaded_by_name?: string | null
}

/* ===== القضايا: المهام (tasks + task_subtasks) ===== */

export type TaskStatus = 'todo' | 'done'
export type TaskPriority = 'low' | 'med' | 'high'

export interface Subtask {
  id: string
  task_id: string | null
  title: string | null
  is_done: boolean | null
  created_at: string | null
}

export interface Task {
  id: string
  case_id: string | null
  title: string | null
  description: string | null
  notes: string | null
  assignee_id: string | null
  created_by: string | null
  priority: string | null
  status: string | null
  due_date: string | null
  done_at: string | null
  is_urgent: boolean | null
  task_type: string | null
  created_at: string | null
  subtasks?: Subtask[]
}

export interface TaskInput {
  case_id: string
  title: string
  description?: string | null
  assignee_id?: string | null
  created_by?: string | null
  priority?: string | null
  status?: string | null
  due_date?: string | null
  is_urgent?: boolean | null
  task_type?: string | null
}

/* ===== القضايا: المستندات (documents) ===== */

export interface CaseDocument {
  id: string
  case_id: string | null
  name: string | null
  file_url: string | null
  file_path: string | null
  file_type: string | null
  file_size: number | null
  document_date: string | null
  description: string | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
}

/* ===== القضايا: المذكرات (memos + memo_documents) ===== */

export interface MemoDocument {
  id: string
  memo_id: string | null
  name: string | null
  doc_type: string | null
  file_url: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
}

export interface Memo {
  id: string
  case_id: string | null
  title: string | null
  description: string | null
  memo_type: string | null
  party_side: string | null
  submit_method: string | null
  is_submitted: boolean | null
  submit_date: string | null
  created_at: string | null
  documents?: MemoDocument[]
}

export interface MemoInput {
  case_id: string
  title: string
  description?: string | null
  memo_type?: string | null
  party_side?: string | null
  submit_method?: string | null
  is_submitted?: boolean | null
  submit_date?: string | null
}

/* ===== القضايا: الملاحظات (notes) ===== */

export interface Note {
  id: string
  case_id: string | null
  author_id: string | null
  content: string | null
  created_at: string | null
  author?: { id: string; name: string | null; short_name: string | null } | null
}

/* ===================== الوكالات (powers_of_attorney) ===================== */

export type POAStatus = 'active' | 'expired' | 'cancelled'

export interface PowerOfAttorney {
  id: string
  poa_number: string | null
  poa_date: string | null
  expiry_date: string | null
  status: string | null
  client_id: string | null
  client_name: string | null
  agent_name: string | null
  document_url: string | null
  notes: string | null
  case_id: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  // علاقة القضية (FK موجود). لا embed لجهة الاتصال (لا FK) — نعتمد client_id/client_name.
  case?: { id: string; title: string | null; office_num: string | null } | null
}

export interface POAInput {
  poa_number?: string | null
  poa_date?: string | null
  expiry_date?: string | null
  status?: string | null
  client_id?: string | null
  client_name?: string | null
  agent_name?: string | null
  document_url?: string | null
  notes?: string | null
  case_id?: string | null
}

/* ===================== الخدمات القانونية (legal_services) ===================== */

export type LegalServiceType = 'consultation' | 'regulation' | 'contract'
export type LegalServiceStatus = 'draft' | 'in_progress' | 'delivered'

export interface LegalService {
  id: string
  type: string | null
  title: string | null
  client_id: string | null
  client_name: string | null
  service_date: string | null
  status: string | null
  service_kind: string | null
  regulation_type: string | null
  contract_type: string | null
  party_first: string | null
  party_second: string | null
  file_url: string | null
  file_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  received_date: string | null
  delivered_date: string | null
  received_at: string | null
  delivered_at: string | null
  notes: string | null
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  updated_at: string | null
  assignee?: { id: string; name: string | null; short_name: string | null } | null
}

export interface LegalServiceInput {
  type: string
  title?: string | null
  client_id?: string | null
  client_name?: string | null
  service_date?: string | null
  status?: string | null
  service_kind?: string | null
  regulation_type?: string | null
  contract_type?: string | null
  party_first?: string | null
  party_second?: string | null
  file_url?: string | null
  file_name?: string | null
  assignee_id?: string | null
  assignee_name?: string | null
  received_date?: string | null
  delivered_date?: string | null
  notes?: string | null
  created_by?: string | null
}

/* ===================== التوثيق العقاري (property_transfers) ===================== */

export interface PropertyTransfer {
  id: string
  transfer_type: string | null
  seller_id: string | null
  seller_name: string | null
  seller_id_num: string | null
  seller_phone: string | null
  buyer_id: string | null
  buyer_name: string | null
  buyer_id_num: string | null
  buyer_phone: string | null
  property_type: string | null
  deed_number: string | null
  area: number | null
  location: string | null
  property_notes: string | null
  amount: number | null
  amount_text: string | null
  transfer_date: string | null
  status: string | null
  notes: string | null
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PropertyTransferInput {
  transfer_type?: string | null
  seller_id?: string | null
  seller_name?: string | null
  seller_id_num?: string | null
  seller_phone?: string | null
  buyer_id?: string | null
  buyer_name?: string | null
  buyer_id_num?: string | null
  buyer_phone?: string | null
  property_type?: string | null
  deed_number?: string | null
  area?: number | null
  location?: string | null
  property_notes?: string | null
  amount?: number | null
  amount_text?: string | null
  transfer_date?: string | null
  status?: string | null
  notes?: string | null
  created_by?: string | null
}

export interface HatifCall {
  id: string
  status: number | null
  status_label: string | null
  direction: number | null
  direction_label: string | null
  caller_number: string | null
  callee_number: string | null
  contact_number: string | null
  pickup_time: string | null
  hangup_time: string | null
  call_length: string | null
  handler_name: string | null
  recording_url: string | null
  transcription_text: string | null
  summary: string | null
  sentiment: number | null
  sentiment_label: string | null
  client_id: string | null
  client_name: string | null
  created_at: string | null
}

/* ===================== طلبات التوظيف ===================== */

export type StaffApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface StaffApplication {
  id: string
  full_name: string | null
  date_of_birth: string | null
  id_number: string | null
  id_type: string | null // 'national' | 'iqama'
  marital_status: string | null
  phone: string | null
  email: string | null
  national_address: string | null
  cv_url: string | null
  cv_name: string | null
  lawyer_license_url: string | null
  lawyer_license_name: string | null
  qualification_doc_url: string | null
  qualification_doc_name: string | null
  qualifications: string | null
  bank_name: string | null
  bank_iban: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  status: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_team_member_id: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SmsConfig {
  userName: string
  apiKey: string
  sender: string
}
