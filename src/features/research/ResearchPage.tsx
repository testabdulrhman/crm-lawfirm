// «الباحث» (طلب المدير 2026-10-16: «اداة ذكاء اصطناعي، الموظف يقدر يبحث عن أي شيء، ويقدر يحط مصادر من عنده»).
// ثلاثة أعمدة على الكمبيوتر: المحادثات · المحادثة · المصادر — وعلى الجوال عمود واحد بزرّين للآخرَين.
// الإجابة تُبث كلمة بكلمة من دالة research، ومصادرها رقائق تحتها تُفتح بضغطة.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp, BookOpen, Copy, FileDown, FileText, FolderOpen, Globe, Loader2, MessageSquarePlus, PanelLeft, Search, Sparkles, Square, Trash2, History, X,
} from 'lucide-react'
import { Link } from 'wouter'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { openExternal } from '@/lib/external'
import { fmtDatePref } from '@/lib/format'
import { arNorm } from '@/lib/arabic'
import { cn } from '@/lib/utils'
import { usePageState } from '@/hooks/usePageState'
import {
  askResearch, useChatSources, useCreateChat, useDeleteChat, useResearchCase, useResearchChats, useResearchMessages,
  type ResearchCitation, type ResearchMessage,
} from '@/hooks/useResearch'
import { useOfficeInfo } from '@/hooks/useSettings'
import { addDocumentDirect } from '@/hooks/useCaseDocuments'
import { useAuth } from '@/stores/auth'
import { buildLetterDocx, letterFileName } from '@/lib/letterDocx'
import { downloadBlob } from '@/lib/docxTemplate'
import { clearQueryParam, queryParam } from '@/lib/queryParam'
import { Markdown } from './Markdown'
import { SourcesPanel } from './SourcesPanel'

// محادثة عن ملف بعينه (من «اسأل الباحث» في صفحته) — بدايات تخصّه
const CASE_STARTERS = [
  'اكتب خطاباً للمحكمة بشأن هذا الملف',
  'لخّص الملف ووضعه الحالي والخطوة التالية',
  'ما الدفوع المتوقعة من الخصم وكيف نرد عليها؟',
  'ما المواد النظامية الأقوى لموقفنا في هذا الملف؟',
]

const STARTERS = [
  'ما مدة الاعتراض على الحكم الابتدائي في نظام المرافعات الشرعية؟ واذكر المادة',
  'لخّص آخر تعديلات نظام الإفلاس ولائحته التنفيذية',
  'ما الفرق بين الصلح الواقي وإعادة التنظيم المالي؟',
  'ابحث في ملفات المكتب عن القضايا العمالية المفتوحة وأحكامها',
]

type Live = { question: string; text: string; status: string | null; error: string | null }

export function ResearchPage() {
  const qc = useQueryClient()
  const [chatId, setChatId] = usePageState<string | null>('research:chat', null)
  // «اسأل الباحث» من صفحة ملف: /research?case=<id> ⇒ محادثة جديدة مربوطة به عند أول سؤال
  const [pendingCase, setPendingCase] = useState<string | null>(
    () => queryParam('case')
  )
  useEffect(() => {
    if (!pendingCase) return
    setChatId(null)
    // يُزال من الرابط حتى لا يعيد التحديثُ فتح محادثة جديدة
    clearQueryParam('case')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { data: chats = [] } = useResearchChats()
  const { data: messages = [] } = useResearchMessages(chatId)
  const { data: chatSources = [] } = useChatSources(chatId)
  const createChat = useCreateChat()
  const deleteChat = useDeleteChat()
  const [input, setInput] = useState('')
  const [live, setLive] = useState<Live | null>(null)
  const [panel, setPanel] = useState<'chats' | 'sources' | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = !!live && !live.error
  const activeCaseId = chatId ? chats.find((c) => c.id === chatId)?.case_id ?? null : pendingCase
  const { data: activeCase } = useResearchCase(activeCaseId)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length, live?.text.length, live?.status])

  const ensureChat = async () => {
    const id = await createChat.mutateAsync({ title: 'محادثة جديدة', caseId: pendingCase })
    setPendingCase(null)
    setChatId(id)
    return id
  }

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    setLive({ question: q, text: '', status: 'يبدأ', error: null })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await askResearch(
        { chatId, message: q, caseId: chatId ? null : pendingCase },
        {
          onMeta: (id) => { if (id !== chatId) { setChatId(id); setPendingCase(null) } },
          onStatus: (s) => setLive((l) => (l ? { ...l, status: s } : l)),
          onDelta: (d) => setLive((l) => (l ? { ...l, text: l.text + d, status: null } : l)),
        },
        ctrl.signal
      )
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['research', 'messages', r.chatId] }),
        qc.invalidateQueries({ queryKey: ['research', 'chats'] }),
      ])
      setLive(null)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // الإيقاف: ما وصل يبقى معروضاً، ويُعاد السؤال للحقل
        setLive((l) => (l ? { ...l, status: null, error: 'أُوقفت الإجابة' } : l))
      } else {
        setLive((l) => (l ? { ...l, status: null, error: errMessage(e) ?? 'تعذّرت الإجابة' } : l))
      }
      setInput((cur) => cur || q)
      qc.invalidateQueries({ queryKey: ['research'] })
    } finally {
      abortRef.current = null
    }
  }

  const newChat = () => {
    if (busy) return
    setChatId(null)
    setPendingCase(null)
    setLive(null)
    setPanel(null)
  }

  const chatList = (
    <ChatList
      chats={chats}
      activeId={chatId}
      onPick={(id) => { if (!busy) { setChatId(id); setLive(null); setPanel(null) } }}
      onNew={newChat}
      onDelete={(id) => {
        deleteChat.mutate(id)
        if (id === chatId) newChat()
      }}
    />
  )
  const sourcesPanel = <SourcesPanel chatId={chatId} ensureChat={ensureChat} />
  const empty = !chatId && !live
  const caseBar = activeCase ? (
    <div className="flex items-center gap-2 border-b bg-gold/5 px-4 py-2 text-sm">
      <FolderOpen className="h-4 w-4 shrink-0 text-gold" />
      <span className="text-muted-foreground">عن الملف</span>
      <Link href={`/cases/${activeCase.id}`} className="min-w-0 truncate font-medium hover:underline">
        <span dir="ltr">{activeCase.office_num}</span> — {activeCase.title}
      </Link>
      {!chatId && (
        <button type="button" onClick={() => setPendingCase(null)} className="ms-auto rounded p-1 text-muted-foreground hover:bg-muted" aria-label="فكّ الربط">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-[1500px] min-h-[520px] gap-3">
      {/* المحادثات */}
      <aside className="hidden w-64 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card lg:flex lg:flex-col">
        {chatList}
      </aside>

      {/* المحادثة */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-2 lg:hidden">
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setPanel('chats')}>
            <History className="h-4 w-4" /> المحادثات
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={newChat}>
            <MessageSquarePlus className="h-4 w-4" /> جديدة
          </Button>
          <Button size="sm" variant="outline" className="ms-auto h-8 gap-1" onClick={() => setPanel('sources')}>
            <BookOpen className="h-4 w-4" /> المصادر{chatSources.length ? ` (${chatSources.length})` : ''}
          </Button>
        </div>

        {caseBar}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <Welcome onPick={(t) => void send(t)} forCase={!!activeCase} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m) => <MessageView key={m.id} m={m} caseId={activeCaseId} />)}
              {live && (
                <>
                  {!messages.some((m) => m.role === 'user' && m.content === live.question && messages[messages.length - 1] === m) && (
                    <UserBubble text={live.question} />
                  )}
                  <div className="space-y-2">
                    {live.text ? <Markdown text={live.text} /> : null}
                    {live.status && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-gold" /> {live.status}…
                      </p>
                    )}
                    {live.error && <p className="text-sm text-destructive">{live.error}</p>}
                  </div>
                </>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* الكتابة */}
        <div className="border-t bg-card px-3 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-background px-3 py-2 focus-within:border-gold/60">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="اسأل الباحث عن أي شيء — نظام، حكم، صياغة، ملف في المكتب…"
              className="max-h-48 min-h-[40px] resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
            />
            {busy ? (
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 rounded-full" onClick={() => abortRef.current?.abort()} aria-label="إيقاف">
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button size="icon" variant="gold" className="h-9 w-9 shrink-0 rounded-full" disabled={!input.trim()} onClick={() => void send()} aria-label="إرسال">
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">
            يبحث في الإنترنت والأنظمة وبيانات المكتب (بصلاحياتك) وفي مصادرك — راجِع المصدر الرسمي قبل الاعتماد.
          </p>
        </div>
      </section>

      {/* المصادر */}
      <aside className="hidden w-80 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card lg:flex lg:flex-col">
        {sourcesPanel}
      </aside>

      {/* الجوال: المحادثات والمصادر في نافذة */}
      <Dialog open={!!panel} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="flex h-[80dvh] max-w-md flex-col gap-0 p-0">
          <DialogHeader className="sr-only"><DialogTitle>{panel === 'chats' ? 'المحادثات' : 'المصادر'}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1">{panel === 'chats' ? chatList : sourcesPanel}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Welcome({ onPick, forCase }: { onPick: (t: string) => void; forCase: boolean }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15">
        <Sparkles className="h-7 w-7 text-gold" />
      </span>
      <h2 className="text-2xl font-bold">الباحث</h2>
      <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
        اسأل عن أي شيء: يبحث في الإنترنت والأنظمة السعودية، وفي بيانات المكتب بصلاحياتك، وفي ما تضيفه في «المصادر» من ملفات وروابط ونصوص — ويذكر مصدر كل معلومة.
      </p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {(forCase ? CASE_STARTERS : STARTERS).map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)}
            className="rounded-xl border bg-background px-3 py-2.5 text-right text-sm leading-6 hover:border-gold/50 hover:bg-gold/5">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-gold/15 px-4 py-2.5 text-[15px] leading-7">{text}</div>
    </div>
  )
}

function MessageView({ m, caseId }: { m: ResearchMessage; caseId: string | null }) {
  const { data: office } = useOfficeInfo()
  const userName = useAuth((s) => s.teamMember?.name ?? null)
  const [making, setMaking] = useState(false)
  if (m.role === 'user') return <UserBubble text={m.content} />

  // «خطاب Word»: الإجابة بترويسة المكتب للمراجعة والتعديل — ونسخة في مستندات الملف إن كانت المحادثة عنه
  const makeLetter = async () => {
    setMaking(true)
    try {
      const blob = await buildLetterDocx({ office: office ?? null, body: m.content })
      const name = letterFileName(m.content)
      downloadBlob(blob, name)
      if (caseId) {
        const file = new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
        await addDocumentDirect(caseId, { file, name, description: 'مسودة من «الباحث» — للمراجعة قبل الإرسال', uploadedByName: userName })
        toast({ variant: 'success', title: 'نُزّل الخطاب، وحُفظت نسخة في مستندات الملف' })
      } else {
        toast({ variant: 'success', title: 'نُزّل الخطاب' })
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر إنشاء الخطاب', description: errMessage(e) })
    } finally {
      setMaking(false)
    }
  }

  return (
    <div className="space-y-3">
      <Markdown text={m.content} />
      {m.citations?.length > 0 && <Citations items={m.citations} />}
      <div className="flex items-center gap-1 text-muted-foreground">
        <Button
          size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
          onClick={() => { void navigator.clipboard.writeText(m.content); toast({ title: 'نُسخت الإجابة' }) }}
        >
          <Copy className="h-3.5 w-3.5" /> نسخ
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => void makeLetter()} disabled={making}>
          {making ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} خطاب Word
        </Button>
        {m.tools?.includes('web_search') && <span className="flex items-center gap-1 text-[11px]"><Globe className="h-3 w-3" /> بحث في الإنترنت</span>}
      </div>
    </div>
  )
}

function Citations({ items }: { items: ResearchCitation[] }) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground">المصادر</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c, i) => {
          const isFile = c.kind === 'source' && !!c.url && /\/storage\/v1\/object\//.test(c.url)
          const host = c.kind === 'web' && c.url ? (() => { try { return new URL(c.url).hostname.replace(/^www\./, '') } catch { return '' } })() : ''
          return (
            <button
              key={i}
              type="button"
              title={c.quote ? `«${c.quote}»` : c.title}
              onClick={() => {
                if (!c.url) return
                if (isFile) setPreview({ url: c.url, name: c.title })
                else openExternal(c.url)
              }}
              className="flex max-w-[260px] items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-gold/50 hover:bg-gold/5"
            >
              {c.kind === 'web' ? <Globe className="h-3 w-3 shrink-0 text-sky-600" /> : <FileText className="h-3 w-3 shrink-0 text-gold-600" />}
              <span className="truncate">{c.title}</span>
              {host && <span className="shrink-0 text-[10px] text-muted-foreground" dir="ltr">{host}</span>}
            </button>
          )
        })}
      </div>
      <FilePreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} fileUrl={preview?.url ?? null} fileName={preview?.name ?? null} />
    </div>
  )
}

function ChatList({
  chats, activeId, onPick, onNew, onDelete,
}: {
  chats: { id: string; title: string | null; updated_at: string }[]
  activeId: string | null
  onPick: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? chats.filter((c) => arNorm(c.title ?? '').includes(arNorm(q.trim()))) : chats
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <Button variant="gold" className="w-full gap-1" onClick={onNew}>
          <MessageSquarePlus className="h-4 w-4" /> محادثة جديدة
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في المحادثات…" className="h-8 pr-8 text-sm" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
            <PanelLeft className="h-5 w-5 opacity-50" /> لا محادثات بعد
          </p>
        ) : shown.map((c) => (
          <div key={c.id}
            className={cn('group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm', c.id === activeId ? 'bg-gold/15' : 'hover:bg-muted/60')}>
            <button type="button" onClick={() => onPick(c.id)} className="min-w-0 flex-1 text-right">
              <p className="truncate font-medium">{c.title || 'محادثة'}</p>
              <p className="text-[11px] text-muted-foreground">{fmtDatePref(c.updated_at)}</p>
            </button>
            <button type="button" onClick={() => { if (confirm('حذف المحادثة؟')) onDelete(c.id) }}
              className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label="حذف">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
