// صفحة «الرسائل» بتبويبين: الوارد (اختصار الآيفون) والصادر (رسائل النظام).
// الربط بالقضية: يدوي دائم (case_id) أو تلقائي بمطابقة أرقام المحكمة في النص
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  CheckCheck,
  Link2,
  Loader2,
  MessageSquare,
  Scale,
  Search,
  Send,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CasePicker } from '@/components/CasePicker'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Ltr } from '@/components/Ltr'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import {
  useIncomingSms,
  useLinkSmsToCase,
  useMarkSmsRead,
  useReclassifySms,
  SMS_CATEGORIES,
  smsCategoryLabel,
  type IncomingSms,
  type SmsCategory,
} from '@/hooks/useIncomingSms'
import {
  useOutgoingSms,
  outgoingTypeOf,
  outgoingTypeLabel,
  maskOtp,
  OUTGOING_TYPES,
  type OutgoingSms,
  type OutgoingType,
} from '@/hooks/useOutgoingSms'
import { useCases } from '@/hooks/useCases'
import { usePageState } from '@/hooks/usePageState'
import type { Case } from '@/types/db'

// «الكل» = المهم فقط افتراضياً — استقبال كل الرسائل يعني ضجيجاً كثيراً
type Tab = 'important' | SmsCategory | 'all'

export function IncomingMessagesPage() {
  // الوارد افتراضياً — إشعارات الجرس توصل هنا لرسالة واردة مهمة
  const [tab, setTab] = usePageState('inbox:main-tab', 'incoming')

  return (
    // استثناء مقصود عن max-w-6xl: قوائم الرسائل نصية طويلة تُقرأ أفضل بعرض أضيق
    <div className="mx-auto max-w-4xl space-y-4">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        الرسائل
      </h2>
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="incoming">الوارد</TabsTrigger>
          <TabsTrigger value="outgoing">الصادر</TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="mt-4">
          <IncomingTab />
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          <OutgoingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function IncomingTab() {
  const { data, isLoading, isError, error, refetch } = useIncomingSms()
  const { data: cases } = useCases()
  const markReadM = useMarkSmsRead()
  const [search, setSearch] = usePageState('inbox:q', '')
  const [tab, setTab] = usePageState<Tab>('inbox:tab', 'important')

  // خريطة رقم المحكمة (أرقاماً فقط) ← القضية
  const byCourtNum = useMemo(() => {
    const m = new Map<string, Case>()
    for (const c of cases ?? []) {
      const n = (c.court_num ?? '').replace(/\D/g, '')
      if (n.length >= 7) m.set(n, c)
    }
    return m
  }, [cases])

  // عدّاد كل تصنيف (يُحسب على الكل لا على المعروض)
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of data ?? []) {
      const k = m.category ?? 'other'
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [data])

  const importantCount = (data ?? []).filter((m) => m.is_important).length
  const unread = (data ?? []).filter((m) => m.is_important && !m.read_at).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = data ?? []
    if (tab === 'important') rows = rows.filter((m) => m.is_important)
    else if (tab !== 'all') rows = rows.filter((m) => (m.category ?? 'other') === tab)
    if (!q) return rows
    return rows.filter((m) =>
      [m.recipient_name, m.phone, m.message]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [data, search, tab])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {fmtNumber(data?.length ?? 0)} رسالة واردة من اختصار الآيفون
          </p>
          {unread > 0 && (
            <p className="mt-0.5 text-sm font-medium text-gold">
              {fmtNumber(unread)} غير مقروءة تستحق نظرك
            </p>
          )}
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={markReadM.isPending}
            onClick={() => markReadM.mutate('all')}
          >
            <CheckCheck className="h-4 w-4" />
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      {/* شرائح التصنيف — الضجيج (إعلانات/رموز/شخصية) مخفيّ افتراضياً */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <FilterChip
          label="المهم"
          count={importantCount}
          active={tab === 'important'}
          onClick={() => setTab('important')}
        />
        {SMS_CATEGORIES.map((c) => {
          const n = counts.get(c.value) ?? 0
          if (n === 0) return null
          return (
            <FilterChip
              key={c.value}
              label={c.label}
              count={n}
              active={tab === c.value}
              onClick={() => setTab(c.value)}
            />
          )
        })}
        <FilterChip
          label="الكل"
          count={data?.length ?? 0}
          active={tab === 'all'}
          onClick={() => setTab('all')}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في المرسل أو نص الرسالة…"
          className="pr-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل الرسائل الواردة"
          error={error}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
          {filtered.map((m) => (
            <MessageRow key={m.id} m={m} matchedCase={matchCase(m, byCourtNum)} />
          ))}
        </div>
      )}
    </div>
  )
}

// إبراز الروابط داخل نص الرسالة (روابط ناجز وغيرها)
function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g)
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="break-all text-gold underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  )
}

// استخراج الأرقام الطويلة من النص ومطابقتها مع أرقام المحكمة
function matchCase(m: IncomingSms, byCourtNum: Map<string, Case>): Case | null {
  if (!m.message || byCourtNum.size === 0) return null
  for (const num of m.message.match(/\d{7,}/g) ?? []) {
    const c = byCourtNum.get(num)
    if (c) return c
  }
  return null
}

function MessageRow({
  m,
  matchedCase,
}: {
  m: IncomingSms
  matchedCase: Case | null
}) {
  const [, navigate] = useLocation()
  const { data: cases } = useCases()
  const linkM = useLinkSmsToCase()
  const reclassifyM = useReclassifySms()
  const [linkOpen, setLinkOpen] = useState(false)
  const [pickedCase, setPickedCase] = useState<string | null>(null)
  const senderIsPhone = m.phone && /\d{6,}/.test(m.phone)

  // الربط اليدوي المحفوظ يغلب المطابقة التلقائية
  const linked = m.case ?? null

  return (
    <div className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="gold" className="shrink-0">
          {m.recipient_name ||
            (m.phone ? <Ltr>{m.phone}</Ltr> : 'مجهول')}
        </Badge>
        {senderIsPhone && m.recipient_name && m.recipient_name !== m.phone && (
          <span dir="ltr" className="text-xs text-muted-foreground">
            {m.phone}
          </span>
        )}
        <Badge variant="outline" className="shrink-0 font-normal">
          {smsCategoryLabel(m.category)}
        </Badge>
        {m.is_important && !m.read_at && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gold"
            title="غير مقروءة"
          />
        )}
        <span className="mr-auto text-xs text-muted-foreground">
          {fmtDateTime(m.created_at)}
        </span>
      </div>
      {m.message && <MessageBody text={m.message} />}

      <div className="flex flex-wrap items-center gap-2">
        {/* تصحيح تصنيف خاطئ — التصنيف الآلي بالكلمات يخطئ أحياناً */}
        <Select
          value={m.category ?? 'other'}
          onValueChange={(v) =>
            reclassifyM.mutate({ id: m.id, category: v as SmsCategory })
          }
        >
          <SelectTrigger className="h-7 w-auto gap-1 border-none px-2 text-xs text-muted-foreground hover:bg-muted">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SMS_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {linked ? (
          <>
            <button
              onClick={() => navigate(`/cases/${linked.id}`)}
              className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
            >
              <Scale className="h-3.5 w-3.5 text-gold" />
              القضية: {linked.title || '—'}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="-m-1 h-8 w-8 text-muted-foreground hover:text-destructive"
              title="فك الربط"
              disabled={linkM.isPending}
              onClick={() => linkM.mutate({ smsId: m.id, caseId: null })}
            >
              {linkM.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        ) : (
          <>
            {matchedCase && (
              <button
                onClick={() => navigate(`/cases/${matchedCase.id}`)}
                className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
              >
                <Scale className="h-3.5 w-3.5 text-gold" />
                القضية: {matchedCase.title || matchedCase.court_num}
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                // إن وُجدت مطابقة تلقائية نقترحها جاهزة في المنتقي
                setPickedCase(matchedCase?.id ?? null)
                setLinkOpen(true)
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
              ربط بقضية
            </Button>
          </>
        )}
      </div>

      {/* اختيار القضية للربط الدائم */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ربط الرسالة بقضية</DialogTitle>
          </DialogHeader>
          <CasePicker
            cases={cases ?? []}
            value={pickedCase}
            onChange={setPickedCase}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!pickedCase || linkM.isPending}
              onClick={() =>
                pickedCase &&
                linkM.mutate(
                  { smsId: m.id, caseId: pickedCase },
                  { onSuccess: () => setLinkOpen(false) }
                )
              }
            >
              {linkM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ربط
            </Button>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا رسائل واردة بعد</p>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">
        الرسائل التي يلتقطها اختصار الآيفون (مثل إشعارات ناجز) ستظهر هنا
        تلقائياً.
      </p>
    </div>
  )
}

// ===== الصادر: رسائل النظام (تذكيرات/رموز/يدوي) من sms_log =====

function OutgoingTab() {
  const { data, isLoading, isError, error, refetch } = useOutgoingSms()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('outbox:q', '')
  const [typeFilter, setTypeFilter] = usePageState('outbox:type', 'all')
  const [statusFilter, setStatusFilter] = usePageState('outbox:status', 'all')

  const rows = useMemo(
    () => (data ?? []).map((m) => ({ ...m, type: outgoingTypeOf(m.sent_by) })),
    [data]
  )
  const failedCount = rows.filter((m) => m.status === 'failed').length
  // لا نعرض في الفلتر إلا الأنواع الموجودة فعلاً
  const presentTypes = useMemo(() => {
    const s = new Set(rows.map((m) => m.type))
    return OUTGOING_TYPES.filter((t) => s.has(t.value))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = rows
    if (statusFilter !== 'all') out = out.filter((m) => m.status === statusFilter)
    if (typeFilter !== 'all') out = out.filter((m) => m.type === typeFilter)
    if (!q) return out
    return out.filter((m) =>
      [m.recipient_name, m.phone, m.message, m.sent_by]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, search, typeFilter, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {fmtNumber(rows.length)} رسالة أرسلها النظام (آخر ٥٠٠)
        </p>
        {failedCount > 0 && (
          <button
            onClick={() => setStatusFilter('failed')}
            className="text-sm font-medium text-destructive hover:underline"
          >
            {fmtNumber(failedCount)} فاشلة — اعرضها
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم أو النص…"
            className="pr-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {presentTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="sent">نجحت</SelectItem>
            <SelectItem value="failed">فشلت</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل الرسائل الصادرة"
          error={error}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Send className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">لا رسائل صادرة</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            كل رسالة يرسلها النظام (تذكير، رمز دخول، إرسال يدوي…) ستظهر هنا.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
          {filtered.map((m) => (
            <OutgoingRow
              key={m.id}
              m={m}
              type={m.type}
              onOpenCase={(id) => navigate(`/cases/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OutgoingRow({
  m,
  type,
  onOpenCase,
}: {
  m: OutgoingSms
  type: OutgoingType
  onOpenCase: (caseId: string) => void
}) {
  const failed = m.status === 'failed'
  // رموز التحقق تُطمس أرقامها — السجل للمتابعة لا لقراءة الرموز
  const body = m.message ? (type === 'otp' ? maskOtp(m.message) : m.message) : null

  return (
    <div className={'space-y-1.5 px-4 py-3' + (failed ? ' bg-destructive/5' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={failed ? 'destructive' : 'success'} className="shrink-0">
          {failed ? 'فشلت' : 'نجحت'}
        </Badge>
        <Badge variant="outline" className="shrink-0 font-normal">
          {outgoingTypeLabel(type)}
        </Badge>
        <span className="text-sm font-medium text-foreground">
          {m.recipient_name || 'بدون اسم'}
        </span>
        {m.phone && (
          <span dir="ltr" className="text-xs text-muted-foreground">
            {m.phone}
          </span>
        )}
        <span className="mr-auto text-xs text-muted-foreground">
          {fmtDateTime(m.created_at)}
        </span>
      </div>
      {body && <MessageBody text={body} />}
      <div className="flex flex-wrap items-center gap-2">
        {/* الإرسال اليدوي يُنسب لصاحبه */}
        {type === 'manual' && m.sent_by && (
          <span className="text-xs text-muted-foreground">
            أرسلها: {m.sent_by}
          </span>
        )}
        {m.case && (
          <button
            onClick={() => onOpenCase(m.case!.id)}
            className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
          >
            <Scale className="h-3.5 w-3.5 text-gold" />
            القضية: {m.case.title || '—'}
          </button>
        )}
      </div>
    </div>
  )
}

// شريحة تصنيف — عدّادها من كامل الوارد لا من المعروض
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
        (active
          ? 'border-gold bg-gold text-navy'
          : 'border-border bg-card text-muted-foreground hover:bg-muted')
      }
    >
      {label}
      <span className={active ? 'opacity-80' : 'opacity-60'}>
        {fmtNumber(count)}
      </span>
    </button>
  )
}
