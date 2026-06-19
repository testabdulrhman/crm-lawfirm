import { useAuth } from '@/stores/auth'

// هل المستخدم الحالي مدير؟ (is_director). يُعاد استخدامه لأي إجراء حسّاس.
export function useIsDirector(): boolean {
  return useAuth((s) => s.teamMember?.is_director === true)
}
