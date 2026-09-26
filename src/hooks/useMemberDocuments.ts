// مرفقات الموظف (2026-09-26): الهوية والبكالوريوس وغيرهما في مخزن خاص (staff-docs)
// تحت مجلد الموظف، وتُفتح بروابط موقّتة. الصورة الشخصية = avatar_url نفسها.
// الصلاحية في القاعدة: المدير لكل موظف، والموظف لنفسه فقط.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'

export const STAFF_DOCS_BUCKET = 'staff-docs'

export type MemberDocType = 'national_id' | 'degree' | 'cv' | 'license' | 'contract' | 'other'

export const MEMBER_DOC_LABELS: Record<MemberDocType, string> = {
  national_id: 'الهوية الوطنية',
  degree: 'وثيقة البكالوريوس',
  cv: 'السيرة الذاتية',
  license: 'الترخيص',
  contract: 'عقد العمل',
  other: 'مرفق آخر',
}

export interface MemberDocument {
  id: string
  member_id: string
  doc_type: MemberDocType
  file_path: string
  file_name: string | null
  mime: string | null
  size_bytes: number | null
  note: string | null
  uploaded_by: string | null
  created_at: string
}

const KEY = 'member_documents'

export function useMemberDocuments(memberId: string | null | undefined) {
  return useQuery({
    queryKey: [KEY, memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<MemberDocument[]> => {
      const { data, error } = await supabase
        .from('member_documents')
        .select('*')
        .eq('member_id', memberId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as MemberDocument[]
    },
  })
}

/** رابط موقّت (١٠ دقائق) — المخزن خاص فلا رابط دائماً */
export async function memberDocUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STAFF_DOCS_BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

export function useUploadMemberDoc() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id ?? null)
  return useMutation({
    mutationFn: async (v: { memberId: string; docType: MemberDocType; file: File }) => {
      const ext = (v.file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${v.memberId}/${v.docType}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(STAFF_DOCS_BUCKET)
        .upload(path, v.file, { upsert: false, contentType: v.file.type || undefined })
      if (upErr) throw upErr
      const { error } = await supabase.from('member_documents').insert({
        member_id: v.memberId,
        doc_type: v.docType,
        file_path: path,
        file_name: v.file.name,
        mime: v.file.type || null,
        size_bytes: v.file.size,
        uploaded_by: myId,
      })
      if (error) {
        // لا ملف يتيم في المخزن بلا سجلّه
        await supabase.storage.from(STAFF_DOCS_BUCKET).remove([path])
        throw error
      }
    },
    onSuccess: (_d, v) => {
      toast({ title: `رُفع ${MEMBER_DOC_LABELS[v.docType]}` })
      return qc.invalidateQueries({ queryKey: [KEY, v.memberId] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر رفع المرفق', description: errMessage(e) }),
  })
}

export function useDeleteMemberDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: MemberDocument) => {
      const { error } = await supabase.from('member_documents').delete().eq('id', d.id)
      if (error) throw error
      await supabase.storage.from(STAFF_DOCS_BUCKET).remove([d.file_path])
    },
    onSuccess: (_d, doc) => {
      toast({ title: 'حُذف المرفق' })
      return qc.invalidateQueries({ queryKey: [KEY, doc.member_id] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر حذف المرفق', description: errMessage(e) }),
  })
}

/** الصورة الشخصية: تُرفع لمخزن الصور وتصير صورة الموظف في النظام كله */
export function useUpdateMemberPhoto() {
  const qc = useQueryClient()
  const me = useAuth((s) => s.teamMember)
  const fetchTeamMember = useAuth((s) => s.fetchTeamMember)
  const user = useAuth((s) => s.user)
  return useMutation({
    mutationFn: async (v: { memberId: string; file: File }) => {
      const { publicUrl } = await uploadFile(v.file, { bucket: 'avatars', folder: `team/${v.memberId}` })
      const { data, error } = await supabase
        .from('team_members')
        .update({ avatar_url: publicUrl })
        .eq('id', v.memberId)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('لا صلاحية لتعديل صورة هذا الموظف')
    },
    onSuccess: async (_d, v) => {
      toast({ title: 'حُدّثت الصورة الشخصية' })
      if (me?.id === v.memberId && user) await fetchTeamMember(user.id)
      return qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر رفع الصورة', description: errMessage(e) }),
  })
}
