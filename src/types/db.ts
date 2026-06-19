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

/* جهة اتصال (مختصرة — للربط في نموذج الطلب) */
export interface Contact {
  id: string
  name: string
  phone: string | null
  type: string | null
}
