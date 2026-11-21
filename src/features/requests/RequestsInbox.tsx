// صندوق الطلبات الواردة (طلب المدير 2026-11-21) — أقسام بدل أعمدة، وكل طلب سطر واحد بأفعاله:
//   يحتاج قرارك (جديد بلا مسؤول) · عند المحامي · بانتظار رد العميل (أُرسل العرض) · راكد ٣٠ يوماً (مطوي) · مُغلقة (مطوية)
// الأحمر للمهلة القريبة وحدها، والكهرماني لعرض تجاوز ١٠ أيام بلا رد. «ما رجع» (no_response) غير «اعتذرنا» (declined).
import { useMemo, useState } from 'react'
import { BellRing, Check, ChevronDown, Hourglass, Inbox, Loader2, Send, UserCheck, UserPlus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { daysLabel, fmtDatePref, fmtNumber, todayISO, toLatinDigits } from '@/lib/format'
import { arNorm } from '@/lib/arabic'
import { useAuth } from '@/stores/auth'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useAssignRequest,
  useCloseRequest,
  useFollowUpRequest,
  useMarkQuoteSent,
  useSetRequestStage,
} from '@/hooks/useRequests'
import type { IncomingRequest } from '@/types/db'
import { criticalKindLabel, sourceLabel, staleDays } from './labels'

const STALE_DAYS = 30 // راكد: لا تحرّك شهراً — يُطوى
const FOLLOWUP_AFTER = 10 // عرض بلا رد عشرة أيام: كهرماني ويُقترح التذكير
const URGENT_DAYS = 14 // مهلة خلال أسبوعين: أحمر

const daysSince = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)) : null
const daysUntil = (iso: string | null | undefined) =>
  iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86400000) : null

/** جملة «وش يبي العميل»: عنوان ملخص الذكاء، وإلا الوصف، وإلا النوع */
function needLine(r: IncomingRequest): string {
  if (r.docs_summary?.headline) return r.docs_summary.headline.replace(/\s+/g, ' ').trim()
  const d = r.description ?? ''
  // وصف التأهيل الآلي من الواتساب يبدأ بسطر النظام — يُؤخذ منه نوع الطلب والرسالة الأولى لا السطر الأول
  if (/^طلب وارد عبر الواتساب/.test(d)) {
    const pick = (label: string) => d.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim()
    const parts = [pick('نوع الطلب'), pick('الرسالة الأولى')].filter(Boolean)
    if (parts.length) return parts.join(' — ')
    return /غير مكتمل/.test(d) ? 'راسلنا على الواتساب ولم يكمل الأسئلة' : 'راسلنا على الواتساب'
  }
  const t = d || r.case_type || ''
  return t.split('\n').filter((l) => l.trim() && !l.trim().startsWith('📎')).join(' ').replace(/\s+/g, ' ').trim()
}

type Buckets = {
  decide: IncomingRequest[]
  lawyer: IncomingRequest[]
  awaiting: IncomingRequest[]
  stale: IncomingRequest[]
  closed: IncomingRequest[]
}

export function RequestsInbox({
  data,
  search,
  navigate,
}: {
  data: IncomingRequest[]
  search: string
  navigate: (to: string) => void
}) {
  const [openStale, setOpenStale] = useState(false)
  const [openClosed, setOpenClosed] = useState(false)
  const [quoteFor, setQuoteFor] = useState<IncomingRequest | null>(null)
  const [remindFor, setRemindFor] = useState<IncomingRequest | null>(null)
  const [closeFor, setCloseFor] = useState<{ r: IncomingRequest; reason: 'declined' | 'no_response' } | null>(null)

  const b = useMemo<Buckets>(() => {
    const q = arNorm(search.trim())
    const match = (r: IncomingRequest) =>
      !q || arNorm([r.client_name, r.client_phone, r.opponent_name, r.ref_no].filter(Boolean).join(' ')).includes(q)
    const out: Buckets = { decide: [], lawyer: [], awaiting: [], stale: [], closed: [] }
    for (const r of data) {
      if (!match(r)) continue
      if (r.status === 'rejected') { out.closed.push(r); continue }
      if (r.stage === 'opened') continue // صار ملفاً — يُرى في المشاريع
      const urgent = (daysUntil(r.critical_date) ?? Infinity) <= URGENT_DAYS
      if (r.stage === 'quoted') { out.awaiting.push(r); continue }
      if (!urgent && staleDays(r.last_activity_at) >= STALE_DAYS) { out.stale.push(r); continue }
      if (!r.assigned_to_id) out.decide.push(r)
      else out.lawyer.push(r)
    }
    const crit = (r: IncomingRequest) => (r.critical_date ? Date.parse(r.critical_date) : Infinity)
    const newest = (a: IncomingRequest, b: IncomingRequest) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
    out.decide.sort((a, b) => crit(a) - crit(b) || newest(a, b))
    out.lawyer.sort((a, b) => crit(a) - crit(b) || newest(a, b))
    // الأطول انتظاراً أولاً — هو الأحوج للتذكير
    out.awaiting.sort((a, b) => String(a.quote_sent_at ?? a.stage_changed_at ?? '').localeCompare(String(b.quote_sent_at ?? b.stage_changed_at ?? '')))
    out.stale.sort((a, b) => String(b.last_activity_at ?? '').localeCompare(String(a.last_activity_at ?? '')))
    out.closed.sort((a, b) => String(b.decision_at ?? b.updated_at ?? '').localeCompare(String(a.decision_at ?? a.updated_at ?? '')))
    return out
  }, [data, search])

  // آخر ٣٠ يوماً: كم وافق، وكم ما رجع، وكم اعتذرنا
  const tally = useMemo(() => {
    const recent = (iso: string | null | undefined) => (daysSince(iso) ?? Infinity) <= 30
    return {
      won: data.filter((r) => recent(r.contract_signed_at) || recent(r.converted_at)).length,
      noReply: data.filter((r) => r.close_reason === 'no_response' && recent(r.decision_at)).length,
      declined: data.filter((r) => r.close_reason === 'declined' && recent(r.decision_at)).length,
    }
  }, [data])

  const empty = !b.decide.length && !b.lawyer.length && !b.awaiting.length

  return (
    <div className="space-y-6">
      {empty && !search && (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          لا شيء ينتظرك الآن — كل الطلبات المفتوحة إما راكدة أو مغلقة.
        </p>
      )}

      <Section icon={Inbox} title="يحتاج قرارك" hint="جديد ولم يُسند لأحد" list={b.decide}>
        {(r) => (
          <Row key={r.id} r={r} onOpen={() => navigate(`/requests/${r.id}`)} meta={<SourceMeta r={r} />}>
            <AssignButton r={r} primary />
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCloseFor({ r, reason: 'declined' })}>
              اعتذار
            </Button>
          </Row>
        )}
      </Section>

      <Section icon={UserCheck} title="عند المحامي" hint="نتواصل أو نجهّز العرض" list={b.lawyer}>
        {(r) => <LawyerRow key={r.id} r={r} navigate={navigate} onQuote={() => setQuoteFor(r)} />}
      </Section>

      <Section icon={Hourglass} title="بانتظار رد العميل" hint="أرسلنا العرض ولم يرد" list={b.awaiting}>
        {(r) => (
          <Row
            key={r.id}
            r={r}
            onOpen={() => navigate(`/requests/${r.id}`)}
            need={[
              r.quote_amount != null ? `عرض ${fmtNumber(r.quote_amount)} ريال` : 'عرض سعر',
              needLine(r),
            ].filter(Boolean).join(' — ')}
            meta={<WaitingMeta r={r} />}
          >
            <Button size="sm" variant="outline" onClick={() => setRemindFor(r)}>
              <BellRing className="h-3.5 w-3.5" />
              ذكّره
            </Button>
            <Button size="sm" variant="gold" onClick={() => navigate(`/requests/${r.id}`)} title="سجّل العقد والمقدّم من صفحة الطلب">
              <Check className="h-3.5 w-3.5" />
              وافق
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCloseFor({ r, reason: 'no_response' })}>
              ما رجع
            </Button>
          </Row>
        )}
      </Section>

      {b.stale.length > 0 && (
        <Folded
          open={openStale}
          onToggle={() => setOpenStale((v) => !v)}
          title="راكد"
          count={b.stale.length}
          hint={`لم يتحرك أكثر من ${fmtNumber(STALE_DAYS)} يوماً — راجعها: من أُرسل له عرض ضع عليه «أرسلنا العرض»، والباقي اعتذر عنه`}
        >
          {b.stale.map((r) => (
            <Row
              key={r.id}
              r={r}
              onOpen={() => navigate(`/requests/${r.id}`)}
              meta={<span>{r.assigned_to_name ?? 'غير مُسند'} · آخر تحرّك قبل {daysLabel(staleDays(r.last_activity_at))}</span>}
            >
              <Button size="sm" variant="outline" onClick={() => setQuoteFor(r)}>
                <Send className="h-3.5 w-3.5" />
                أرسلنا العرض
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCloseFor({ r, reason: 'declined' })}>
                اعتذار
              </Button>
            </Row>
          ))}
        </Folded>
      )}

      {b.closed.length > 0 && (
        <Folded open={openClosed} onToggle={() => setOpenClosed((v) => !v)} title="مُغلقة" count={b.closed.length}>
          <ClosedList list={b.closed} navigate={navigate} />
        </Folded>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>آخر ٣٠ يوماً:</span>
        <span>{fmtNumber(tally.won)} تعاقدنا</span>
        <span>{fmtNumber(tally.noReply)} ما رجعوا</span>
        <span>{fmtNumber(tally.declined)} اعتذرنا</span>
      </p>

      {quoteFor && <QuoteSentDialog r={quoteFor} onClose={() => setQuoteFor(null)} />}
      {remindFor && <RemindDialog r={remindFor} onClose={() => setRemindFor(null)} />}
      {closeFor && <CloseDialog r={closeFor.r} reason={closeFor.reason} onClose={() => setCloseFor(null)} />}
    </div>
  )
}

/* ===================== الأقسام والصفوف ===================== */

function Section({
  icon: Icon,
  title,
  hint,
  list,
  children,
}: {
  icon: typeof Inbox
  title: string
  hint: string
  list: IncomingRequest[]
  children: (r: IncomingRequest) => React.ReactNode
}) {
  if (!list.length) return null
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-gold" />
        {title}
        <span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{fmtNumber(list.length)}</span>
        <span className="ms-auto text-xs font-normal text-muted-foreground">{hint}</span>
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">{list.map(children)}</div>
    </section>
  )
}

function Folded({
  open,
  onToggle,
  title,
  count,
  hint,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: string
  count: number
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-muted/30">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm font-medium">
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        {title}
        <span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{fmtNumber(count)}</span>
        {hint && <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="divide-y border-t bg-card">{children}</div>}
    </section>
  )
}

function Row({
  r,
  onOpen,
  need,
  meta,
  children,
}: {
  r: IncomingRequest
  onOpen: () => void
  need?: string
  meta?: React.ReactNode
  children?: React.ReactNode
}) {
  const left = daysUntil(r.critical_date)
  const urgent = left != null && left <= URGENT_DAYS
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-muted/30">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-right">
        <span className="min-w-0 max-w-[14rem] truncate text-sm font-semibold text-foreground sm:w-44 sm:flex-none">{r.client_name}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{need ?? (needLine(r) || '—')}</span>
      </button>
      {urgent && (
        <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
          {criticalKindLabel(r.critical_date_kind)} {left! < 0 ? `فاتت منذ ${daysLabel(-left!)}` : left === 0 ? 'اليوم' : `بعد ${daysLabel(left!)}`}
        </span>
      )}
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

function SourceMeta({ r }: { r: IncomingRequest }) {
  const d = daysSince(r.created_at ?? r.received_at)
  return (
    <span>
      {sourceLabel(r.source)} · {d === 0 ? 'اليوم' : d === 1 ? 'أمس' : `قبل ${daysLabel(d ?? 0)}`}
    </span>
  )
}

function WaitingMeta({ r }: { r: IncomingRequest }) {
  const d = daysSince(r.quote_sent_at ?? r.stage_changed_at)
  const late = (d ?? 0) >= FOLLOWUP_AFTER
  const text = [
    d == null ? 'أُرسل العرض' : `أُرسل قبل ${daysLabel(d)}`,
    r.followup_count ? `ذُكّر ${r.followup_count === 1 ? 'مرة' : `${fmtNumber(r.followup_count)} مرات`}` : null,
  ].filter(Boolean).join(' · ')
  return late ? (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{text}</span>
  ) : (
    <span>{text}</span>
  )
}

/** عند المحامي: الخطوة التالية زرّاً بحسب المرحلة */
function LawyerRow({ r, navigate, onQuote }: { r: IncomingRequest; navigate: (to: string) => void; onQuote: () => void }) {
  const setStageM = useSetRequestStage()
  const step =
    r.stage === 'new' ? 'التواصل مع العميل' : r.stage === 'contacted' ? 'إرسال العرض' : r.stage === 'contracted' ? 'فتح الملف' : ''
  return (
    <Row
      r={r}
      onOpen={() => navigate(`/requests/${r.id}`)}
      meta={<span>{r.assigned_to_name}{step ? ` · الخطوة: ${step}` : ''}</span>}
    >
      {r.stage === 'new' && (
        <Button size="sm" variant="outline" disabled={setStageM.isPending} onClick={() => setStageM.mutate({ id: r.id, stage: 'contacted' })}>
          تواصلنا
        </Button>
      )}
      {r.stage === 'contacted' && (
        <Button size="sm" variant="outline" onClick={onQuote}>
          <Send className="h-3.5 w-3.5" />
          أرسلنا العرض
        </Button>
      )}
      {r.stage === 'contracted' && (
        <Button size="sm" variant="gold" onClick={() => navigate(`/requests/${r.id}`)}>
          افتح الملف
        </Button>
      )}
      <AssignButton r={r} />
    </Row>
  )
}

function AssignButton({ r, primary }: { r: IncomingRequest; primary?: boolean }) {
  const { data: members } = useTeamMembers()
  const assignM = useAssignRequest()
  const active = (members ?? []).filter((m) => m.is_active && m.id !== r.assigned_to_id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={primary ? 'gold' : 'ghost'} className={cn(!primary && 'text-muted-foreground')} disabled={assignM.isPending}>
          {assignM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {primary ? 'أسند' : 'غيّر'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {active.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => assignM.mutate({ id: r.id, assignedToId: m.id, assignedToName: m.name })}>
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ClosedList({ list, navigate }: { list: IncomingRequest[]; navigate: (to: string) => void }) {
  return (
    <div className="divide-y border-t">
      {list.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate(`/requests/${r.id}`)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-right text-sm hover:bg-muted/40"
        >
          <span className="font-medium">{r.client_name}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              r.close_reason === 'no_response' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground'
            )}
          >
            {r.close_reason === 'no_response' ? 'ما رجع' : 'اعتذرنا'}
          </span>
          <span className="text-xs text-muted-foreground">{sourceLabel(r.source)} · {fmtDatePref(r.decision_at ?? r.received_at)}</span>
          {r.rejection_reason && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">— {r.rejection_reason}</span>}
        </button>
      ))}
    </div>
  )
}

/* ===================== النوافذ ===================== */

export function QuoteSentDialog({ r, onClose }: { r: IncomingRequest; onClose: () => void }) {
  const m = useMarkQuoteSent()
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState(r.quote_amount != null ? String(r.quote_amount) : '')
  const [err, setErr] = useState('')
  const submit = () => {
    if (!date || date > todayISO()) return setErr('اختر تاريخ الإرسال — لا يكون بعد اليوم')
    const n = amount.trim() ? Number(toLatinDigits(amount).replace(/[,،\s]/g, '')) : null
    if (n != null && (!Number.isFinite(n) || n < 0)) return setErr('المبلغ أرقام فقط')
    m.mutate({ id: r.id, sentAt: date, amount: n }, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>أرسلنا العرض لـ{r.client_name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          لعرض أُرسل من خارج النظام. ينتقل الطلب إلى «بانتظار رد العميل» ويُعدّ انتظاره من هذا التاريخ.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="q-date">تاريخ الإرسال</Label>
            <Input id="q-date" type="date" value={date} max={todayISO()} onChange={(e) => { setDate(e.target.value); setErr('') }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-amount">المبلغ (اختياري)</Label>
            <Input id="q-amount" inputMode="decimal" placeholder="15000" value={amount} onChange={(e) => { setAmount(e.target.value); setErr('') }} />
          </div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="gold" onClick={submit} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            سجّل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RemindDialog({ r, onClose }: { r: IncomingRequest; onClose: () => void }) {
  const m = useFollowUpRequest()
  const sent = r.quote_sent_at ? ` المرسل بتاريخ ${fmtDatePref(r.quote_sent_at)}` : ''
  const no = r.quote_no ? ` رقم ${r.quote_no}` : ''
  const [text, setText] = useState(
    `نتابع معكم عرض السعر${no}${sent}. هل لديكم أي استفسار أو ملاحظة قبل اعتماده؟ يسعدنا خدمتكم.`
  )
  const [err, setErr] = useState('')
  const submit = () => {
    if (text.trim().length < 10) return setErr('اكتب نص التذكير')
    m.mutate({ r, message: text.trim() }, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تذكير {r.client_name} بالعرض</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          يصله على الواتساب. إن مرّ على آخر رسالة منه أكثر من يوم يصله بقالب المتابعة المعتمد («حياك الله…» ثم نصك).
        </p>
        <Textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); setErr('') }} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        {(r.followup_count ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            ذُكّر {r.followup_count === 1 ? 'مرة' : `${fmtNumber(r.followup_count!)} مرات`}، آخرها {fmtDatePref(r.last_followup_at)}
          </p>
        )}
        <DialogFooter>
          <Button variant="gold" onClick={submit} disabled={m.isPending || !r.client_phone}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {r.client_phone ? 'أرسل' : 'لا جوال في الطلب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseDialog({ r, reason, onClose }: { r: IncomingRequest; reason: 'declined' | 'no_response'; onClose: () => void }) {
  const m = useCloseRequest()
  const { teamMember } = useAuth()
  const [note, setNote] = useState('')
  const submit = () =>
    m.mutate({ id: r.id, reason, note: note || null, decisionBy: teamMember?.name ?? '—' }, { onSuccess: onClose })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{reason === 'no_response' ? `${r.client_name} ما رجع؟` : `اعتذار عن طلب ${r.client_name}`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {reason === 'no_response'
            ? 'يُغلق الطلب ويُعدّ «ما رجع» لا «اعتذرنا» — فتعرف كم عرضاً ضاع بلا رد.'
            : 'يُغلق الطلب ويُعدّ «اعتذرنا». لا تصل العميل رسالة.'}
        </p>
        <Textarea
          rows={2}
          placeholder={reason === 'no_response' ? 'ملاحظة (اختياري)' : 'السبب (اختياري) — خارج تخصصنا، تعارض مصالح…'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {reason === 'no_response' ? 'أغلق — ما رجع' : 'سجّل الاعتذار'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
