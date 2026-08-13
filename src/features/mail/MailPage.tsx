// البريد الرسمي — وارد (مزامنة كل 5 دقائق) وصادر (إرسال عبر Gmail API)
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Mail,
  Search,
  Send,
  Loader2,
  AlertCircle,
  User,
  Scale,
  FolderPlus,
  ChevronDown,
  Reply,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ContactPicker } from '@/components/ContactPicker'
import { CasePicker } from '@/components/CasePicker'
import { Ltr } from '@/components/Ltr'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import { useCases } from '@/hooks/useCases'
import {
  useEmailMessages,
  useSendEmail,
  useAttachEmailToCase,
} from '@/hooks/useEmail'
import { usePageState } from '@/hooks/usePageState'
import type { EmailMessage } from '@/types/db'

export function MailPage() {
  const [tab, setTab] = usePageState<'incoming' | 'outgoing'>('mail:tab', 'incoming')
  const [search, setSearch] = usePageState('mail:q', '')
  const { data, isLoading } = useEmailMessages(tab)
  const [composeOpen, setComposeOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((m) =>
      [m.from_name, m.from_email, m.to_email, m.subject, m.snippet, m.body_text]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [data, search])

  return (
    // استثناء مقصود عن max-w-6xl: قوائم الرسائل نصية طويلة تُقرأ أفضل بعرض أضيق
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          البريد{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setComposeOpen(true)}>
          <Send className="h-4 w-4" />
          رسالة جديدة
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'incoming' ? 'default' : 'outline'}
          onClick={() => setTab('incoming')}
        >
          الوارد
        </Button>
        <Button
          size="sm"
          variant={tab === 'outgoing' ? 'default' : 'outline'}
          onClick={() => setTab('outgoing')}
        >
          الصادر
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في المرسل أو الموضوع أو النص…"
          className="pr-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} onCompose={() => setComposeOpen(true)} />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
          {filtered.map((m) => (
            <MailRow key={m.id} m={m} />
          ))}
        </div>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        {/* حماية المسودة: لا إغلاق بالنقر الخارجي أو Escape — الإغلاق بزر إلغاء أو X فقط */}
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <ComposeForm onDone={() => setComposeOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MailRow({ m }: { m: EmailMessage }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const [open, setOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [pickedCase, setPickedCase] = useState<string | null>(null)
  const { data: cases } = useCases()
  const attachM = useAttachEmailToCase()
  const isOut = m.direction === 'outgoing'
  const who = isOut
    ? m.to_email
    : m.from_name || m.from_email || 'مجهول'
  return (
    <div className="px-4 py-3">
      <button
        className="block w-full text-right"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isOut ? 'secondary' : 'gold'} className="shrink-0">
            {who && who.includes('@') ? <Ltr>{who}</Ltr> : who}
          </Badge>
          {m.status === 'failed' && (
            <Badge variant="destructive" className="shrink-0 gap-1">
              <AlertCircle className="h-3 w-3" />
              فشل الإرسال
            </Badge>
          )}
          <span className="mr-auto text-xs text-muted-foreground">
            {fmtDateTime(m.internal_date ?? m.created_at)}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {m.subject || '(بدون موضوع)'}
        </p>
        {!open && (m.snippet || m.body_text) && (
          <p className="truncate text-xs text-muted-foreground">
            {m.snippet || m.body_text}
          </p>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {m.status === 'failed' && m.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {m.error}
            </p>
          )}
          <p
            className={cn(
              'whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground'
            )}
          >
            {m.body_text || m.snippet || '—'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!isOut && m.from_email && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setReplyOpen(true)}
              >
                <Reply className="h-3.5 w-3.5" />
                رد
              </Button>
            )}
            {m.contact && (
              <button
                onClick={() => navigate(`/contacts/${m.contact!.id}`)}
                className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
              >
                <User className="h-3.5 w-3.5 text-gold" />
                {m.contact.name}
              </button>
            )}
            {m.case ? (
              <button
                onClick={() => navigate(`/cases/${m.case!.id}`)}
                className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
              >
                <Scale className="h-3.5 w-3.5 text-gold" />
                القضية: {m.case.title || '—'}
              </button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setPickedCase(null)
                  setAttachOpen(true)
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                إضافة لملف قضية
              </Button>
            )}
          </div>
        </div>
      )}

      {/* الرد على الوارد — نموذج الإرسال معبّأ بالعنوان والموضوع مسبقاً */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {replyOpen && (
            <ComposeForm
              onDone={() => setReplyOpen(false)}
              initial={{
                to: m.from_email ?? '',
                subject: m.subject
                  ? m.subject.startsWith('رد:')
                    ? m.subject
                    : `رد: ${m.subject}`
                  : '',
                contactId: m.contact_id,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* اختيار القضية — تُنقل الرسالة ومرفقاتها لمستنداتها */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة الرسالة لملف قضية</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيُحفظ نص الرسالة وجميع مرفقاتها في مستندات القضية المختارة.
          </p>
          <CasePicker
            cases={cases ?? []}
            value={pickedCase}
            onChange={setPickedCase}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!pickedCase || attachM.isPending}
              onClick={() =>
                pickedCase &&
                attachM.mutate(
                  {
                    email_id: m.id,
                    case_id: pickedCase,
                    uploaded_by_name: teamMember?.name ?? null,
                  },
                  { onSuccess: () => setAttachOpen(false) }
                )
              }
            >
              {attachM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ComposeForm({
  onDone,
  initial,
}: {
  onDone: () => void
  /** قيم ابتدائية (للرد على رسالة واردة مثلاً) */
  initial?: { to?: string; subject?: string; contactId?: string | null }
}) {
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const sendM = useSendEmail()

  const [contactId, setContactId] = useState<string | null>(
    initial?.contactId ?? null
  )
  const [to, setTo] = useState(initial?.to ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  // جهات الاتصال التي لديها بريد فقط — اختيارها يعبّئ حقل «إلى»
  const withEmail = useMemo(
    () => (contacts ?? []).filter((c) => c.email && c.email.includes('@')),
    [contacts]
  )

  const submit = () => {
    const t = to.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      setError('أدخل بريداً إلكترونياً صحيحاً في خانة «إلى».')
      return
    }
    if (!subject.trim()) {
      setError('الموضوع مطلوب.')
      return
    }
    if (!text.trim()) {
      setError('نص الرسالة مطلوب.')
      return
    }
    setError(null)
    sendM.mutate(
      {
        to: t,
        subject: subject.trim(),
        text: text.trim(),
        contact_id: contactId,
        sent_by: teamMember?.id ?? null,
      },
      { onSuccess: onDone }
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>رسالة بريد جديدة</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>جهة اتصال (اختياري — يعبّئ البريد)</Label>
          <ContactPicker
            contacts={withEmail}
            placeholder="ابحث بالاسم أو الجوال أو البريد…"
            value={contactId}
            onSelect={(c) => {
              setContactId(c?.id ?? null)
              if (c?.email) setTo(c.email)
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail_to">إلى (البريد الإلكتروني)</Label>
          <Input
            id="mail_to"
            dir="ltr"
            inputMode="email"
            placeholder="name@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail_subject">الموضوع</Label>
          <Input
            id="mail_subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail_text">نص الرسالة</Label>
          <Textarea
            id="mail_text"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="gold" disabled={sendM.isPending} onClick={submit}>
          {sendM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          إرسال
        </Button>
        <Button variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  )
}

function EmptyState({
  tab,
  onCompose,
}: {
  tab: 'incoming' | 'outgoing'
  onCompose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Mail className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">
        {tab === 'incoming' ? 'لا بريد وارد بعد' : 'لا بريد صادر بعد'}
      </p>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">
        {tab === 'incoming'
          ? 'الوارد يُزامَن تلقائياً كل 5 دقائق بعد إكمال إعدادات Gmail.'
          : 'أرسل أول رسالة رسمية عبر «رسالة جديدة».'}
      </p>
      {tab === 'outgoing' && (
        <Button variant="gold" className="mt-4" onClick={onCompose}>
          <Send className="h-4 w-4" />
          رسالة جديدة
        </Button>
      )}
    </div>
  )
}
