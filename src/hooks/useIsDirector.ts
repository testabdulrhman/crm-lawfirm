import { useAuth } from '@/stores/auth'

// هل المستخدم الحالي مدير؟ (is_director). يُعاد استخدامه لأي إجراء حسّاس.
export function useIsDirector(): boolean {
  return useAuth((s) => s.teamMember?.is_director === true)
}

// يطّلع على كل شغل المكتب: المدير، أو من مُنح can_view_all (المساعد الإداري — 2026-10-06).
// للعرض والنطاق فقط («لوحة المكتب»، «مهام الفريق») — الإجراءات الحساسة تبقى على useIsDirector.
export function useCanViewOffice(): boolean {
  return useAuth((s) => s.teamMember?.is_director === true || (s.teamMember as { can_view_all?: boolean } | null)?.can_view_all === true)
}
