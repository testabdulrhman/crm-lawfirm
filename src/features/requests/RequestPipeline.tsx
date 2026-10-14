// مكوّنات «مسار العميل» في صفحة الطلب (2026-10-14): شريط المراحل بزرّ الخطوة التالية، وملفات العميل بملخص الذكاء،
// ورحلة الطلب. الفحوص (التعارض والعناية الواجبة والعقد…) قائمة تحقق على الجانب — لا توقف شيئاً.
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  FileSearch,
  FileWarning,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { daysLabel, fmtDatePref, fmtNumber } from '@/lib/format'
import { useSetRequestStage, useSummarizeRequest, useUploadAndSummarize } from '@/hooks/useRequests'
import type { GateState } from '@/hooks/useIntakeGates'
import type { IncomingRequest, RequestDocument, RequestStage } from '@/types/db'
import { STAGES, staleDays } from './labels'

/* ===================== شريط المراحل ===================== */

export function StageBar({
  request: r,
  onQuote,
  onReject,
}: {
  request: IncomingRequest
  onQuote: () => void
  onReject: () => void
}) {
  const [, navigate] = useLocation()
  const setStageM = useSetRequestStage()
  const stage = (r.stage ?? 'new') as RequestStage
  const idx = STAGES.findIndex((s) => s.value === stage)
  const rejected = r.status === 'rejected'
  const idle = staleDays(r.last_activity_at)

  const next = () => {
    switch (stage) {
      case 'new':
        return setStageM.mutate({ id: r.id, stage: 'contacted' })
      case 'contacted':
        return onQuote()
      case 'quoted':
        document.getElementById('onboarding-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      case 'contracted':
        window.dispatchEvent(new CustomEvent('request:convert'))
        return
      case 'opened':
        if (r.converted_to_id) navigate(`/cases/${r.converted_to_id}`)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* المراحل — الضغط على مرحلة ينقل الطلب إليها يدوياً (عدا فتح الملف: فعلٌ يُنشئه) */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGES.map((s, i) => {
            const done = i < idx
            const current = i === idx
            return (
              <div key={s.value} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={rejected || s.value === 'opened' || setStageM.isPending}
                  onClick={() => s.value !== stage && setStageM.mutate({ id: r.id, stage: s.value })}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    current && !rejected && 'bg-gold text-navy',
                    done && 'bg-gold/15 text-gold-700 dark:text-gold-300',
                    !current && !done && 'bg-muted text-muted-foreground hover:bg-muted/70',
                    rejected && 'opacity-60'
                  )}
                  title={s.value === 'opened' ? 'يُفتح الملف من زرّ الخطوة التالية' : `انقل إلى «${s.label}»`}
                >
                  {done && <Check className="h-3 w-3" />}
                  {s.label}
                </button>
                {i < STAGES.length - 1 && <span className="h-px w-3 shrink-0 bg-border" />}
              </div>
            )
          })}
        </div>

        {rejected ? (
          <p className="text-sm text-destructive">
            اعتذرنا عن هذا الطلب{r.rejection_reason ? ` — ${r.rejection_reason}` : ''}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="gold" onClick={next} disabled={setStageM.isPending}>
              {setStageM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              الخطوة التالية: {STAGES[idx]?.next}
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {stage !== 'opened' && (
              <Button variant="outline" className="text-destructive" onClick={onReject}>
                <X className="h-4 w-4" />
                اعتذار
              </Button>
            )}
            {stage !== 'opened' && idle >= 3 && (
              <span className="ms-auto text-xs font-medium text-destructive">بلا تحرّك منذ {daysLabel(idle)}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===================== ملفات العميل + ملخص الذكاء ===================== */

export function ClientFilesCard({ request: r, documents }: { request: IncomingRequest; documents: RequestDocument[] }) {
  const uploadM = useUploadAndSummarize()
  const sumM = useSummarizeRequest()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const s = r.docs_summary
  const busy = uploadM.isPending || sumM.isPending
  const live = documents.filter((d) => !d.deleted_at)

  const upload = (files: FileList | null) => {
    const list = Array.from(files ?? [])
    if (list.length) uploadM.mutate({ requestId: r.id, files: list })
  }

  return (
    <Card
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}
      className={cn(over && 'ring-2 ring-gold/60')}
    >
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-4 w-4 text-gold" />
          ملفات العميل وما اطّلعنا عليه
        </CardTitle>
        <div className="flex items-center gap-2">
          {s && live.length > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => sumM.mutate(r.id)}>
              <RefreshCw className={cn('h-3.5 w-3.5', sumM.isPending && 'animate-spin')} />
              تحديث الملخص
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {uploadM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploadM.isPending ? 'يُرفع ويُقرأ…' : 'إضافة ملفات'}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept="application/pdf,image/*,.docx"
            className="hidden"
            onChange={(e) => { upload(e.target.files); e.target.value = '' }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {busy && (
          <p className="flex items-center gap-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold-700 dark:text-gold-300">
            <Sparkles className="h-4 w-4 animate-pulse" />
            الذكاء يقرأ الملفات ويكتب الملخص — قد يستغرق دقيقة…
          </p>
        )}

        {!s && !busy && (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {live.length
              ? 'الملفات مرفوعة ولم تُلخَّص بعد — '
              : 'اسحب ملفات العميل هنا (صك، عقد، لائحة، صور…) أو اضغط «إضافة ملفات» — '}
            يقرؤها الذكاء ويكتب الوقائع والمهل والناقص، ويعبّي حقول الطلب الفارغة.
            {live.length > 0 && (
              <Button size="sm" variant="gold" className="mt-3" onClick={() => sumM.mutate(r.id)}>
                <Sparkles className="h-4 w-4" />
                لخّص الملفات
              </Button>
            )}
          </p>
        )}

        {s && (
          <div className="space-y-3 text-sm">
            <p className="text-base font-semibold leading-relaxed text-foreground">{s.headline}</p>

            {s.key_dates?.some((k) => k.is_deadline && k.due) && (
              <div className="space-y-1.5">
                {s.key_dates.filter((k) => k.is_deadline && k.due).map((k, i) => {
                  const left = Math.ceil((Date.parse(k.due!) - Date.now()) / 86400000)
                  return (
                    <p key={i} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                      left <= 7 ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300')}>
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      {k.label} — تنتهي {fmtDatePref(k.due)} · {left < 0 ? `فاتت منذ ${daysLabel(-left)}` : left === 0 ? 'اليوم' : `بعد ${daysLabel(left)}`}
                    </p>
                  )
                })}
              </div>
            )}

            <Section title="الوقائع">
              <ul className="list-disc space-y-1 pr-5">{s.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </Section>

            {(s.parties?.length > 0 || s.claim) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {s.parties?.length > 0 && (
                  <Section title="الأطراف" icon={Users}>
                    {s.parties.map((p, i) => <p key={i}><span className="text-muted-foreground">{p.role}:</span> {p.name}</p>)}
                  </Section>
                )}
                {s.claim && <Section title="المطالبة">{s.claim}</Section>}
              </div>
            )}

            {s.key_dates?.some((k) => !k.is_deadline) && (
              <Section title="تواريخ مهمة">
                {s.key_dates.filter((k) => !k.is_deadline).map((k, i) => (
                  <p key={i}>{k.label}{k.date ? ` — ${fmtDatePref(k.date)}` : k.date_hijri ? ` — ${k.date_hijri} هـ` : ''}</p>
                ))}
              </Section>
            )}

            {s.missing_docs?.length > 0 && (
              <Section title="نحتاج من العميل" icon={FileWarning} tone="warn">
                <ul className="list-disc space-y-0.5 pr-5">{s.missing_docs.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </Section>
            )}

            <Section title="انطباع أولي — مسودة للمحامي">
              <p className="leading-relaxed text-muted-foreground">{s.first_impression}</p>
            </Section>

            <p className="text-xs text-muted-foreground">
              قرأ {fmtNumber(s.read?.length ?? 0)} من الملفات
              {s.skipped?.length ? ` · تعذّر: ${s.skipped.join('، ')}` : ''}
              {r.docs_summary_at ? ` · ${fmtDatePref(r.docs_summary_at)}` : ''}
              {' · '}ملخص آلي يُراجَع قبل البناء عليه
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon?: typeof Users
  tone?: 'warn'
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl bg-muted/40 px-3 py-2.5', tone === 'warn' && 'bg-amber-50/70 dark:bg-amber-950/20')}>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </p>
      <div className="space-y-0.5 text-foreground">{children}</div>
    </div>
  )
}

/* ===================== رحلة الطلب ===================== */

export function JourneyCard({ request: r, gates }: { request: IncomingRequest; gates?: GateState }) {
  const ev: { at: string | null | undefined; text: string; warn?: boolean }[] = [
    { at: r.created_at ?? r.received_at, text: `وصل الطلب${r.source ? ` من ${r.source}` : ''}` },
    { at: r.assigned_at, text: `أُحيل إلى ${r.assigned_to_name ?? 'موظف'}` },
    { at: gates?.conflict?.checked_at, text: 'فحص التعارض' },
    { at: gates?.kyc?.checked_at, text: 'العناية الواجبة' },
    { at: r.docs_summary_at, text: 'لُخّصت ملفات العميل' },
    { at: r.quote_sent_at, text: `أُرسل عرض السعر${r.quote_amount != null ? ` (${fmtNumber(r.quote_amount)})` : ''}` },
    { at: r.contract_signed_at, text: 'وُقّع العقد' },
    { at: r.advance_received_at, text: 'استُلم المقدّم' },
    { at: r.decision_at, text: r.status === 'rejected' ? 'اعتذرنا' : 'القرار' },
    { at: r.converted_at, text: 'فُتح الملف' },
  ].filter((e) => !!e.at)
  ev.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const idle = staleDays(r.last_activity_at)
  if (r.status !== 'rejected' && r.stage !== 'opened' && idle >= 3) {
    ev.push({ at: r.last_activity_at, text: `بلا تحرّك منذ ${daysLabel(idle)} — يصل مسؤوله تذكير`, warn: true })
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">الرحلة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ev.map((e, i) => (
          <div key={i} className={cn('flex items-start gap-2 text-xs', e.warn && 'text-destructive')}>
            <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', e.warn ? 'bg-destructive' : 'bg-gold')} />
            <span className="flex-1">{e.text}</span>
            <span className="shrink-0 text-muted-foreground">{fmtDatePref(e.at)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
