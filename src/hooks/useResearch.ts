// «الباحث» (طلب المدير 2026-10-16): محادثات محفوظة يجيب فيها الذكاء من الإنترنت والأنظمة وبيانات المكتب
// ومن مصادر يضيفها الموظف (ملف / رابط / نص). المصادر خاصة بصاحبها، ويشاركها مع «مكتبة المكتب» إن أراد.
// الكتابة في الرسائل من دالة research وحدها؛ والمتصفح يقرأ ويبثّ.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'

export interface ResearchChat {
  id: string
  title: string | null
  updated_at: string
}

export interface ResearchCitation {
  kind: 'web' | 'source'
  title: string
  url?: string
  source_id?: string
  quote?: string
}

export interface ResearchMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: ResearchCitation[]
  tools: string[]
  created_at: string
}

export interface ResearchSource {
  id: string
  owner_id: string
  kind: 'file' | 'url' | 'text'
  title: string
  file_url: string | null
  url: string | null
  mime: string | null
  size: number | null
  status: 'pending' | 'ready' | 'failed'
  error: string | null
  shared: boolean
  created_at: string
}

const SRC_COLS = 'id, owner_id, kind, title, file_url, url, mime, size, status, error, shared, created_at'
const KEY = 'research'

export function useResearchChats() {
  const myId = useAuth((s) => s.teamMember?.id)
  return useQuery({
    queryKey: [KEY, 'chats', myId],
    enabled: !!myId,
    queryFn: async (): Promise<ResearchChat[]> => {
      const { data, error } = await supabase.from('research_chats').select('id, title, updated_at')
        .is('deleted_at', null).order('updated_at', { ascending: false }).limit(200)
      if (error) throw error
      return (data ?? []) as ResearchChat[]
    },
  })
}

export function useResearchMessages(chatId: string | null) {
  return useQuery({
    queryKey: [KEY, 'messages', chatId],
    enabled: !!chatId,
    queryFn: async (): Promise<ResearchMessage[]> => {
      const { data, error } = await supabase.from('research_messages')
        .select('id, role, content, citations, tools, created_at').eq('chat_id', chatId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ResearchMessage[]
    },
  })
}

/** مصادر المحادثة المفعّلة */
export function useChatSources(chatId: string | null) {
  return useQuery({
    queryKey: [KEY, 'chat_sources', chatId],
    enabled: !!chatId,
    refetchInterval: (q) =>
      ((q.state.data as ResearchSource[] | undefined) ?? []).some((s) => s.status === 'pending') ? 2500 : false,
    queryFn: async (): Promise<ResearchSource[]> => {
      const { data, error } = await supabase.from('research_chat_sources')
        .select(`source:research_sources(${SRC_COLS}, deleted_at)`).eq('chat_id', chatId!)
      if (error) throw error
      return ((data ?? []) as unknown as { source: (ResearchSource & { deleted_at: string | null }) | null }[])
        .map((r) => r.source).filter((s): s is ResearchSource & { deleted_at: string | null } => !!s && !s.deleted_at)
    },
  })
}

/** مكتبتي ومكتبة المكتب (المشتركة من غيري) */
export function useSourceLibrary() {
  const myId = useAuth((s) => s.teamMember?.id)
  return useQuery({
    queryKey: [KEY, 'library', myId],
    enabled: !!myId,
    refetchInterval: (q) =>
      ((q.state.data as { mine: ResearchSource[] } | undefined)?.mine ?? []).some((s) => s.status === 'pending') ? 2500 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from('research_sources').select(SRC_COLS)
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      const all = (data ?? []) as ResearchSource[]
      return { mine: all.filter((s) => s.owner_id === myId), office: all.filter((s) => s.owner_id !== myId && s.shared) }
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] })
}

export type NewSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string }
  | { kind: 'text'; title: string; text: string }

/** إضافة مصدر: رفع الملف أو حفظ الرابط/النص، ثم ربطه بالمحادثة (إن وُجدت)، ثم تجهيزه في الخادم */
export function useAddSource() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id)
  return useMutation({
    mutationFn: async ({ source, chatId }: { source: NewSource; chatId: string | null }): Promise<ResearchSource> => {
      if (!myId) throw new Error('لا جلسة')
      let row: Record<string, unknown>
      if (source.kind === 'file') {
        const { publicUrl } = await uploadFile(source.file, { folder: `research/${myId}` })
        row = { kind: 'file', title: source.file.name, file_url: publicUrl, mime: source.file.type || null, size: source.file.size, status: 'pending' }
      } else if (source.kind === 'url') {
        const url = source.url.trim()
        if (!/^https?:\/\//i.test(url)) throw new Error('الرابط يبدأ بـ http:// أو https://')
        row = { kind: 'url', title: url, url, status: 'pending' }
      } else {
        const text = source.text.trim()
        if (!text) throw new Error('الصق النص أولاً')
        row = { kind: 'text', title: source.title.trim() || text.slice(0, 60), extracted_text: text, size: text.length, status: 'ready' }
      }
      const { data, error } = await supabase.from('research_sources').insert({ ...row, owner_id: myId }).select(SRC_COLS).single()
      if (error) throw error
      const src = data as ResearchSource
      if (chatId) {
        const { error: lErr } = await supabase.from('research_chat_sources').insert({ chat_id: chatId, source_id: src.id })
        if (lErr) throw lErr
      }
      invalidate(qc)
      if (src.status === 'pending') {
        await supabase.functions.invoke('research-source', { body: { source_id: src.id }, region: FunctionRegion.EuWest1 })
      }
      return src
    },
    onSettled: () => invalidate(qc),
  })
}

export function useToggleChatSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ chatId, sourceId, on }: { chatId: string; sourceId: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from('research_chat_sources').insert({ chat_id: chatId, source_id: sourceId })
        : await supabase.from('research_chat_sources').delete().eq('chat_id', chatId).eq('source_id', sourceId)
      if (error && !String(error.message).includes('duplicate')) throw error
    },
    onSettled: () => invalidate(qc),
  })
}

export function useUpdateSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<ResearchSource, 'shared' | 'title'>> & { deleted_at?: string } }) => {
      const { error } = await supabase.from('research_sources').update(patch).eq('id', id)
      if (error) throw error
    },
    onSettled: () => invalidate(qc),
  })
}

export function useDeleteChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('research_chats').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSettled: () => invalidate(qc),
  })
}

/** إنشاء محادثة فارغة — لإضافة مصادر قبل أول سؤال */
export function useCreateChat() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id)
  return useMutation({
    mutationFn: async (title: string): Promise<string> => {
      const { data, error } = await supabase.from('research_chats').insert({ owner_id: myId, title }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSettled: () => invalidate(qc),
  })
}

// ===== البث =====

export interface StreamHandlers {
  onMeta?: (chatId: string) => void
  onStatus?: (text: string) => void
  onDelta?: (text: string) => void
}

/**
 * سؤالٌ للباحث بثّاً (SSE). تُشغَّل الدالة في أيرلندا بجوار القاعدة (x-region — ومسموحة في CORS).
 * يُرجع ما حُفظ: المحادثة ورسالة الإجابة وإحالاتها.
 */
export async function askResearch(
  params: { chatId: string | null; message: string },
  h: StreamHandlers,
  signal?: AbortSignal
): Promise<{ chatId: string; messageId: string | null; citations: ResearchCitation[] }> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) throw new Error('انتهت الجلسة — سجّل الدخول من جديد')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research?forceFunctionRegion=eu-west-1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      'Content-Type': 'application/json',
      'x-region': 'eu-west-1',
    },
    body: JSON.stringify({ chat_id: params.chatId, message: params.message }),
    signal,
  })
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => null)
    throw new Error(b?.error || `تعذّر الوصول للباحث (${res.status})`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let chatId = params.chatId ?? ''
  let result: { messageId: string | null; citations: ResearchCitation[] } | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const ev = chunk.match(/^event: (.+)$/m)?.[1]
      const dataLine = chunk.match(/^data: (.*)$/m)?.[1]
      if (!ev || !dataLine) continue
      const data = JSON.parse(dataLine)
      if (ev === 'meta') { chatId = data.chat_id; h.onMeta?.(chatId) }
      else if (ev === 'status') h.onStatus?.(data.text)
      else if (ev === 'delta') h.onDelta?.(data.text)
      else if (ev === 'done') result = { messageId: data.message_id, citations: data.citations ?? [] }
      else if (ev === 'error') throw new Error(data.message)
    }
  }
  if (!result) throw new Error('انقطعت الإجابة قبل اكتمالها — حاول مرة أخرى')
  return { chatId, ...result }
}
