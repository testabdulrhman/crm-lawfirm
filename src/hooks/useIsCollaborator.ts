import { useAuth } from '@/stores/auth'

/**
 * متعاون خارجي؟ — يرى ملفاته ومهامه فقط، ولا يرى المكتب.
 *
 * ⚠️ هذا الخطاف **تجميلي**: يقلّص الشريط ويحرس المسارات كي لا يرى المتعاون
 *    صفحات فارغة. الحاجز الحقيقي سياسات RLS على الخادم — لا تعتمد عليه أمنياً.
 */
export function useIsCollaborator(): boolean {
  return useAuth((s) => s.teamMember?.member_type === 'collaborator')
}
