// نطاق من يكلّم الذكاء (فحص 2026-10-19): الأدوات تعمل بمفتاح الخادم، فلا بد أن تقيّد نفسها بما يراه الموظف
// نفسه — وإلا طلب تفاصيل ملف لا يراه، أو بحث في محادثات زملائه الخاصة، فأُعطي. النطاق من member_case_scope
// في القاعدة: نفس دوال RLS التي تحكم شاشاته.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AiScope {
  memberId: string;
  director: boolean;
  viewer: boolean; // المدير أو «يرى الكل»
  collaborator: boolean;
  reviewer: boolean;
  caseIds: Set<string>;
  blockedDm: Set<string>;
  blockedCh: Set<string>;
}

export async function loadScope(admin: SupabaseClient, memberId: string | null | undefined): Promise<AiScope | null> {
  if (!memberId) return null;
  const { data, error } = await admin.rpc("member_case_scope", { p_member: memberId });
  if (error || !data?.ok) return null;
  return {
    memberId,
    director: !!data.director,
    viewer: !!data.viewer,
    collaborator: !!data.collaborator,
    reviewer: !!data.reviewer,
    caseIds: new Set<string>(data.case_ids ?? []),
    blockedDm: new Set<string>(data.blocked_dm ?? []),
    blockedCh: new Set<string>(data.blocked_channels ?? []),
  };
}

/** موظف المكتب (لا متعاون خارجي ولا حساب مراجعة) — شرط الأدوات العامة: العملاء والمواعيد والرسائل والنقاش العام */
export const isOfficeStaff = (s: AiScope) => !s.collaborator && !s.reviewer;

/** هل يرى هذا الملف؟ بلا ملف (null) = النقاش العام/عناصر المكتب: لموظفي المكتب وحدهم */
export function canSeeCase(
  s: AiScope,
  c: { id: string; kind?: string | null; office_num?: string | null } | null | undefined,
): boolean {
  if (!c?.id) return isOfficeStaff(s);
  if (s.reviewer && !String(c.office_num ?? "").startsWith("DEMO")) return false;
  if (c.kind === "dm" && s.blockedDm.has(c.id)) return false;
  if (c.kind === "channel" && s.blockedCh.has(c.id)) return false;
  return s.viewer || s.caseIds.has(c.id);
}

export const outOfScope = (what = "هذا الملف") =>
  JSON.stringify({ error: `لا صلاحية لك على ${what} — الذكاء يعمل بصلاحياتك نفسها` });
