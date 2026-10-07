// «العملاء» — محادثات الواتساب مع العملاء داخل النظام (قرار المدير 2026-10-06: «الحين إذا أضفت الواتس أب
// احس بيكون فيه تداخل مع النقاشات، كيف نحلها؟»). الفصل بمن يقرأ:
//   الأخضر يصل للعميل (هنا وحده) · الذهبي للفريق (النقاشات) — ولا يُرسل للعميل شيء من نقاش.
// الجسر بزرّ «ناقش مع الفريق»: رسالة العميل تُقتبس في نقاش ملفه ويتشاور الفريق هناك.
// يرى المحادثة مسؤول ملفها وفريقه، والمدير وراكان يرون الكل؛ و«غير المصنّف» لهما وحدهما وهما يربطانه.
import { MatterKindIcon } from '@/components/MatterKindIcon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  ArrowRight,
  Bot,
  Clock,
  FolderOpen,
  Link2,
  Lock,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Search,
  Send,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { Ltr } from '@/components/Ltr'
import { toast } from '@/hooks/use-toast'
import { useCanViewOffice } from '@/hooks/useIsDirector'
import { usePostMessage } from '@/hooks/useDiscussions'
import {
  CLIENT_CHAT_EVENT,
  localPhone,
  takeClientChat,
  threadName,
  useClientThread,
  useClientThreads,
  useLinkClientThread,
  useLinkableMatters,
  useSendClientMessage,
  type ClientMsg,
  type ClientThread,
} from '@/hooks/useClientChats'
import { requestDiscussionJump } from '@/lib/discussionJump'
import { errMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { matterHref } from '@/lib/matterHref'
import { cn } from '@/lib/utils'

const riyadhTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
        new Date(iso)
      )
    : ''
const riyadhDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(iso))

/** في القائمة: الوقت لليوم، والتاريخ لما قبله */
function listStamp(iso: string | null) {
  if (!iso) return ''
  return riyadhDay(iso) === riyadhDay(new Date().toISOString()) ? riyadhTime(iso) : fmtDate(iso)
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)

type Filter = 'all' | 'unread' | 'unlinked'

export function ClientChatsPage() {
  const { data: threads, isLoading, error, refetch } = useClientThreads()
  const viewer = useCanViewOffice() // المدير أو من له الاطلاع على كل شيء (راكان)
  const [selected, setSelected] = useState<string | null>(() => takeClientChat())
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    const on = (e: Event) => {
      takeClientChat()
      setSelected((e as CustomEvent<string>).detail)
    }
    window.addEventListener(CLIENT_CHAT_EVENT, on)
    return () => window.removeEventListener(CLIENT_CHAT_EVENT, on)
  }, [])

  const shown = useMemo(() => {
    const s = q.trim()
    return (threads ?? []).filter((t) => {
      if (filter === 'unread' && !t.unread) return false
      if (filter === 'unlinked' && t.case_id) return false
      if (!s) return true
      return (
        threadName(t).includes(s) ||
        t.phone_e164.includes(s.replace(/\D/g, '') || '§') ||
        localPhone(t.phone_e164).includes(s) ||
        (t.matter?.office_num ?? '').toLowerCase().includes(s.toLowerCase())
      )
    })
  }, [threads, filter, q])

  const current = threads?.find((t) => t.phone_e164 === selected) ?? null
  const unlinkedCount = (threads ?? []).filter((t) => !t.case_id).length

  return (
    <div className="mx-auto h-[calc(100vh-7.5rem)] max-w-[1400px]">
      <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* القائمة */}
        <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card', selected && 'hidden lg:flex')}>
          <div className="space-y-2.5 border-b border-border/60 p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">واتساب</p>
                <p className="text-[11px] text-muted-foreground">محادثات العملاء — تصل للعميل</p>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو رقم جوال أو رقم ملف" className="h-9 pr-8 text-sm" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'الكل'],
                  ['unread', 'غير مقروءة'],
                  ...(viewer ? ([['unlinked', `غير مصنّف${unlinkedCount ? ` · ${unlinkedCount}` : ''}`]] as const) : []),
                ] as [Filter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    filter === k
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-border/70 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : error ? (
              <div className="space-y-2 p-4 text-center text-sm">
                <p className="text-destructive">تعذّر تحميل المحادثات — {errMessage(error)}</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {threads?.length ? 'لا نتائج' : 'لا محادثات في ملفاتك بعد — تظهر هنا رسائل عملاء ملفاتك على الواتساب'}
              </p>
            ) : (
              shown.map((t) => <ThreadRow key={t.phone_e164} t={t} active={t.phone_e164 === selected} onClick={() => setSelected(t.phone_e164)} />)
            )}
          </div>
        </div>

        {/* المحادثة */}
        {selected && current ? (
          <ChatPane key={selected} thread={current} viewer={viewer} onBack={() => setSelected(null)} />
        ) : (
          <div className="hidden items-center justify-center rounded-2xl border border-border/70 bg-card lg:flex">
            <EmptyState
              icon={MessageCircle}
              title="اختر محادثة"
              description="ما تكتبه هنا يصل للعميل على الواتساب — وللتشاور الداخلي «النقاشات»"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadRow({ t, active, onClick }: { t: ClientThread; active: boolean; onClick: () => void }) {
  const name = threadName(t)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-right transition-colors',
        active ? 'bg-emerald-600/10' : 'hover:bg-muted/60'
      )}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600/15 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        {name.replace(/^[+0-9\s]+$/, '#').slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', t.unread ? 'font-bold' : 'font-medium')}>{name}</span>
          <span className={cn('ms-auto shrink-0 text-[11px]', t.unread ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
            <Ltr>{listStamp(t.last_message_at)}</Ltr>
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className={cn('min-w-0 flex-1 truncate text-xs', t.unread ? 'text-foreground' : 'text-muted-foreground')}>
            {t.last_direction === 'out' ? '↩︎ ' : ''}
            {t.last_preview}
          </span>
          {t.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" />}
        </span>
        <span className="mt-1 flex">
          {t.case_id ? (
            <span className="rounded-full bg-gold/15 px-2 py-px text-[10px] font-medium text-gold-700 dark:text-gold-300">
              <MatterKindIcon kind={t.matter?.kind} /> <Ltr>{t.matter?.office_num ?? 'ملف'}</Ltr>
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-px text-[10px] text-muted-foreground">غير مصنّف</span>
          )}
        </span>
      </span>
    </button>
  )
}

function ChatPane({ thread, viewer, onBack }: { thread: ClientThread; viewer: boolean; onBack: () => void }) {
  const phone = thread.phone_e164
  const name = threadName(thread)
  const { data, isLoading, error, refetch } = useClientThread(phone)
  const send = useSendClientMessage(phone)
  const [text, setText] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [discuss, setDiscuss] = useState<ClientMsg | null>(null)
  const pendingId = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const msgs = data?.messages ?? []
  const windowOpen = data?.window_open ?? false
  const count = msgs.length
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const submit = () => {
    const body = text.trim()
    if (!body || send.isPending) return
    // معرّفٌ ثابت للنص نفسه: إعادة المحاولة بعد انقطاع لا تُرسل نسخة ثانية
    pendingId.current ??= newId()
    send.mutate(
      { body, mode: windowOpen ? 'text' : 'template', clientId: pendingId.current },
      {
        onSuccess: () => {
          setText('')
          pendingId.current = null
        },
        onError: (e) => {
          toast({ variant: 'destructive', title: 'لم تُرسل الرسالة', description: errMessage(e) })
          // الرفض النهائي (النافذة/الإيقاف) لا يُعاد بالمعرّف نفسه
          pendingId.current = null
        },
      }
    )
  }

  let lastDay = ''
  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card')}>
      {/* الرأس */}
      <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2.5">
        <button type="button" onClick={onBack} className="rounded-full p-1 hover:bg-muted lg:hidden" aria-label="رجوع">
          <ArrowRight className="h-5 w-5" />
        </button>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600/15 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          {name.replace(/^[+0-9\s]+$/, '#').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">
            <Ltr>{localPhone(phone)}</Ltr>
          </p>
        </div>
        {thread.case_id ? (
          <Link
            href={matterHref(thread.matter?.kind ?? 'case', thread.case_id)}
            className="flex max-w-[40%] shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-medium sm:px-2.5 sm:text-xs text-gold-700 hover:bg-gold/25 dark:text-gold-300"
            title={thread.matter?.title ?? undefined}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <Ltr>{thread.matter?.office_num ?? 'الملف'}</Ltr>
            {thread.matter?.title && <span className="hidden truncate font-normal xl:inline">· {thread.matter.title}</span>}
          </Link>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">غير مصنّف</span>
        )}
        {viewer && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 px-2 text-xs sm:px-3"
            onClick={() => setLinkOpen(true)}
            aria-label={thread.case_id ? 'تغيير الملف' : 'ربط بملف'}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{thread.case_id ? 'تغيير الملف' : 'ربط بملف'}</span>
          </Button>
        )}
      </div>

      {/* النافذة */}
      {data && (
        <div
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-[11px]',
            windowOpen ? 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {windowOpen ? (
            <>النافذة مفتوحة — يبقى {hoursLeft(data.window_expires_at)} للرد الحر</>
          ) : (
            <>مرّت ٢٤ ساعة على آخر رسالة من العميل — يصله ردّك داخل القالب المعتمد «متابعة»</>
          )}
        </div>
      )}

      {/* الرسائل */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 px-3 py-3">
        {isLoading ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">جارٍ جلب المحادثة…</p>
        ) : error ? (
          <div className="space-y-2 pt-10 text-center text-sm">
            <p className="text-destructive">تعذّر جلب المحادثة — {errMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          msgs.map((m, i) => {
            const day = riyadhDay(m.at)
            const sep = day !== lastDay
            lastDay = day
            const prev = msgs[i - 1]
            const continued = !sep && !!prev && prev.who === m.who && prev.member_id === m.member_id && Date.parse(m.at) - Date.parse(prev.at) < 300_000
            return (
              <div key={m.id}>
                {sep && (
                  <p className="mx-auto my-2 w-fit rounded-full bg-card px-3 py-0.5 text-[11px] text-muted-foreground shadow-sm">
                    <Ltr>{fmtDate(m.at)}</Ltr>
                  </p>
                )}
                <ClientBubble m={m} continued={continued} canDiscuss={!!thread.case_id} onDiscuss={() => setDiscuss(m)} />
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* الكتابة */}
      <div className="border-t border-border/60 p-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <Send className="h-3 w-3" />
          يصل إلى {name} على الواتساب
        </p>
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              pendingId.current = null
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={windowOpen ? 'اكتب رداً للعميل…' : 'اكتب رسالتك — تُرسل داخل قالب «متابعة»'}
            className="max-h-40 min-h-[40px] resize-none rounded-2xl border-emerald-600/40 focus-visible:ring-emerald-600/40"
          />
          <Button
            type="button"
            onClick={submit}
            disabled={!text.trim() || send.isPending || !data}
            className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 p-0 text-white hover:bg-emerald-700"
            aria-label="إرسال للعميل"
          >
            <Send className="h-4 w-4 -scale-x-100" />
          </Button>
        </div>
      </div>

      {linkOpen && <LinkDialog thread={thread} onClose={() => setLinkOpen(false)} />}
      {discuss && thread.case_id && (
        <DiscussDialog msg={discuss} caseId={thread.case_id} clientName={name} onClose={() => setDiscuss(null)} />
      )}
    </div>
  )
}

function hoursLeft(exp: string | null) {
  if (!exp) return ''
  const h = Math.max(0, (Date.parse(exp) - Date.now()) / 3_600_000)
  return h >= 1 ? `${Math.floor(h)} ساعة` : `${Math.max(1, Math.round(h * 60))} دقيقة`
}

const isImage = (m: ClientMsg) => (m.mime ?? '').startsWith('image/') || m.type === 'image'
const isAudio = (m: ClientMsg) => (m.mime ?? '').startsWith('audio/') || m.type === 'audio' || m.type === 'voice'

function ClientBubble({
  m,
  continued,
  canDiscuss,
  onDiscuss,
}: {
  m: ClientMsg
  continued: boolean
  canDiscuss: boolean
  onDiscuss: () => void
}) {
  const fromClient = m.direction === 'in'
  // ترتيب الواتساب كالنقاشات: ما يخرج منا يساراً، والعميل يميناً
  const label =
    m.who === 'member'
      ? m.member_name ?? 'موظف'
      : m.who === 'hatif_staff'
        ? 'من لوحة هاتف'
        : m.who === 'bot'
          ? 'الرد الآلي'
          : m.who === 'system'
            ? 'رسالة من النظام'
            : null
  return (
    <div className={cn('group flex', fromClient ? 'justify-start' : 'justify-end', continued ? '-mt-0.5' : 'mt-1.5')}>
      <div className={cn('flex max-w-[78%] flex-col', fromClient ? 'items-start' : 'items-end')}>
        <div
          className={cn(
            'relative min-w-[120px] rounded-2xl px-3 pb-1 pt-2 text-sm shadow-sm',
            fromClient ? cn('bg-card', !continued && 'rounded-tr-md') : cn('bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50', !continued && 'rounded-tl-md')
          )}
        >
          {!fromClient && label && !continued && (
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              {m.who === 'bot' && <Bot className="h-3 w-3" />}
              {label}
              {m.template && <span className="font-normal opacity-70">· قالب</span>}
            </p>
          )}
          {m.media &&
            (isImage(m) ? (
              <a href={m.media} target="_blank" rel="noreferrer">
                <img src={m.media} alt="" loading="lazy" className="mb-1 max-h-64 rounded-lg object-cover" />
              </a>
            ) : isAudio(m) ? (
              <audio controls src={m.media} className="mb-1 h-9 max-w-[240px]" />
            ) : (
              <a href={m.media} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 text-xs underline">
                <Paperclip className="h-3.5 w-3.5" /> مرفق
              </a>
            ))}
          {m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
          <p className={cn('mt-0.5 text-left text-[10px]', fromClient ? 'text-muted-foreground' : 'text-emerald-800/70 dark:text-emerald-200/70')}>
            <Ltr>{riyadhTime(m.at)}</Ltr>
            {!fromClient && m.status && (
              <span className={cn('ms-1', m.status === 'read' && 'text-sky-600')}>
                {m.status === 'failed' ? '⚠︎' : m.status === 'read' || m.status === 'delivered' ? '✓✓' : '✓'}
              </span>
            )}
          </p>
        </div>
        {fromClient && canDiscuss && (
          <button
            type="button"
            onClick={onDiscuss}
            className="mt-0.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-gold-700 opacity-0 transition-opacity hover:bg-gold/10 focus:opacity-100 group-hover:opacity-100 dark:text-gold-300 [@media(hover:none)]:opacity-100"
          >
            <MessagesSquare className="h-3 w-3" />
            ناقش مع الفريق
          </button>
        )}
      </div>
    </div>
  )
}

/** رسالة العميل تُقتبس في نقاش ملفه — داخلي، لا يصل للعميل */
function DiscussDialog({ msg, caseId, clientName, onClose }: { msg: ClientMsg; caseId: string; clientName: string; onClose: () => void }) {
  const post = usePostMessage()
  const [, navigate] = useLocation()
  const [note, setNote] = useState('')
  const quote = (msg.body ?? '').trim() || (msg.media ? '📎 مرفق' : '')
  const go = () => {
    const body = `💬 من ${clientName} على الواتساب:\n«${quote}»${note.trim() ? `\n\n${note.trim()}` : ''}`
    post.mutate(
      { caseId, body },
      {
        onSuccess: () => {
          onClose()
          requestDiscussionJump({ caseId })
          navigate('/discussions')
        },
        onError: (e) => toast({ variant: 'destructive', title: 'لم تُنشر في النقاش', description: errMessage(e) }),
      }
    )
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ناقش مع الفريق</DialogTitle>
        </DialogHeader>
        <div className="border-r-4 border-emerald-600 bg-emerald-600/5 px-3 py-2 text-sm">
          <p className="mb-1 text-[11px] text-emerald-700 dark:text-emerald-400">من {clientName} على الواتساب</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{quote}</p>
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="سؤالك أو ملاحظتك للفريق (اختياري)" autoFocus />
        <p className="flex items-center gap-1.5 text-[11px] text-gold-700 dark:text-gold-300">
          <Lock className="h-3 w-3" /> تُنشر في نقاش الملف — داخلي، لا يصل للعميل
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={go} disabled={post.isPending} className="bg-gold-600 text-white hover:bg-gold-700">
            انشر في النقاش
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** ربط المحادثة بملف — للمدير وراكان. ومن رُبط تذهب كل رسائل رقمه للملف نفسه */
function LinkDialog({ thread, onClose }: { thread: ClientThread; onClose: () => void }) {
  const [q, setQ] = useState('')
  const { data: matters, isLoading } = useLinkableMatters(q)
  const link = useLinkClientThread()
  const pick = (caseId: string | null) =>
    link.mutate(
      { phone: thread.phone_e164, caseId },
      {
        onSuccess: () => {
          toast({ title: caseId ? 'رُبطت المحادثة بالملف' : 'أُلغي الربط — صارت غير مصنّفة' })
          onClose()
        },
        onError: (e) => toast({ variant: 'destructive', title: 'لم يتم الربط', description: errMessage(e) }),
      }
    )
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ربط محادثة {threadName(thread)} بملف</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          يراها بعد الربط مسؤول الملف وفريقه، وتذهب كل رسائل هذا الرقم بعدها للملف نفسه.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم الملف أو عنوانه" className="pr-8" autoFocus />
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">جارٍ البحث…</p>
          ) : !matters?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا ملفات مطابقة</p>
          ) : (
            matters.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={link.isPending}
                onClick={() => pick(m.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right text-sm transition-colors hover:bg-muted',
                  m.id === thread.case_id ? 'border-gold bg-gold/10' : 'border-border/60'
                )}
              >
                <span><MatterKindIcon kind={m.kind} /></span>
                <Ltr className="shrink-0 text-xs font-medium">{m.office_num ?? '—'}</Ltr>
                <span className="min-w-0 flex-1 truncate">{m.title ?? 'بلا عنوان'}</span>
                {m.contact?.name && <span className="shrink-0 text-xs text-muted-foreground">{m.contact.name}</span>}
              </button>
            ))
          )}
        </div>
        {thread.case_id && (
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={link.isPending} onClick={() => pick(null)}>
              إلغاء الربط (غير مصنّف)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
