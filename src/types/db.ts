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
