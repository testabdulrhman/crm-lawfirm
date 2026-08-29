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
  is_reviewer: boolean | null // حساب مراجعة أبل المعزول — يُستثنى من القوائم
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

// رسائل البريد (وارد/صادر عبر Gmail API)
export interface EmailMessage {
  id: string
  direction: string // incoming/outgoing
  gmail_id: string | null
  thread_id: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  snippet: string | null
  contact_id: string | null
  sent_by: string | null
  status: string // received/sent/failed
  error: string | null
  internal_date: string | null
  created_at: string | null
  case_id: string | null
  contact?: { id: string; name: string } | null
  case?: { id: string; title: string | null } | null
}

// قيود الرواتب/المكافآت/الخصومات لكل موظف
export interface PayrollEntry {
  id: string
  team_member_id: string
  entry_type: string // salary/bonus/allowance/deduction/other
  amount: number
  entry_date: string
  note: string | null
  file_url: string | null
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
}

export interface PayrollEntryInput {
  team_member_id: string
  entry_type: string
  amount: number
  entry_date: string
  note?: string | null
  file_url?: string | null
  created_by?: string | null
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
  location_url: string | null
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
  engagement_id: string | null
  created_at: string | null
  updated_at: string | null
  // علاقات (join)
  contact?: CaseContactRef | null
  assignee?: CaseAssigneeRef | null
  engagement?: {
    id: string
    title: string | null
    engagement_number: string | null
  } | null
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
  session_number: number | null
  session_date: string | null
  session_time: string | null
  court: string | null
  status: string | null
  preparation: string | null
  outcome: string | null
  minutes_url: string | null
  gcal_event_id: string | null // للتكامل لاحقاً — لا تلمسه
  created_at: string | null
  // دورة حياة الإغلاق (أعمدة جاهزة في الخادم)
  closed_at: string | null
  report_sent_at: string | null
  report_sent_via: string | null
  next_action: string | null
  next_session_id: string | null
  ruling_due_date: string | null
}

// نتيجة دالة close_session
export interface CloseSessionResult {
  session_id: string
  case_id: string
  new_session_id: string | null
  client_name: string | null
  client_phone: string | null
  case_title: string | null
}

// عنصر «جلسة تحتاج إغلاق» (sessions_need_closure)
export interface SessionNeedingClosure {
  id: string
  case_id: string
  case_title: string | null
  title: string | null
  session_date: string | null
  days_ago: number
}

export interface CaseSessionInput {
  case_id: string
  title?: string | null
  session_number?: number | null
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
  deleted_at?: string | null
  deleted_by?: string | null
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
  // دورة الاعتماد (غرفة عمل المهمة)
  submitted_at: string | null
  submitted_by: string | null
  review_by: string | null
  approved_at: string | null
  approved_by: string | null
  subtasks?: Subtask[]
}

/* ===== غرفة عمل المهمة: فريق + ملفات بنسخ + تعليقات + اعتماد ===== */

export interface TaskParticipant {
  id: string
  task_id: string
  member_id: string
  role: string // worker | watcher
  added_by: string | null
  created_at: string
  member?: {
    id: string
    name: string | null
    short_name: string | null
    avatar_color: string | null
    avatar_initial: string | null
  } | null
}

export interface TaskFile {
  id: string
  task_id: string
  version: number
  file_url: string
  file_name: string | null
  file_size: number | null
  note: string | null
  uploaded_by: string | null
  created_at: string
  uploader?: { id: string; name: string | null; short_name: string | null } | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  body: string
  mentions: string[]
  file_id: string | null
  created_at: string
  deleted_at: string | null
  author?: {
    id: string
    name: string | null
    short_name: string | null
    avatar_color: string | null
    avatar_initial: string | null
  } | null
}

export type TaskApprovalAction = 'submitted' | 'approved' | 'forwarded' | 'returned'

export interface TaskApproval {
  id: string
  task_id: string
  file_id: string | null
  action: TaskApprovalAction
  actor_id: string | null
  note: string | null
  forwarded_to: string | null
  created_at: string
  actor?: { id: string; name: string | null; short_name: string | null } | null
  forwardee?: { id: string; name: string | null; short_name: string | null } | null
}

export interface TaskInput {
  case_id?: string | null // اختيارية — تُسمح المهام الإدارية بلا قضية
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
  category: string | null // تصنيف الذكاء: حكم قضائي، وكالة، عقد…
  suggested_case_id: string | null // اقتراح الذكاء لملف مستندٍ رُفع بلا ملف
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

/* ===================== المواعيد (appointments) ===================== */

export type AppointmentStatus =
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: string
  client_id: string | null
  client_name: string | null
  client_phone: string | null
  appointment_date: string | null
  appointment_time: string | null
  duration_minutes: number | null
  notes: string | null
  status: string | null
  confirmation_sent_at: string | null
  thank_you_sent_at: string | null
  gcal_event_id: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  // حقول الحجز من الموقع (migration 20260808_booking_website_phase1)
  service_type: string | null
  meeting_method: string | null
  meeting_link: string | null
  meeting_link_sent_at: string | null
  client_email: string | null
  company_name: string | null
  source: string | null
  reference_no: string | null
  idempotency_key: string | null
  /** الجلسة التمهيدية تتبع سجل الاستفسار — المرحلة الأولى من دورة العمل */
  request_id: string | null
  client?: { id: string; name: string | null; phone: string | null } | null
}

export interface AppointmentInput {
  client_id?: string | null
  client_name?: string | null
  client_phone?: string | null
  appointment_date?: string | null
  appointment_time?: string | null
  duration_minutes?: number | null
  notes?: string | null
  status?: string | null
  /** حضوري onsite أو عن بُعد remote — الأخيرة تُفعّل قسم رابط الاجتماع */
  meeting_method?: string | null
  created_by?: string | null
  request_id?: string | null
}

/* ===================== العقود (engagements) ===================== */
// اتفاقية الأتعاب: نقطة البداية التجارية — العقد ← الموكّل ← المشاريع

export interface Engagement {
  id: string
  engagement_number: string | null
  title: string
  type: string | null
  client_id: string | null
  signed_date: string | null
  start_date: string | null
  end_date: string | null
  fees_total: number | null
  payment_terms: string | null
  scope: string | null
  notes: string | null
  status: string
  file_url: string | null
  // يستخرجها الذكاء الاصطناعي من ملف العقد (extract-contract)
  auto_renew: boolean | null
  notice_period_days: number | null
  extracted_at: string | null
  extract_summary: string | null
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  updated_at: string | null
  client?: { id: string; name: string | null; phone: string | null } | null
}

export interface EngagementInput {
  engagement_number?: string | null
  title: string
  type?: string | null
  client_id?: string | null
  signed_date?: string | null
  start_date?: string | null
  end_date?: string | null
  fees_total?: number | null
  payment_terms?: string | null
  scope?: string | null
  notes?: string | null
  status?: string
  file_url?: string | null
  auto_renew?: boolean | null
  notice_period_days?: number | null
  extracted_at?: string | null
  extract_summary?: string | null
  created_by?: string | null
}

/* ===================== الصادر (outgoing_letters) ===================== */

export interface OutgoingLetter {
  id: string
  letter_number: string | null
  subject: string | null
  letter_date: string | null
  recipient: string | null
  case_id: string | null
  notes: string | null
  file_url: string | null
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string | null
  case?: {
    id: string
    title: string | null
    office_num: string | null
    contact?: { name: string | null; phone: string | null } | null
  } | null
  approval?: OutgoingApproval | null
}

/* اعتماد الخطاب الصادر (توقيع/ختم المدير) */
export interface OutgoingApproval {
  id: string
  letter_id: string
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  // موضع الختم الذي اختاره الطالب: رقم الصفحة + مركز الختم (كسور 0..1 من أعلى يسار)
  stamp_page: number | null
  stamp_x: number | null
  stamp_y: number | null
  apply_mode: string | null // both / stamp / signature
  // تواقيع إضافية متعددة [{page,x,y}] — وsig2_* القديمة تُقرأ للتوافق
  extra_sigs: { page: number; x: number; y: number }[] | null
  sig2_page: number | null
  sig2_x: number | null
  sig2_y: number | null
  original_file_url: string | null
  signed_file_url: string | null
  requested_by: string | null
  requested_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string | null
  requester?: { id: string; name: string | null; phone: string | null } | null
  approver?: { id: string; name: string | null } | null
}

export interface OutgoingLetterInput {
  letter_number?: string | null
  subject?: string | null
  letter_date?: string | null
  recipient?: string | null
  case_id?: string | null
  notes?: string | null
  file_url?: string | null
  created_by?: string | null
}

/* ===================== التقارير (RPC) ===================== */

export interface NameValue {
  name: string
  value: number
}

export interface ReportsOverview {
  cases_total: number
  cases_active: number
  cases_suspended: number
  cases_closed: number
  cases_by_type: NameValue[] | null
  cases_by_month: { month: string; value: number }[] | null
  contacts_total: number
  contacts_by_category: NameValue[] | null
  upcoming_sessions: number
  open_tasks: number
  urgent_tasks: number
  active_poas: number
  expiring_poas: number
  upcoming_appointments: number
  legal_services: number
  pending_requests: number
  total_documents: number
}

export interface AssigneePerformance {
  assignee_name: string | null
  cases_count: number
  open_tasks: number
}

/* ===================== لوحة التحكم (dashboard_overview RPC) ===================== */

export interface DashboardStats {
  cases_total: number
  cases_active: number
  contacts: number
  staff_active: number
  open_tasks: number
  overdue_tasks: number
  upcoming_sessions: number
  upcoming_appointments: number
  pending_applications: number
  pending_requests: number
  expiring_poas: number
}

export interface DashSession {
  id: string
  case_id: string | null
  title: string | null
  session_date: string | null
  session_time: string | null
  court: string | null
  case_title: string | null
  office_num: string | null
}

export interface DashTask {
  id: string
  case_id: string | null
  title: string | null
  due_date: string | null
  priority: string | null
  is_urgent: boolean | null
  overdue: boolean | null
  case_title: string | null
}

export interface DashAppointment {
  id: string
  client_name: string | null
  appointment_date: string | null
  appointment_time: string | null
  status: string | null
}

export interface DashApplication {
  id: string
  full_name: string | null
  qualifications: string | null
  created_at: string | null
  has_cv: boolean | null
}

export interface DashRequest {
  id: string
  client_name: string | null
  request_type: string | null
  description: string | null
  created_at: string | null
}

export interface DashPOA {
  id: string
  poa_number: string | null
  client_name: string | null
  expiry_date: string | null
  days_left: number | null
}

export interface DashboardOverview {
  stats: DashboardStats
  upcoming_sessions: DashSession[] | null
  tasks: DashTask[] | null
  appointments: DashAppointment[] | null
  applications: DashApplication[] | null
  requests: DashRequest[] | null
  expiring_poas: DashPOA[] | null
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
