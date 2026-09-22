import { useState } from 'react'
import { BellRing, CalendarClock, FileSignature, Gavel, Hand, Loader2, Save, Timer } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { QueryErrorState } from '@/components/QueryErrorState'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useNotificationRules,
  useNotificationSendCounts,
  useUpdateNotificationRule,
  type NotificationRecipient,
  type NotificationRule,
} from '@/hooks/useNotificationRules'

// قواعد الإشعارات — يضبط المدير **متى ولمن**، والإرسال يتم عبر نظام الـHub
// بالقالب المعتمد المذكور هنا (طلب المدير 2026-09-22).

const EVENT_META: Record<string, { label: string; icon: typeof Gavel; source: string }> = {
  session: { label: 'جلسة', icon: Gavel, source: 'من جدول الجلسات' },
  appointment: { label: 'موعد', icon: CalendarClock, source: 'من جدول المواعيد' },
  poa: { label: 'وكالة', icon: FileSignature, source: 'من جدول الوكالات' },
  deadline: { label: 'مهلة', icon: Timer, source: 'من جدول المهل' },
  manual: { label: 'يدوي', icon: Hand, source: 'يُرسل من الملف عند الحاجة' },
}

const RECIPIENTS: { value: NotificationRecipient; label: string }[] = [
  { value: 'client', label: 'الموكّل' },
  { value: 'assignee', label: 'مسؤول الملف' },
  { value: 'director', label: 'المدير' },
]

export function NotificationRulesTab() {
  const { data, isLoading, isError, error, refetch } = useNotificationRules()
  const { data: counts } = useNotificationSendCounts()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <QueryErrorState title="تعذّر تحميل قواعد الإشعارات" error={error} onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        هنا تحدّد <b>متى</b> يُرسل الإشعار و<b>لمن</b>. أما نص الرسالة نفسه فقالب معتمد من
        واتساب يملكه نظام <b>الـHub</b>، ولا تُفعَّل القاعدة قبل أن يُكتب اسم قالبها.
      </p>
      {(data ?? []).map((rule) => (
        <RuleCard key={rule.id} rule={rule} counts={counts?.[rule.id]} />
      ))}
    </div>
  )
}

function RuleCard({
  rule,
  counts,
}: {
  rule: NotificationRule
  counts?: { pending: number; sent: number; failed: number; skipped: number }
}) {
  const updateM = useUpdateNotificationRule()
  const meta = EVENT_META[rule.event_type] ?? EVENT_META.manual
  const Icon = meta.icon

  const [offsets, setOffsets] = useState((rule.offsets_days ?? []).join('، '))
  const [time, setTime] = useState((rule.send_at_time ?? '09:00').slice(0, 5))
  const [recipient, setRecipient] = useState<NotificationRecipient>(rule.recipient)
  const [template, setTemplate] = useState(rule.template_name ?? '')
  const [vars, setVars] = useState((rule.variables ?? []).join('\n'))

  const parsedOffsets = offsets
    .split(/[,،\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)

  const dirty =
    parsedOffsets.join(',') !== (rule.offsets_days ?? []).join(',') ||
    time !== (rule.send_at_time ?? '09:00').slice(0, 5) ||
    recipient !== rule.recipient ||
    template.trim() !== (rule.template_name ?? '') ||
    vars !== (rule.variables ?? []).join('\n')

  // بلا قالب معتمد لا تُفعَّل القاعدة — وإلا استُحق إشعار لا يمكن إرساله
  const canEnable = template.trim().length > 0

  const save = () =>
    updateM.mutate({
      id: rule.id,
      input: {
        offsets_days: parsedOffsets,
        send_at_time: `${time}:00`,
        recipient,
        template_name: template.trim() || null,
        variables: vars.split('\n').map((v) => v.trim()).filter(Boolean),
      },
    })

  return (
    <Card className={cn(!rule.is_active && 'border-dashed')}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-600 dark:text-gold-300">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{rule.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {rule.description || meta.source}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {counts && (counts.pending || counts.sent || counts.skipped || counts.failed) ? (
              <div className="flex flex-wrap items-center gap-1">
                {counts.pending > 0 && (
                  <Badge variant="outline" className="text-[11px]">
                    بانتظار الإرسال {fmtNumber(counts.pending)}
                  </Badge>
                )}
                {counts.sent > 0 && (
                  <Badge variant="outline" className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    أُرسل {fmtNumber(counts.sent)}
                  </Badge>
                )}
                {counts.skipped > 0 && (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    تُخطّي {fmtNumber(counts.skipped)}
                  </Badge>
                )}
                {counts.failed > 0 && (
                  <Badge variant="destructive" className="text-[11px]">
                    فشل {fmtNumber(counts.failed)}
                  </Badge>
                )}
              </div>
            ) : null}

            <div className="flex items-center gap-2 rounded-xl border px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {rule.is_active ? 'مفعّلة' : 'معطّلة'}
              </span>
              <Switch
                checked={rule.is_active}
                disabled={updateM.isPending || (!rule.is_active && !canEnable)}
                onCheckedChange={(v) =>
                  updateM.mutate({ id: rule.id, input: { is_active: v } })
                }
              />
            </div>
          </div>
        </div>

        {!canEnable && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            تنتظر قالباً معتمداً من الـHub. اكتب اسم القالب هنا بعد اعتماده ليصير التفعيل ممكناً.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="التذكير قبل (أيام)" hint="افصل بفاصلة. 0 = يوم الحدث نفسه">
            <Input
              value={offsets}
              onChange={(e) => setOffsets(e.target.value)}
              dir="ltr"
              className="text-right"
              placeholder="30، 7، 1"
              disabled={rule.event_type === 'manual'}
            />
          </Field>

          <Field label="ساعة الإرسال" hint="بتوقيت الرياض">
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={rule.event_type === 'manual'}
            />
          </Field>

          <Field label="المستلم">
            <div className="flex gap-1">
              {RECIPIENTS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRecipient(r.value)}
                  className={cn(
                    'flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                    recipient === r.value
                      ? 'border-transparent bg-gold text-navy'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="اسم القالب المعتمد" hint="كما اعتمده واتساب لدى الـHub">
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              dir="ltr"
              className="text-right"
              placeholder="session_reminder_client"
            />
          </Field>
        </div>

        <Field
          label="متغيّرات القالب بالترتيب"
          hint="سطر لكل متغيّر، مثل contact.name أو session.session_date|date_ar"
        >
          <Textarea
            value={vars}
            onChange={(e) => setVars(e.target.value)}
            dir="ltr"
            className="min-h-[92px] text-right font-mono text-xs"
          />
        </Field>

        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-muted-foreground">تعديلات غير محفوظة</span>}
          <Button size="sm" onClick={save} disabled={!dirty || updateM.isPending}>
            {updateM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export const NotificationRulesIcon = BellRing
