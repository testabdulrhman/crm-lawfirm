// مراقبة الاتصالات — صفحة المدير على منصة redwan-hub.
// تجيب أربعة أسئلة: وش صار اليوم؟ وش فشل؟ مين ما تعرّفنا عليه؟ وليش وُجّه هذا الحدث هنا؟
//
// قراءة فقط عدا أرقام الفريق. والوصول محروس مرتين: الحاجز الحقيقي في الدالة
// (hub-monitor ترفض غير المدير بـ 403)، وهذا الفحص هنا لئلا يرى غيرُه صفحةً فارغة محيّرة.
import { useState } from 'react'
import {
  Activity, AlertTriangle, ChevronDown, Loader2, Phone, RefreshCw, Search,
  ShieldCheck, UserPlus, Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Ltr } from '@/components/Ltr'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useHubEvent, useHubPhone, useHubStaff, useHubStaffSet, useHubSummary,
  type DayCounts, type HubSummary, type PhoneReport, type StaffRow, type TimelineItem,
} from '@/hooks/useHubMonitor'
import { errMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

// ---------- أدوات عرض ----------
const n = (v: number | undefined | null) => (v ?? 0).toLocaleString('en-US')

function Delta({ today, yesterday }: { today?: number; yesterday?: number }) {
  const t = today ?? 0
  const y = yesterday ?? 0
  const d = t - y
  if (d === 0) return <span className="text-xs text-muted-foreground">= أمس</span>
  return (
    <span className={cn('text-xs', d > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
      {d > 0 ? '↑' : '↓'} <Ltr>{n(Math.abs(d))}</Ltr> عن أمس
    </span>
  )
}

function Stat({
  label, value, sub, tone = 'default',
}: { label: string; value: number; sub?: React.ReactNode; tone?: 'default' | 'danger' | 'gold' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn(
          'mt-1 text-2xl font-bold',
          tone === 'danger' && value > 0 ? 'text-destructive' : tone === 'gold' ? 'text-gold-600' : 'text-foreground',
        )}>
          <Ltr>{n(value)}</Ltr>
        </p>
        {sub ? <div className="mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

const SYSTEM_LABEL: Record<string, string> = {
  law: 'المكتب', bankruptcy: 'الإفلاس', both: 'النظامين', internal: 'داخلي',
}
const REASON_LABEL: Record<string, string> = {
  index_match: 'مطابقة الفهرس',
  customer_choice: 'اختيار العميل',
  live_fallback: 'استعلام حي',
  default: 'افتراضي',
  bound: 'ربط سابق',
  human_takeover: 'موظف يتولّى',
  rate_limited: 'حد الرسائل',
  system_request: 'طلب من نظام',
  internal: 'رقم موظف',
}
const VIA_LABEL: Record<string, string> = {
  type: 'مصنّف عميلاً',
  active_case: 'له ملف نشط',
  active_request: 'له طلب نشط',
  counterparty: 'طرف مقابل',
}

// ---------- الإنذارات ----------
function Alerts({ s }: { s: HubSummary }) {
  const a = s.alerts
  const items: { label: string; value: string }[] = []
  if (a.rejected_signatures > 0) items.push({ label: 'أحداث مرفوضة التوقيع (24 ساعة)', value: n(a.rejected_signatures) })
  if (a.stuck_events > 0) items.push({ label: 'أحداث عالقة أو فاشلة', value: n(a.stuck_events) })
  if (a.failed_notifications > 0) items.push({ label: 'إخطارات فشلت نهائياً', value: n(a.failed_notifications) })
  if (a.pending_notifications_old > 0) items.push({ label: 'إخطارات معلّقة أكثر من ربع ساعة', value: n(a.pending_notifications_old) })
  if (a.failed_outbound > 0) items.push({ label: 'رسائل صادرة فاشلة (24 ساعة)', value: n(a.failed_outbound) })
  if (a.stuck_outbound > 0) items.push({ label: 'رسائل عالقة في الطابور', value: n(a.stuck_outbound) })
  if (a.rate_limited_phones > 0) items.push({ label: 'أرقام ضربت حد الرسائل الآلية', value: n(a.rate_limited_phones) })
  if (a.worker_minutes_ago != null && a.worker_minutes_ago > 5) {
    items.push({ label: 'العامل المجدول متأخر', value: `${n(a.worker_minutes_ago)} دقيقة` })
  }
  if (a.full_sync_hours_ago == null) items.push({ label: 'المزامنة الكاملة', value: 'لم تُسجَّل بعد' })
  else if (a.full_sync_hours_ago > 30) items.push({ label: 'المزامنة الكاملة متأخرة', value: `${n(a.full_sync_hours_ago)} ساعة` })

  if (items.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="flex items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">لا إنذارات</p>
            <p className="text-emerald-800/80 dark:text-emerald-300/80">
              الطوابير نظيفة، والعامل يعمل، والفهرس فيه <Ltr>{n(a.index_rows)}</Ltr> رقماً.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <p className="font-semibold">يحتاج نظرك ({n(items.length)})</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{i.label}</span>
              <span className="font-semibold text-destructive"><Ltr>{i.value}</Ltr></span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------- لوحة اليوم ----------
function Today({ s }: { s: HubSummary }) {
  const c: DayCounts = s.calls.today ?? { total: 0 }
  const cy: DayCounts = s.calls.yesterday ?? { total: 0 }
  const wi: DayCounts = s.whatsapp_in.today ?? { total: 0 }
  const wiy: DayCounts = s.whatsapp_in.yesterday ?? { total: 0 }
  const wo: DayCounts = s.whatsapp_out.today ?? { total: 0 }
  const woy: DayCounts = s.whatsapp_out.yesterday ?? { total: 0 }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="مكالمات اليوم" value={c.total} sub={<Delta today={c.total} yesterday={cy.total} />} />
        <Stat label="منها مُجابة" value={c.answered ?? 0} />
        <Stat label="منها فائتة" value={c.missed ?? 0} tone="danger" />
        <Stat label="رسائل واردة" value={wi.total} sub={<Delta today={wi.total} yesterday={wiy.total} />} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="وارد للمكتب" value={wi.law ?? 0} />
        <Stat label="وارد للإفلاس" value={wi.bankruptcy ?? 0} />
        <Stat label="وارد داخلي (الفريق)" value={wi.internal ?? 0} />
        <Stat
          label="رسائل صادرة"
          value={wo.total}
          sub={
            <div className="space-y-0.5">
              <span className="block text-xs text-muted-foreground">
                بوت <Ltr>{n(wo.bot)}</Ltr> · أنظمة <Ltr>{n((wo.law ?? 0) + (wo.bankruptcy ?? 0))}</Ltr>
                {(wo.failed ?? 0) > 0 ? <span className="text-destructive"> · فشل <Ltr>{n(wo.failed)}</Ltr></span> : null}
              </span>
              <Delta today={wo.total} yesterday={woy.total} />
            </div>
          }
        />
      </div>
      {(wi.both ?? 0) > 0 || (wi.undecided ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          وفي الوارد اليوم: <Ltr>{n(wi.both)}</Ltr> في النظامين، و<Ltr>{n(wi.undecided)}</Ltr> بلا قرار بعد.
        </p>
      ) : null}
    </div>
  )
}

// ---------- الجدد ----------
function Newcomers({ s, onPick }: { s: HubSummary; onPick: (p: string) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-gold-600" /> أرقام لا نعرفها ({n(s.new_contacts.length)})
          </p>
          {s.new_contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا أحد جديد هذا الأسبوع.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {s.new_contacts.slice(0, 12).map((x) => (
                <li key={x.phone}>
                  <button
                    type="button"
                    onClick={() => onPick(x.phone)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-muted"
                  >
                    <span className="truncate">{x.name || 'بلا اسم'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <Ltr>{x.phone}</Ltr> · <Ltr>{x.last_at}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold">طلبات سجّلها البوت ({n(s.bot_requests.length)})</p>
          {s.bot_requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا طلبات بعد.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.bot_requests.slice(0, 10).map((r, i) => (
                <li key={`${r.phone}-${i}`} className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.name || 'بلا اسم'}</span>
                    <span className="text-xs text-muted-foreground"><Ltr>{r.at}</Ltr></span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.request_label || '—'}{r.city ? ` · ${r.city}` : ''}
                    {r.partial ? ' · غير مكتمل' : ''}
                    {r.status !== 'delivered' ? ` · لم يصل بعد (${r.status})` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold">تأهيل متوقف ({n(s.stalled_intakes.length)})</p>
          {s.stalled_intakes.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا أحد توقف في منتصف الأسئلة.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {s.stalled_intakes.slice(0, 12).map((x) => (
                <li key={x.phone}>
                  <button
                    type="button"
                    onClick={() => onPick(x.phone)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-muted"
                  >
                    <span className="truncate">{x.name || 'بلا اسم'} — {x.step ?? '—'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">منذ <Ltr>{n(x.hours)}</Ltr> ساعة</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- الحدث الخام ----------
function RawEvent({ id }: { id: number }) {
  const { data, isLoading, error } = useHubEvent(id)
  if (isLoading) return <p className="p-3 text-xs text-muted-foreground">يُحمّل…</p>
  if (error) return <p className="p-3 text-xs text-destructive">{errMessage(error)}</p>
  return (
    <pre dir="ltr" className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

// ---------- الخط الزمني لرقم ----------
function PhoneView({ r }: { r: PhoneReport }) {
  const [rawFor, setRawFor] = useState<number | null>(null)

  if (r.not_found && (!r.index || r.index.length === 0) && !r.staff) {
    return <p className="py-6 text-center text-sm text-muted-foreground">لا أثر لهذا الرقم في الـ Hub.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.staff ? <Badge className="bg-navy text-white">موظف: {r.staff.name}{r.staff.active ? '' : ' (موقوف)'}</Badge> : null}
        {r.flags?.law_client ? <Badge variant="secondary">عميل المكتب</Badge> : null}
        {r.flags?.law && !r.flags?.law_client ? <Badge variant="outline">جهة اتصال بالمكتب</Badge> : null}
        {r.flags?.bankruptcy ? <Badge variant="secondary">دائن في الإفلاس</Badge> : null}
        {r.conversation?.state ? <Badge variant="outline">المحادثة: {r.conversation.state}</Badge> : null}
        {r.conversation?.assigned_system ? (
          <Badge variant="outline">مسندة إلى {SYSTEM_LABEL[r.conversation.assigned_system] ?? r.conversation.assigned_system}</Badge>
        ) : null}
      </div>

      {r.index?.length ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">التصنيف في الفهرس</p>
            {r.index.map((i, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <Badge variant="outline">{SYSTEM_LABEL[i.system] ?? i.system}</Badge>
                <span className="font-medium">{i.name || '—'}</span>
                <span className="text-xs text-muted-foreground">
                  {i.kind === 'client' ? 'عميل' : i.kind === 'creditor' ? 'دائن' : i.kind === 'counterparty' ? 'طرف مقابل' : i.kind}
                  {i.via ? ` · ${VIA_LABEL[i.via] ?? i.via}` : ''}
                  {i.matter_ref ? ` · ${i.matter_ref}` : ''}
                </span>
                <span className="ms-auto text-xs text-muted-foreground"><Ltr>{i.external_id}</Ltr></span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {r.decisions?.length ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">قرارات التوجيه — لماذا ذهب هنا</p>
            {r.decisions.slice(0, 15).map((d, k) => (
              <div key={k} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground"><Ltr>{d.at}</Ltr></span>
                  <Badge variant="outline">{d.channel === 'call' ? 'مكالمة' : 'واتساب'}</Badge>
                  <Badge>{d.system ? SYSTEM_LABEL[d.system] ?? d.system : 'بلا وجهة'}</Badge>
                  <span className="text-xs">{REASON_LABEL[d.reason] ?? d.reason}</span>
                  {d.confidence != null ? (
                    <span className="text-xs text-muted-foreground">ثقة <Ltr>{d.confidence}</Ltr></span>
                  ) : null}
                  {d.event_id ? (
                    <button
                      type="button"
                      onClick={() => setRawFor(rawFor === d.event_id ? null : (d.event_id as number))}
                      className="ms-auto text-xs text-gold-600 hover:underline"
                    >
                      التفاصيل <ChevronDown className={cn('inline h-3 w-3', rawFor === d.event_id && 'rotate-180')} />
                    </button>
                  ) : null}
                </div>
                {rawFor && rawFor === d.event_id ? <RawEvent id={rawFor} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {r.timeline?.length ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">الخط الزمني ({n(r.timeline.length)})</p>
            {r.timeline.map((t: TimelineItem, k) => (
              <div key={k} className={cn(
                'rounded-lg px-3 py-2 text-sm',
                t.kind === 'call' ? 'bg-navy/5' : t.direction === 'in' ? 'bg-muted/50' : 'bg-gold-50 dark:bg-gold-900/10',
              )}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Ltr>{t.at}</Ltr>
                  <span>·</span>
                  <span>
                    {t.kind === 'call'
                      ? `مكالمة ${t.direction === 'inbound' ? 'واردة' : 'صادرة'} — ${t.status ?? ''}`
                      : t.direction === 'in' ? 'رسالة واردة'
                      : t.sender === 'bot' ? 'رد البوت'
                      : t.sender === 'staff' ? 'رد موظف من لوحة هاتف'
                      : `رسالة صادرة${t.system ? ` (${SYSTEM_LABEL[t.system] ?? t.system})` : ''}`}
                  </span>
                  {t.duration ? <span>· <Ltr>{t.duration}</Ltr></span> : null}
                  {t.agent ? <span>· {t.agent}</span> : null}
                </div>
                {t.body ? <p className="mt-1 whitespace-pre-wrap">{t.body}</p> : null}
                {t.summary ? <p className="mt-1 text-muted-foreground">ملخص: {t.summary}</p> : null}
                {t.media ? <a href={t.media} target="_blank" rel="noreferrer" className="text-xs text-gold-600 hover:underline">مرفق</a> : null}
                {t.recording ? <a href={t.recording} target="_blank" rel="noreferrer" className="text-xs text-gold-600 hover:underline">تسجيل المكالمة</a> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ---------- أرقام الفريق ----------
function StaffSection() {
  const { data, isLoading, error } = useHubStaff()
  const setStaff = useHubStaffSet()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const save = async (v: { phone: string; name: string; role?: string | null; active: boolean }) => {
    setMsg(null)
    try {
      const res = await setStaff.mutateAsync(v)
      if (res?.error) setMsg(res.error)
      else { setPhone(''); setName(''); setRole('') }
    } catch (e) {
      setMsg(errMessage(e) ?? 'تعذّر الحفظ')
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold-600" />
          <p className="text-sm font-semibold">أرقام الفريق</p>
          <span className="text-xs text-muted-foreground">
            الرقم المفعّل هنا: اتصاله داخلي — لا رد آلي، ولا إخطار، ولا تذكرة.
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="الجوال (05…)" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          <Input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="الدور (اختياري)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button
            onClick={() => save({ phone, name, role: role || null, active: true })}
            disabled={setStaff.isPending || !phone.trim() || !name.trim()}
          >
            {setStaff.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إضافة وتفعيل'}
          </Button>
        </div>
        {msg ? <p className="text-sm text-destructive">{msg}</p> : null}

        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-destructive">{errMessage(error)}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {(data ?? []).map((s: StaffRow) => (
              <li key={s.phone} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <Ltr>{s.phone}</Ltr>{s.role ? ` · ${s.role}` : ''}
                    {s.changed_by ? ` · آخر تغيير: ${s.changed_by}` : ''}
                    {s.changed_at ? ` (${s.changed_at})` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs', s.active ? 'text-emerald-600' : 'text-muted-foreground')}>
                    {s.active ? 'مفعّل' : 'موقوف'}
                  </span>
                  <Switch
                    checked={s.active}
                    disabled={setStaff.isPending}
                    onCheckedChange={(v) => save({ phone: s.phone, name: s.name, role: s.role, active: v })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- الصفحة ----------
export function HubMonitorPage() {
  const isDirector = useIsDirector()
  const [query, setQuery] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const summary = useHubSummary()
  const report = useHubPhone(phone)

  if (!isDirector) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          هذه الصفحة للمدير وحده.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-navy/10 text-navy">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">مراقبة الاتصالات</h1>
            <p className="text-sm text-muted-foreground">
              منصة الاتصالات الموحّدة — الرقم 920032760
              {summary.data ? <> · حُدّثت <Ltr>{summary.data.generated_at}</Ltr></> : null}
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" title="تحديث"
          onClick={() => summary.refetch()} disabled={summary.isFetching}>
          <RefreshCw className={cn('h-4 w-4', summary.isFetching && 'animate-spin')} />
        </Button>
      </div>

      {summary.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : summary.error ? (
        <Card><CardContent className="py-8 text-center text-sm text-destructive">
          تعذّر تحميل اللوحة: {errMessage(summary.error)}
        </CardContent></Card>
      ) : summary.data ? (
        <>
          <Alerts s={summary.data} />
          <Today s={summary.data} />

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-gold-600" /> بحث برقم
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setPhone(query.trim() || null) }}
              >
                <Input dir="ltr" placeholder="05xxxxxxxx أو 9665xxxxxxxx"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                <Button type="submit" disabled={query.replace(/\D/g, '').length < 9}>
                  <Phone className="me-2 h-4 w-4" /> عرض
                </Button>
              </form>
              {report.isFetching ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : report.error ? (
                <p className="text-sm text-destructive">{errMessage(report.error)}</p>
              ) : report.data ? (
                <PhoneView r={report.data} />
              ) : null}
            </CardContent>
          </Card>

          <Newcomers s={summary.data} onPick={(p) => { setQuery(p); setPhone(p) }} />
          <StaffSection />
        </>
      ) : null}
    </div>
  )
}
