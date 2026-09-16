import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase, DOCS_BUCKET } from '@/lib/supabase'
import { uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

// نقاشات الويب — نفس دوال القاعدة التي يقرأها تطبيق SwiftUI حرفياً
// (case_discussions / case_stream / case_thread / my_bookmarks).
// caseId فارغ = القناة العامة «عام — المكتب».

export interface DiscussionRow {
  case_id: string | null
  case_title: string | null
  office_num: string | null
  last_body: string | null
  last_at: string | null
  last_author: string | null
  has_file: boolean | null
  unread: number | null
  kind: string | null // case | legal_service | property — وجهة زر «فتح الملف»
}

export interface Reaction {
  e: string
  n: number
  me: boolean
}

export interface StreamMsg {
  id: string
  author_id: string | null
  author_name: string | null
  body: string | null
  kind: string | null // user | ai | system
  document_id: string | null
  document_name: string | null
  document_url: string | null
  mentions: string[] | null
  created_at: string | null
  edited_at: string | null
  reply_count: number | null
  last_reply_at: string | null
  reactions: Reaction[] | null
  bookmarked: boolean | null
}

export interface ThreadMsg {
  id: string
  author_id: string | null
  author_name: string | null
  avatar_initial: string | null
  avatar_color: string | null
  body: string | null
  kind: string | null
  document_id: string | null
  document_name: string | null
  document_url: string | null
  created_at: string | null
  edited_at: string | null
  reactions: Reaction[] | null
  bookmarked: boolean | null
}

export interface BookmarkRow {
  comment_id: string
  case_id: string | null
  case_title: string | null
  body: string | null
  kind: string | null
  author_name: string | null
  created_at: string | null
  saved_at: string | null
}

const invalidate = (qc: ReturnType<typeof useQueryClient>, caseId: string | null) => {
  qc.invalidateQueries({ queryKey: ['discussions'] })
  qc.invalidateQueries({ queryKey: ['disc_stream', caseId] })
  qc.invalidateQueries({ queryKey: ['disc_thread'] })
  qc.invalidateQueries({ queryKey: ['disc_media'] })
}

/** رسالة فيها مرفق أو رابط — لنافذة «الملفات والروابط» */
export interface MediaMsg {
  id: string
  case_id: string | null
  parent_id: string | null
  author_id: string | null
  body: string | null
  kind: string | null
  created_at: string
  document: {
    id: string
    name: string | null
    file_url: string | null
    file_type: string | null
    file_size: number | null
  } | null
}

/**
 * رسائل فيها مرفق أو رابط — المجرى والخيوط معاً، الأحدث أولاً.
 * all = كل ما يراه الموظف من نقاشات (الصلاحيات تحصره)، وإلا النقاش المعطى وحده (null = العامة).
 */
export function useDiscussionMedia(caseId: string | null, all: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['disc_media', all ? 'all' : caseId],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MediaMsg[]> => {
      const base = supabase
        .from('case_comments')
        .select(
          'id, case_id, parent_id, author_id, body, kind, created_at, document:documents!case_comments_document_id_fkey(id, name, file_url, file_type, file_size)'
        )
        .is('deleted_at', null)
        .or('document_id.not.is.null,body.ilike.*http*,body.ilike.*www.*')
      const scoped = all ? base : caseId ? base.eq('case_id', caseId) : base.is('case_id', null)
      const { data, error } = await scoped.order('created_at', { ascending: false }).limit(all ? 500 : 300)
      if (error) throw error
      return (data ?? []) as unknown as MediaMsg[]
    },
  })
}

/**
 * مجموع الرسائل غير المقروءة عبر كل النقاشات — شارة «النقاشات» في الشريط.
 *
 * يشارك نفس مفتاح الاستعلام والتحديث الدوري، فلا نداء إضافي على الخادم.
 * والحساب في القاعدة (case_discussions) لكل موظف بحسابه: رسائله هو لا تُعدّ
 * عليه، وما بعد آخر فتحٍ للقناة فقط.
 */
export function useUnreadDiscussionsCount() {
  return useQuery({
    queryKey: ['discussions'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<DiscussionRow[]> => {
      const { data, error } = await supabase.rpc('case_discussions')
      if (error) throw error
      return (data ?? []) as DiscussionRow[]
    },
    select: (rows) => rows.reduce((n, r) => n + Number(r.unread ?? 0), 0),
  })
}

export function useDiscussions() {
  return useQuery({
    queryKey: ['discussions'],
    refetchInterval: 30_000, // رسائل الزملاء تصل دون Realtime
    queryFn: async (): Promise<DiscussionRow[]> => {
      const { data, error } = await supabase.rpc('case_discussions')
      if (error) throw error
      return (data ?? []) as DiscussionRow[]
    },
  })
}

export function useStream(caseId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['disc_stream', caseId],
    enabled,
    refetchInterval: 15_000, // يلتقط ردود الذكاء والزملاء
    queryFn: async (): Promise<StreamMsg[]> => {
      const { data, error } = await supabase.rpc('case_stream', { p_case_id: caseId })
      if (error) throw error
      return (data ?? []) as StreamMsg[]
    },
  })
}

export function useThread(rootId: string | null) {
  return useQuery({
    queryKey: ['disc_thread', rootId],
    enabled: !!rootId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<ThreadMsg[]> => {
      const { data, error } = await supabase.rpc('case_thread', { p_root: rootId })
      if (error) throw error
      return (data ?? []) as ThreadMsg[]
    },
  })
}

/**
 * الرسالة التي كُتب لها إشعار منشن. الإشعار يُدرج بمشغّل (notify_mentions) داخل معاملة
 * الرسالة نفسها، فوقته = created_at الرسالة حرفياً. null إن حُذفت أو لم تعد مرئية.
 */
export async function findMessageAt(
  caseId: string | null,
  at: string
): Promise<{ id: string; parent_id: string | null } | null> {
  const base = supabase
    .from('case_comments')
    .select('id, parent_id')
    .eq('created_at', at)
    .is('deleted_at', null)
  const { data, error } = await (caseId ? base.eq('case_id', caseId) : base.is('case_id', null)).limit(1)
  if (error) throw error
  return (data?.[0] as { id: string; parent_id: string | null } | undefined) ?? null
}

/** معرّف رسالة من المتصفح — وفي سياق غير آمن (بلا crypto.randomUUID) تولّده القاعدة */
export const newMessageId = (): string | undefined =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined

export function useBookmarks(enabled: boolean) {
  return useQuery({
    queryKey: ['disc_bookmarks'],
    enabled,
    queryFn: async (): Promise<BookmarkRow[]> => {
      const { data, error } = await supabase.rpc('my_bookmarks')
      if (error) throw error
      return (data ?? []) as BookmarkRow[]
    },
  })
}

/** فتح القناة = قراءة — يصفّر عدّادها. upsert على (case_id, member_id). */
export function useMarkRead() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (caseId: string | null) => {
      if (!teamMember?.id) return
      const { error } = await supabase.from('case_reads').upsert(
        {
          case_id: caseId,
          member_id: teamMember.id,
          read_at: new Date().toISOString(),
        },
        { onConflict: 'case_id,member_id' }
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussions'] }),
  })
}

export function usePostMessage() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      /**
       * معرّف يولّده المُرسل (newMessageId) ويُعاد مع إعادة إرسال النص نفسه بعد فشل —
       * فإن كانت المحاولة الأولى قد حُفظت وانقطع ردّها لا تتكرر الرسالة ولا إشعارها
       */
      id?: string
      caseId: string | null
      body?: string | null
      documentId?: string | null
      parentId?: string | null
      alsoToStream?: boolean
      /** معرّفات الموظفين المذكورين بـ@ — القاعدة تُشعرهم (notify_mentions) */
      mentions?: string[]
    }) => {
      if (!teamMember?.id) throw new Error('لم يُحمَّل ملفك بعد — أعد تحميل الصفحة')
      const values: Record<string, unknown> = {
        case_id: input.caseId,
        author_id: teamMember.id,
      }
      if (input.body) values.body = input.body
      if (input.mentions?.length) values.mentions = input.mentions
      if (input.documentId) values.document_id = input.documentId
      if (input.id) values.id = input.id
      if (input.parentId) {
        values.parent_id = input.parentId
        values.also_to_stream = input.alsoToStream ?? false
      }
      const { error } = await supabase.from('case_comments').insert(values)
      if (error) {
        // المعرّف موجود = المحاولة الأولى حُفظت فعلاً وانقطع ردّها: نجاح لا نسخة ثانية
        if (
          input.id &&
          error.code === '23505' &&
          (error.message ?? '').includes('case_comments_pkey')
        )
          return
        throw error
      }
    },
    // عرض متفائل: الرسالة تظهر فوراً (نمط الواتساب) والخادم يلحق بالخلفية —
    // كان الإحساس بالبطء لأنها لا تظهر إلا بعد الإدراج + إعادة الجلب كاملة
    onMutate: async (input) => {
      const now = new Date().toISOString()
      const temp = 'temp-' + Math.random().toString(36).slice(2)
      if (input.parentId) {
        // ردّ في خيط
        await qc.cancelQueries({ queryKey: ['disc_thread', input.parentId] })
        const prev = qc.getQueryData<ThreadMsg[]>(['disc_thread', input.parentId])
        const optimistic: ThreadMsg = {
          id: temp,
          author_id: teamMember?.id ?? null,
          author_name: teamMember?.short_name ?? teamMember?.name ?? null,
          avatar_initial: teamMember?.avatar_initial ?? null,
          avatar_color: teamMember?.avatar_color ?? null,
          body: input.body ?? null,
          kind: 'user',
          document_id: null,
          document_name: null,
          document_url: null,
          created_at: now,
          // حقول الرسالة الكاملة — الرسالة المتفائلة لم تُعدَّل ولا تفاعل عليها بعد
          edited_at: null,
          reactions: null,
          bookmarked: false,
        }
        qc.setQueryData<ThreadMsg[]>(['disc_thread', input.parentId], (old) => [
          ...(old ?? []),
          optimistic,
        ])
        return { prev, key: ['disc_thread', input.parentId] as const }
      }
      await qc.cancelQueries({ queryKey: ['disc_stream', input.caseId] })
      const prev = qc.getQueryData<StreamMsg[]>(['disc_stream', input.caseId])
      const optimistic: StreamMsg = {
        id: temp,
        author_id: teamMember?.id ?? null,
        author_name: teamMember?.short_name ?? teamMember?.name ?? null,
        body: input.body ?? null,
        kind: 'user',
        document_id: null,
        document_name: null,
        document_url: null,
        mentions: input.mentions ?? null,
        created_at: now,
        edited_at: null,
        reply_count: 0,
        last_reply_at: null,
        reactions: [],
        bookmarked: false,
      }
      qc.setQueryData<StreamMsg[]>(['disc_stream', input.caseId], (old) => [
        ...(old ?? []),
        optimistic,
      ])
      return { prev, key: ['disc_stream', input.caseId] as const }
    },
    onError: (e, _vars, ctx) => {
      // تراجع: أعد المجرى كما كان قبل الرسالة المتفائلة
      if (ctx) qc.setQueryData(ctx.key as unknown as readonly unknown[], ctx.prev)
      toast({ variant: 'destructive', title: 'تعذّر الإرسال', description: errMessage(e) })
    },
    // التسوية بعد النجاح أو الفشل: الجلب الحقيقي يستبدل المؤقت بمعرّفه الفعلي
    onSettled: (_d, _e, vars) => invalidate(qc, vars.caseId),
  })
}

/**
 * مرفق النقاش: رفع للتخزين ← صف documents (المرفق هو مستند الملف نفسه)
 * ← رسالة تشير إليه. للعامة: case_id فارغ.
 */
export function usePostAttachment() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      caseId: string | null
      file: File
      caption?: string
      mentions?: string[]
    }) => {
      if (!teamMember?.id) throw new Error('لم يُحمَّل ملفك بعد — أعد تحميل الصفحة')
      const folder = input.caseId
        ? `case_documents/${input.caseId}/`
        : 'discussion_general/'
      const { publicUrl, path } = await uploadFile(input.file, {
        folder,
        bucket: DOCS_BUCKET,
      })
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          case_id: input.caseId,
          name: input.file.name,
          file_url: publicUrl,
          file_path: path,
          file_type: input.file.type || null,
          file_size: input.file.size,
          uploaded_by_name: teamMember.name ?? null,
          description: 'أُرسل في النقاش',
        })
        .select('id')
        .single()
      if (docErr) throw docErr

      const { error } = await supabase.from('case_comments').insert({
        case_id: input.caseId,
        author_id: teamMember.id,
        body: input.caption || null,
        document_id: doc.id,
        ...(input.mentions?.length ? { mentions: input.mentions } : {}),
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.caseId)
      toast({ variant: 'success', title: 'أُرسل المرفق وحُفظ في المستندات' })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر إرسال المرفق', description: errMessage(e) }),
  })
}

export function useToggleReaction() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: { commentId: string; emoji: string; mine: boolean; caseId: string | null }) => {
      if (!teamMember?.id) return
      if (input.mine) {
        const { error } = await supabase
          .from('case_comment_reactions')
          .delete()
          .eq('comment_id', input.commentId)
          .eq('member_id', teamMember.id)
          .eq('emoji', input.emoji)
        if (error) throw error
      } else {
        const { error } = await supabase.from('case_comment_reactions').insert({
          comment_id: input.commentId,
          member_id: teamMember.id,
          emoji: input.emoji,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.caseId),
  })
}

export function useToggleBookmark() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: { commentId: string; on: boolean; caseId: string | null }) => {
      if (!teamMember?.id) return
      if (input.on) {
        const { error } = await supabase
          .from('case_comment_bookmarks')
          .delete()
          .eq('comment_id', input.commentId)
          .eq('member_id', teamMember.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('case_comment_bookmarks').insert({
          comment_id: input.commentId,
          member_id: teamMember.id,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.caseId)
      qc.invalidateQueries({ queryKey: ['disc_bookmarks'] })
    },
  })
}

export function useEditMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; body: string; caseId: string | null }) => {
      const { error } = await supabase
        .from('case_comments')
        .update({ body: input.body, edited_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.caseId),
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر التعديل', description: errMessage(e) }),
  })
}

export function useDeleteMessage() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: { id: string; caseId: string | null }) => {
      const { error } = await supabase
        .from('case_comments')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: teamMember?.name ?? null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.caseId),
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر الحذف', description: errMessage(e) }),
  })
}

/* ===== عضوية القنوات الخاصة (kind='channel') ===== */

export interface ChannelMember {
  member_id: string
  member: { id: string; name: string | null; short_name: string | null } | null
}

export function useChannelMembers(channelId: string | null) {
  return useQuery({
    queryKey: ['channel-members', channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<ChannelMember[]> => {
      const { data, error } = await supabase
        .from('channel_members')
        .select('member_id, member:team_members(id, name, short_name)')
        .eq('channel_id', channelId!)
      if (error) throw error
      return (data ?? []) as unknown as ChannelMember[]
    },
  })
}

/** إضافة/إزالة عضو — للمدير فقط (السياسات تفرض ذلك في القاعدة أيضاً) */
export function useToggleChannelMember(channelId: string | null) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: { memberId: string; add: boolean }) => {
      if (!channelId) return
      if (input.add) {
        const { error } = await supabase.from('channel_members').insert({
          channel_id: channelId,
          member_id: input.memberId,
          added_by: teamMember?.id ?? null,
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('channel_members')
          .delete()
          .eq('channel_id', channelId)
          .eq('member_id', input.memberId)
        if (error) throw error
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['channel-members', channelId] }),
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر تعديل أعضاء القناة',
        description: errMessage(e),
      }),
  })
}

/**
 * نقاش جديد مُسمّى بأعضاء (طلب المدير 2026-09-13) — ذرّي في القاعدة: الصف + الأعضاء
 * + رسالة «أنشأ… وأضاف…» التي تُظهره في القائمة فوراً. للمدير فقط، والإشعار
 * لكل مضاف يصدر من القاعدة (ترقر channel_member_added_notify).
 */
export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; memberIds: string[] }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_channel', {
        p_title: input.title,
        p_member_ids: input.memberIds,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discussions'] }),
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر إنشاء النقاش', description: errMessage(e) }),
  })
}

/** تغيير اسم نقاش مُسمّى — للمدير (بوابة channels_update_gate) */
export function useRenameChannel(channelId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (title: string) => {
      if (!channelId) return
      const { error } = await supabase
        .from('cases')
        .update({ title })
        .eq('id', channelId)
        .eq('kind', 'channel')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discussions'] })
      toast({ variant: 'success', title: 'تم تغيير اسم النقاش' })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر تغيير الاسم', description: errMessage(e) }),
  })
}

/* ===== إيصالات القراءة (مثل الواتساب) =====
 * «قرأها» = فتح النقاش بعد إرسالها. case_reads يحجب صفوف الآخرين، فالحساب بدالتين في
 * القاعدة تُرجعان للمُرسل وحده ما يخصّ رسائله. */

export interface ReadCount {
  comment_id: string
  readers: number
  pending: number
}

export interface ReadPerson {
  member_id: string
  name: string | null
  short_name: string | null
  avatar_initial: string | null
  avatar_color: string | null
  avatar_url: string | null
  read_at?: string | null
}

export interface ReadReceipts {
  readers: ReadPerson[]
  not_read: ReadPerson[]
}

/** علامات رسائلي في مجرى نقاش */
export function useStreamReadCounts(caseId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['disc_read_counts', caseId],
    enabled,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Record<string, ReadCount>> => {
      const { data, error } = await supabase.rpc('stream_read_counts', { p_case_id: caseId })
      if (error) throw error
      return Object.fromEntries(((data ?? []) as ReadCount[]).map((r) => [r.comment_id, r]))
    },
  })
}

/** من قرأ رسالتي ومن لم يقرأها — لمُرسلها وحده */
export function useReadReceipts(commentId: string | null) {
  return useQuery({
    queryKey: ['disc_read_receipts', commentId],
    enabled: !!commentId,
    queryFn: async (): Promise<ReadReceipts> => {
      const { data, error } = await supabase.rpc('message_read_receipts', { p_comment_id: commentId })
      if (error) throw error
      return data as ReadReceipts
    },
  })
}
