import { supabase } from '@/lib/supabase'

/**
 * الأعمدة العامة — ما يراه كل زميل (قرار المدير 2026-11-22: «ليه الموظفين ... تطلع للكل؟»).
 * الهوية والآيبان والعنوان وجهة الطوارئ والمرفقات وسبب الانتهاء لا تُطلب من الجدول: تأتي من
 * team_member_private للمدير (الكل) ولصاحبها (نفسه) وتُدمج في الصف نفسه، فلا تتغيّر الشاشات.
 */
export const TEAM_PUBLIC_COLUMNS =
  'id, name, short_name, role, email, phone, is_director, avatar_color, avatar_initial, auth_id, created_at, ' +
  'is_active, avatar_url, birth_date, join_date, auth_uid, date_of_birth, qualifications, is_reviewer, ' +
  'member_type, can_view_all, end_date'

/** يدمج الحقول الحساسة لمن يحق له رؤيتها (الدالة تُرجع للموظف صفّه وحده، وللمدير الكل) */
export async function withPrivate<T extends { id: string }>(rows: T[], id?: string): Promise<T[]> {
  const { data, error } = await supabase.rpc('team_member_private', id ? { p_id: id } : {})
  if (error || !data?.length) return rows
  const byId = new Map((data as { id: string }[]).map((p) => [p.id, p]))
  return rows.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r))
}
