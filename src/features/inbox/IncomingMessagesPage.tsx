// الرسائل الواردة — المسجّلة تلقائياً من اختصار الآيفون (ناجز وغيرها)
// الربط بالقضية: يدوي دائم (case_id) أو تلقائي بمطابقة أرقام المحكمة في النص
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Link2, Loader2, MessageSquare, Scale, Search, X } from 'lucide-react'

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
import { CasePicker } from '@/components/CasePicker'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import {
  useIncomingSms,
  useLinkSmsToCase,
  type IncomingSms,
} from '@/hooks/useIncomingSms'
import { useCases } from '@/hooks/useCases'
import { usePageState } from '@/hooks/usePageState'
import type { Case } from '@/types/db'

export function IncomingMessagesPage() {
  const { data, isLoading } = useIncomingSms()
  const { data: cases } = useCases()
  const [search, setSearch] = usePageState('inbox:q', '')

  // خريطة رقم المحكمة (أرقاماً فقط) ← القضية
  const byCourtNum = useMemo(() => {
    const m = new Map<string, Case>()
    for (const c of cases ?? []) {
      const n = (c.court_num ?? '').replace(/\D/g, '')
      if (n.length >= 7) m.set(n, c)
    }
    return m
  }, [cases])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((m) =>
      [m.recipient_name, m.phone, m.message]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [data, search])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        الرسائل الواردة{' '}
        <span className="text-base font-normal text-muted-foreground">
          ({fmtNumber(data?.length ?? 0)})
        </span>
      </h2>

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
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
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
  const [linkOpen, setLinkOpen] = useState(false)
  const [pickedCase, setPickedCase] = useState<string | null>(null)
  const senderIsPhone = m.phone && /\d{6,}/.test(m.phone)

  // الربط اليدوي المحفوظ يغلب المطابقة التلقائية
  const linked = m.case ?? null

  return (
    <div className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="gold" className="shrink-0">
          {m.recipient_name || m.phone || 'مجهول'}
        </Badge>
        {senderIsPhone && m.recipient_name && m.recipient_name !== m.phone && (
          <span dir="ltr" className="text-xs text-muted-foreground">
            {m.phone}
          </span>
        )}
        <span className="mr-auto text-xs text-muted-foreground">
          {fmtDateTime(m.created_at)}
        </span>
      </div>
      {m.message && <MessageBody text={m.message} />}

      <div className="flex flex-wrap items-center gap-2">
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
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              title="فك الربط"
              onClick={() => linkM.mutate({ smsId: m.id, caseId: null })}
            >
              <X className="h-3.5 w-3.5" />
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
              className="h-7 text-xs"
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
