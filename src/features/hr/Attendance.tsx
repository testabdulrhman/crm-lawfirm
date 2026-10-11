// الحضور والغياب (طلب المدير 2026-10-11): نافذة التسجيل، ولوحة «الحضور والغياب» في صفحة الإجازات (للمدير وراكان)،
// وبطاقة الموظف في صفحته (يراها صاحبها بلا إشعار). الخصم يُقترح هنا ويعتمده المدير وحده.
import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  Briefcase,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileHeart,
  Loader2,
  LogOut,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserX,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtDatePref, fmtNumber, localISO, todayISO } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { useAuth } from '@/stores/auth'
import { useCanViewOffice, useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  KIND_LABEL,
  attendanceAttachmentUrl,
  suggestedDayWage,
  useAbsenceSuggestions,
  useAttendance,
  useDecideDeduction,
  useDeleteAttendance,
  usePendingDeductions,
  useSaveAttendance,
  type AttendanceKind,
  type AttendanceRecord,
} from '@/hooks/useAttendance'

const KIND_ICON: Record<AttendanceKind, LucideIcon> = {
  absent: UserX,
  excused: FileHeart,
  late: AlarmClock,
  early_leave: LogOut,
  field: Briefcase,
}
const KIND_BADGE: Record<AttendanceKind, 'destructive' | 'warning' | 'secondary' | 'gold' | 'success'> = {
  absent: 'destructive',
  excused: 'secondary',
  late: 'warning',
  early_leave: 'warning',
  field: 'success',
}
const KINDS = Object.keys(KIND_LABEL) as AttendanceKind[]

const nameOf = (m?: { name: string | null; short_name: string | null } | null) => m?.short_name || m?.name || '—'

/** حدود الشهر بصيغة YYYY-MM-DD */
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (ym: string) =>
  new Date(`${ym}-15`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' })

/* ===================== نافذة التسجيل ===================== */

export interface RecordDraft {
  id?: string
  member_id?: string
  day?: string
  kind?: AttendanceKind
  minutes?: number | null
  note?: string | null
  proposeDeduction?: boolean
  deductionAmount?: number | null
}

export function RecordAttendanceDialog({
  draft,
  onClose,
  lockMember = false,
}: {
  draft: RecordDraft | null
  onClose: () => void
  lockMember?: boolean
}) {
  const isDirector = useIsDirector()
  const { data: members } = useTeamMembers()
  const saveM = useSaveAttendance()
  const [memberId, setMemberId] = useState('')
  const [day, setDay] = useState(todayISO())
  const [kind, setKind] = useState<AttendanceKind>('absent')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [propose, setPropose] = useState(false)
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!draft) return
    setMemberId(draft.member_id ?? '')
    setDay(draft.day ?? todayISO())
    setKind(draft.kind ?? 'absent')
    setMinutes(draft.minutes ? String(draft.minutes) : '')
    setNote(draft.note ?? '')
    setPropose(!!draft.proposeDeduction)
    setAmount(draft.deductionAmount ? String(draft.deductionAmount) : '')
    setFile(null)
  }, [draft])

  // مبلغ مقترح من آخر راتب مسجّل — يظهر للمدير (الرواتب لا يقرؤها غيره)
  useEffect(() => {
    if (!propose || amount || !memberId || !isDirector) return
    let alive = true
    void suggestedDayWage(memberId).then((v) => {
      if (alive && v) setAmount(String(v))
    })
    return () => {
      alive = false
    }
  }, [propose, memberId, amount, isDirector])

  const staff = (members ?? []).filter((m) => m.is_active && !m.is_reviewer && (m as { member_type?: string }).member_type !== 'collaborator')
  const needsMinutes = kind === 'late' || kind === 'early_leave'
  const valid = !!memberId && !!day && (!needsMinutes || Number(minutes) > 0)

  const submit = () =>
    saveM.mutate(
      {
        id: draft?.id,
        member_id: memberId,
        day,
        kind,
        minutes: needsMinutes ? Number(minutes) : null,
        note,
        proposeDeduction: kind === 'absent' && propose,
        deductionAmount: amount ? Number(amount) : null,
        file,
      },
      { onSuccess: onClose }
    )

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && !saveM.isPending && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft?.id ? 'تعديل السجل' : 'تسجيل حضور / غياب'}</DialogTitle>
          <DialogDescription>يظهر للموظف في صفحته دون إشعار.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>الموظف</Label>
              <Select value={memberId} onValueChange={setMemberId} disabled={lockMember || !!draft?.id}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.short_name || m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att_day">اليوم</Label>
              <Input id="att_day" type="date" value={day} max={todayISO()} onChange={(e) => setDay(e.target.value)} />
              {day && <p className="text-xs text-muted-foreground">{fmtDatePref(day)}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition-colors',
                    kind === k ? 'border-gold bg-gold/10 font-semibold text-foreground' : 'border-border text-foreground/70 hover:bg-muted'
                  )}
                >
                  <Icon className={cn('h-5 w-5', kind === k ? 'text-gold' : 'text-muted-foreground')} />
                  {KIND_LABEL[k]}
                </button>
              )
            })}
          </div>

          {needsMinutes && (
            <div className="space-y-1.5">
              <Label htmlFor="att_min">{kind === 'late' ? 'مدة التأخير (دقيقة)' : 'قبل نهاية الدوام بـ (دقيقة)'}</Label>
              <Input id="att_min" dir="ltr" type="number" min={1} max={720} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="att_note">ملاحظة</Label>
            <Textarea
              id="att_note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === 'field' ? 'مثال: جلسة في المحكمة التجارية' : kind === 'excused' ? 'مثال: مراجعة مستشفى' : ''}
            />
          </div>

          {kind === 'excused' && isDirector && (
            <div className="space-y-1.5">
              <Label>مرفق العذر (اختياري)</Label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted">
                <Paperclip className="h-4 w-4" />
                {file ? file.name : 'تقرير طبي أو ما يثبت العذر — لا يراه إلا أنت والموظف'}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}

          {kind === 'absent' && (
            <div className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">اقتراح خصم يوم</p>
                  <p className="text-xs text-muted-foreground">لا يدخل مسيّر الرواتب إلا باعتماد المدير</p>
                </div>
                <Switch checked={propose} onCheckedChange={setPropose} aria-label="اقتراح خصم" />
              </div>
              {propose && (
                <div className="space-y-1.5">
                  <Label htmlFor="att_amt">المبلغ (ريال)</Label>
                  <Input
                    id="att_amt"
                    dir="ltr"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={isDirector ? 'يُقترح من آخر راتب ÷ ٣٠' : 'يحدده المدير عند الاعتماد'}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saveM.isPending}>
            إلغاء
          </Button>
          <Button variant="gold" onClick={submit} disabled={!valid || saveM.isPending}>
            {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== صفّ سجل ===================== */

function RecordRow({
  r,
  showMember,
  canEdit,
  canDelete,
  onEdit,
}: {
  r: AttendanceRecord
  showMember: boolean
  canEdit: boolean
  canDelete: boolean
  onEdit: (r: AttendanceRecord) => void
}) {
  const { teamMember } = useAuth()
  const delM = useDeleteAttendance()
  const Icon = KIND_ICON[r.kind]
  const openAttachment = async () => {
    try {
      openExternal(await attendanceAttachmentUrl(r.attachment_url!))
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر فتح المرفق', description: errMessage(e) })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {showMember && <span className="font-medium text-foreground">{nameOf(r.member)}</span>}
          <Badge variant={KIND_BADGE[r.kind]}>{KIND_LABEL[r.kind]}</Badge>
          {r.minutes ? <span className="text-xs text-muted-foreground">{fmtNumber(r.minutes)} دقيقة</span> : null}
          {r.deduction_status === 'proposed' && <Badge variant="warning">خصم مقترح</Badge>}
          {r.deduction_status === 'approved' && (
            <Badge variant="destructive">خُصم {r.deduction_amount ? fmtNumber(r.deduction_amount) + ' ريال' : ''}</Badge>
          )}
          {r.deduction_status === 'rejected' && <Badge variant="secondary">بلا خصم</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDatePref(r.day)}
          {r.note ? ` · ${r.note}` : ''}
          {r.recorder ? ` · سجّله ${nameOf(r.recorder)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {r.attachment_url && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={openAttachment}>
            <Paperclip className="h-3.5 w-3.5" />
            المرفق
          </Button>
        )}
        {canEdit && r.deduction_status !== 'approved' && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(r)} aria-label="تعديل">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && r.deduction_status !== 'approved' && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            disabled={delM.isPending}
            onClick={() => {
              if (confirm('حذف هذا السجل؟')) delM.mutate({ id: r.id, by: teamMember?.name ?? null })
            }}
            aria-label="حذف"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

const toDraft = (r: AttendanceRecord): RecordDraft => ({
  id: r.id,
  member_id: r.member_id,
  day: r.day,
  kind: r.kind,
  minutes: r.minutes,
  note: r.note,
  proposeDeduction: r.deduction_status === 'proposed',
  deductionAmount: r.deduction_amount,
})

/** عدّاد الشهر حسب النوع */
function KindCounts({ records }: { records: AttendanceRecord[] }) {
  const counts = useMemo(() => {
    const c: Partial<Record<AttendanceKind, number>> = {}
    for (const r of records) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [records])
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {KINDS.map((k) => {
        const Icon = KIND_ICON[k]
        return (
          <div key={k} className="rounded-xl bg-muted/60 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {KIND_LABEL[k]}
            </p>
            <p className="text-lg font-bold text-foreground">{fmtNumber(counts[k] ?? 0)}</p>
          </div>
        )
      })}
    </div>
  )
}

function MonthSwitcher({ ym, onChange }: { ym: string; onChange: (v: string) => void }) {
  const current = todayISO().slice(0, 7)
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-1">
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(shiftMonth(ym, -1))} aria-label="الشهر السابق">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="min-w-28 text-center text-sm font-medium">{monthLabel(ym)}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={ym >= current}
        onClick={() => onChange(shiftMonth(ym, 1))}
        aria-label="الشهر التالي"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  )
}

/* ===================== لوحة «الحضور والغياب» (المدير وراكان) ===================== */

export function AttendancePanel() {
  const isDirector = useIsDirector()
  const canView = useCanViewOffice()
  const [ym, setYm] = useState(todayISO().slice(0, 7))
  const range = monthRange(ym)
  const { data: records, isLoading } = useAttendance(range)
  const { data: suggestions } = useAbsenceSuggestions(canView)
  const { data: pending } = usePendingDeductions(isDirector)
  const saveM = useSaveAttendance()
  const [draft, setDraft] = useState<RecordDraft | null>(null)

  const quick = (member_id: string, day: string, kind: AttendanceKind) =>
    saveM.mutate({ member_id, day, kind })

  return (
    <div className="space-y-4">
      {/* اقتراح ذكي: من يدخل بانتظام ولم يدخل يوم عمل بلا إجازة */}
      {(suggestions?.length ?? 0) > 0 && (
        <Card className="border-gold/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-gold" />
              لم يدخلوا التطبيق في يوم عمل
              <span className="text-xs font-normal text-muted-foreground">· بلا إجازة ولا عمل عن بعد — ثبّت أو تجاهل</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {suggestions!.map((s) => (
              <div key={`${s.member_id}-${s.day}`} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{s.member_name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDatePref(s.day)}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={saveM.isPending} onClick={() => quick(s.member_id, s.day, 'absent')}>
                  <UserX className="h-3.5 w-3.5" />
                  غياب
                </Button>
                <Button size="sm" variant="outline" className="h-8" disabled={saveM.isPending} onClick={() => quick(s.member_id, s.day, 'excused')}>
                  <FileHeart className="h-3.5 w-3.5" />
                  بعذر
                </Button>
                <Button size="sm" variant="outline" className="h-8" disabled={saveM.isPending} onClick={() => quick(s.member_id, s.day, 'field')}>
                  <Briefcase className="h-3.5 w-3.5" />
                  مهمة خارجية
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isDirector && (pending?.length ?? 0) > 0 && <PendingDeductions records={pending!} />}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <CalendarX2 className="h-[18px] w-[18px] text-gold" />
            </span>
            سجل الشهر
          </CardTitle>
          <div className="flex items-center gap-2">
            <MonthSwitcher ym={ym} onChange={setYm} />
            <Button size="sm" variant="gold" onClick={() => setDraft({})}>
              <Plus className="h-4 w-4" />
              تسجيل
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <KindCounts records={records ?? []} />
              {(records?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا سجلات في {monthLabel(ym)}.</p>
              ) : (
                <div className="divide-y">
                  {records!.map((r) => (
                    <RecordRow key={r.id} r={r} showMember canEdit={canView} canDelete={isDirector} onEdit={(x) => setDraft(toDraft(x))} />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <RecordAttendanceDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}

function PendingDeductions({ records }: { records: AttendanceRecord[] }) {
  const decideM = useDecideDeduction()
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  // يملأ المبلغ المقترح من آخر راتب لمن لم يُحدَّد له مبلغ
  useEffect(() => {
    let alive = true
    for (const r of records) {
      if (r.deduction_amount || amounts[r.id]) continue
      void suggestedDayWage(r.member_id).then((v) => {
        if (alive && v) setAmounts((a) => (a[r.id] ? a : { ...a, [r.id]: String(v) }))
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Wallet className="h-4 w-4 text-destructive" />
          خصومات مقترحة
          <span className="text-xs font-normal text-muted-foreground">· الاعتماد يضيف قيد «خصم» في مسيّر رواتب الموظف</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {records.map((r) => {
          const val = amounts[r.id] ?? (r.deduction_amount ? String(r.deduction_amount) : '')
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{nameOf(r.member)}</p>
                <p className="text-xs text-muted-foreground">
                  غياب بدون عذر · {fmtDatePref(r.day)}
                  {r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              <Input
                dir="ltr"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="h-8 w-28 text-center"
                value={val}
                placeholder="المبلغ"
                onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                aria-label="مبلغ الخصم"
              />
              <Button
                size="sm"
                variant="gold"
                className="h-8"
                disabled={decideM.isPending || !(Number(val) > 0)}
                onClick={() => decideM.mutate({ id: r.id, approve: true, amount: Number(val) })}
              >
                <Check className="h-3.5 w-3.5" />
                اعتماد
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={decideM.isPending}
                onClick={() => decideM.mutate({ id: r.id, approve: false })}
              >
                <X className="h-3.5 w-3.5" />
                بلا خصم
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/* ===================== بطاقة الموظف (صفحته) ===================== */

export function MemberAttendanceCard({ memberId }: { memberId: string }) {
  const isDirector = useIsDirector()
  const canView = useCanViewOffice()
  const [ym, setYm] = useState(todayISO().slice(0, 7))
  const { data: records, isLoading } = useAttendance({ ...monthRange(ym), memberId })
  const [draft, setDraft] = useState<RecordDraft | null>(null)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <CalendarX2 className="h-[18px] w-[18px] text-gold" />
          </span>
          الحضور والغياب
        </CardTitle>
        <div className="flex items-center gap-2">
          <MonthSwitcher ym={ym} onChange={setYm} />
          {canView && (
            <Button size="sm" variant="outline" onClick={() => setDraft({ member_id: memberId, day: localISO(new Date()) })}>
              <Plus className="h-4 w-4" />
              تسجيل
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <KindCounts records={records ?? []} />
            {(records?.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">لا شيء مسجّل في {monthLabel(ym)}.</p>
            ) : (
              <div className="divide-y">
                {records!.map((r) => (
                  <RecordRow key={r.id} r={r} showMember={false} canEdit={canView} canDelete={isDirector} onEdit={(x) => setDraft(toDraft(x))} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
      {canView && <RecordAttendanceDialog draft={draft} onClose={() => setDraft(null)} lockMember />}
    </Card>
  )
}
