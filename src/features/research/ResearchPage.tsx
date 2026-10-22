// «الباحث» (طلب المدير 2026-10-16: «اداة ذكاء اصطناعي، الموظف يقدر يبحث عن أي شيء، ويقدر يحط مصادر من عنده»).
// ثلاثة أعمدة على الكمبيوتر: المحادثات · المحادثة · المصادر — وعلى الجوال عمود واحد بزرّين للآخرَين.
// الإجابة تُبث كلمة بكلمة من دالة research، ومصادرها رقائق تحتها تُفتح بضغطة.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp, BookOpen, PanelRightClose, PanelRightOpen, Copy, FileDown, FileText, FolderOpen, Globe, Loader2, MessageSquarePlus, PanelLeft, Search, Sparkles, Square, Trash2, History, X,
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
  isAwaitingAnswer, postResearchNote, useChatSources, useCreateChat, useDeleteChat, useResearchCase, useResearchChats, useResearchMessages,
  type ResearchCitation, type ResearchMessage,
} from '@/hooks/useResearch'
import { useOfficeInfo } from '@/hooks/useSettings'
import { addDocumentDirect } from '@/hooks/useCaseDocuments'
import { useAuth } from '@/stores/auth'
import { buildLetterDocx, letterFileName } from '@/lib/letterDocx'
import { addNote, releaseNewRuns, startRun, stopRun, useResearchRuns, type Run } from './liveRuns'
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
  // الإجابة الجارية لهذه المحادثة — من المخزن العام، فتبقى إن غادرت الصفحة أو انتقلت لمحادثة أخرى
  const runs = useResearchRuns((st) => st.runs)
  const live: Run | null =
    Object.values(runs).find((r) => (chatId ? r.chatId === chatId : r.fromNew && !r.adopted)) ?? null
  const runningChats = new Set(Object.values(runs).filter((r) => !r.error && r.chatId).map((r) => r.chatId!))
  const [panel, setPanel] = useState<'chats' | 'sources' | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = !!live && !live.error
  // سؤال محفوظ بلا إجابة ولا بثّ هنا: الخادم يكملها (غادرت أو حدّثت الصفحة) — نعرض ذلك ونتابع القاعدة
  const awaiting = !live && isAwaitingAnswer(messages)
  const stalled = !live && !awaiting && messages.length > 0 && messages[messages.length - 1].role === 'user'
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant')

  // «محادثة جديدة» عُرف رقمها وأنت ما زلت عليها ⇒ افتحها
  useEffect(() => {
    if (!chatId && live?.fromNew && live.chatId) {
      setChatId(live.chatId)
      setPendingCase(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, live?.chatId])
  // أُوقف العرض ثم حُفظت الإجابة كاملة ⇒ يُطوى سطر الإيقاف
  useEffect(() => {
    if (live?.error && messages.length && messages[messages.length - 1].role === 'assistant') {
      useResearchRuns.getState().drop(live.key)
    }
  }, [live?.error, live?.key, messages])
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
    if (!q) return
    setInput('')
    // وهو يكتب أو يبحث: ما تكتبه ملاحظة يأخذ بها قبل أن يرسل (طلب المدير 2026-10-22)
    if (busy && live) {
      addNote(qc, live.key, q)
      return
    }
    // يكمل في الخادم بعد تحديث الصفحة: الملاحظة تُحفظ في المحادثة فيلتقطها
    if (awaiting && chatId) {
      try {
        await postResearchNote(chatId, q)
        void qc.invalidateQueries({ queryKey: ['research', 'messages', chatId] })
      } catch (e) {
        setInput(q)
        toast({ variant: 'destructive', title: 'تعذّر إرسال الملاحظة', description: errMessage(e) })
      }
      return
    }
    startRun(qc, { chatId, message: q, caseId: chatId ? null : pendingCase })
  }

  const newChat = () => {
    releaseNewRuns()
    setChatId(null)
    setPendingCase(null)
    setPanel(null)
  }

  // قائمة المحادثات تُطوى على الحاسب إلى شريط رفيع (طلب المدير 2026-10-17) — تفضيل في المتصفح
  const [chatsCollapsed, setChatsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('research:chatsCollapsed') === '1'
    } catch {
      return false
    }
  })
  const collapseChats = (v: boolean) => {
    setChatsCollapsed(v)
    try {
      localStorage.setItem('research:chatsCollapsed', v ? '1' : '0')
    } catch {
      /* وضع خاص */
    }
  }
  const chatList = (collapsible: boolean) => (
    <ChatList
      chats={chats}
      activeId={chatId}
      running={runningChats}
      onCollapse={collapsible ? () => collapseChats(true) : undefined}
      onPick={(id) => { releaseNewRuns(); setChatId(id); setPanel(null) }}
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
      {chatsCollapsed ? (
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card py-3 lg:flex">
          <Button variant="ghost" size="icon" onClick={() => collapseChats(false)} title="وسّع قائمة المحادثات" aria-label="وسّع قائمة المحادثات">
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          <Button variant="gold" size="icon" onClick={newChat} title="محادثة جديدة" aria-label="محادثة جديدة">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          {runningChats.size > 0 && (
            <span title="إجابة تُكتب في محادثة أخرى" className="mt-1 text-gold">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </aside>
      ) : (
        <aside className="hidden w-64 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card lg:flex lg:flex-col">
          {chatList(true)}
        </aside>
      )}

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
                  {!live.reuse && !messages.slice(lastAssistant + 1).some((m) => m.role === 'user' && m.content === live.question) && (
                    <UserBubble text={live.question} />
                  )}
                  {live.notes
                    .filter((n) => !n.id || !messages.some((m) => m.id === n.id))
                    .map((n) => (
                      <UserBubble
                        key={n.key}
                        text={n.text}
                        note={n.failed ? 'لم تصل — أعد كتابتها' : n.seen ? '✓ قرأها وأخذ بها' : 'سيأخذ بها قبل أن يرسل'}
                        failed={n.failed}
                      />
                    ))}
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
              {awaiting && (
                <p className="flex items-center gap-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" />
                  الباحث يكمل الإجابة — تظهر هنا حين تكتمل، ولك أن تتنقّل في هذه الأثناء.
                </p>
              )}
              {stalled && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-sm">
                  <span className="text-destructive">لم تكتمل الإجابة عن هذا السؤال.</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => void send(messages[messages.length - 1].content)}>
                    أعد السؤال
                  </Button>
                </div>
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
              placeholder={
                busy || awaiting
                  ? 'اكتب ملاحظتك وهو يعمل — يأخذ بها قبل أن يرسل الإجابة…'
                  : 'اسأل الباحث عن أي شيء — نظام، حكم، صياغة، ملف في المكتب…'
              }
              className="max-h-48 min-h-[40px] resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
            />
            {(busy || awaiting) && input.trim() ? (
              <Button size="icon" variant="gold" className="h-9 w-9 shrink-0 rounded-full" onClick={() => void send()} aria-label="أضف ملاحظة" title="أضف ملاحظة — يأخذ بها قبل أن يرسل">
                <ArrowUp className="h-4 w-4" />
              </Button>
            ) : awaiting ? (
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 rounded-full" disabled aria-label="يكمل الإجابة">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            ) : busy ? (
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 rounded-full" onClick={() => live && stopRun(live.key)} aria-label="إيقاف">
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
          <div className="min-h-0 flex-1">{panel === 'chats' ? chatList(false) : sourcesPanel}</div>
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

function UserBubble({ text, note, failed }: { text: string; note?: string; failed?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-gold/15 px-4 py-2.5 text-[15px] leading-7">{text}</div>
      {note && <span className={cn('px-2 text-[11px]', failed ? 'text-destructive' : 'text-muted-foreground')}>{note}</span>}
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
  chats, activeId, running, onPick, onNew, onDelete, onCollapse,
}: {
  chats: { id: string; title: string | null; updated_at: string }[]
  activeId: string | null
  /** محادثات تُكتب إجابتها الآن */
  running: Set<string>
  onPick: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  /** على الحاسب: طيّ القائمة إلى شريط رفيع */
  onCollapse?: () => void
}) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? chats.filter((c) => arNorm(c.title ?? '').includes(arNorm(q.trim()))) : chats
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex gap-1.5">
          <Button variant="gold" className="flex-1 gap-1" onClick={onNew}>
            <MessageSquarePlus className="h-4 w-4" /> محادثة جديدة
          </Button>
          {onCollapse && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onCollapse} title="صغّر القائمة" aria-label="صغّر قائمة المحادثات">
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
        </div>
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
              {running.has(c.id) ? (
                <p className="flex items-center gap-1 text-[11px] text-gold">
                  <Loader2 className="h-3 w-3 animate-spin" /> يكتب الإجابة
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">{fmtDatePref(c.updated_at)}</p>
              )}
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
