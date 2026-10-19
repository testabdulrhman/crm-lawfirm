// بنود العقد ودفعاته (2026-10-14) — مبنية على تحليل ١١٢ عقداً للمكتب: الأتعاب بطريقتها ودفعاتها (عند التوقيع/بتاريخ/عند
// حدث)، والأطراف (ومنهم المستفيد حين يوقّع قريب المتهم)، والمراحل المشمولة، وبنود الإنهاء والنزاع. للمدير وحده كبقية المال.
import { useEffect, useState } from 'react'
import { Check, CheckCircle2, Loader2, Pencil, Plus, Scale, Trash2, Upload, Wallet, FileCheck2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DualDatePicker } from '@/components/DualDatePicker'
import { fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { uploadFile } from '@/lib/files'
import { openExternal } from '@/lib/external'
import { useDeleteInstallment, useInstallments, useSaveInstallment, useUpdateEngagement } from '@/hooks/useEngagements'
import type { Engagement, EngagementInstallment, EngagementInput } from '@/types/db'
import {
  CLIENT_SIDE_OPTIONS,
  EVENT_KIND_OPTIONS,
  FEE_MODEL_OPTIONS,
  FIRST_PARTY_OPTIONS,
  STAGE_OPTIONS,
  STATE_LABEL,
  TRIGGER_OPTIONS,
  VAT_OPTIONS,
  eventLabel,
  installmentAmount,
  installmentRemaining,
  installmentState,
  isPartiallyPaid,
  type InstallmentState,
} from './labels'

const STATE_TONE: Record<InstallmentState, string> = {
  paid: 'text-emerald-700 dark:text-emerald-300',
  overdue: 'text-destructive font-semibold',
  due: 'text-amber-700 dark:text-amber-300 font-semibold',
  waiting: 'text-sky-700 dark:text-sky-300',
  upcoming: 'text-muted-foreground',
}

const yesNo = (v: boolean | null) => (v == null ? null : v ? 'نعم' : 'لا')

/* ===================== الأتعاب والدفعات ===================== */

export function InstallmentsCard({ e }: { e: Engagement }) {
  const { data: list = [] } = useInstallments(e.id)
  const saveM = useSaveInstallment(e.id)
  const delM = useDeleteInstallment()
  const [edit, setEdit] = useState<Partial<EngagementInstallment> | null>(null)
  const [pay, setPay] = useState<EngagementInstallment | null>(null)

  const total = e.fees_total ?? list.reduce((s, i) => s + (installmentAmount(i, null) ?? 0), 0)
  const paid = list.reduce((s, i) => s + (i.paid_at ? (i.paid_amount ?? installmentAmount(i, e.fees_total) ?? 0) : 0), 0)
  const today = todayISO()
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  const model = FEE_MODEL_OPTIONS.find((o) => o.value === e.fee_model)?.label
  const vat = VAT_OPTIONS.find((o) => o.value === e.vat_mode)?.label

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Wallet className="h-[18px] w-[18px] text-gold" />
          </span>
          الأتعاب والدفعات
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEdit({ trigger: list.length ? 'date' : 'on_signing', seq: list.length + 1 })}>
          <Plus className="h-4 w-4" />
          دفعة
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-foreground">
            {e.fees_total != null ? `${fmtNumber(e.fees_total)} ريال` : 'الإجمالي غير محدد'}
          </span>
          {model && <Badge variant="outline">{model}</Badge>}
          {e.fee_percentage != null && (
            <Badge variant="outline">{fmtNumber(e.fee_percentage)}٪ {e.percentage_base ?? ''}</Badge>
          )}
          {vat && e.vat_mode !== 'unspecified' && <span className="text-xs text-muted-foreground">{vat}</span>}
          {total > 0 && (
            <span className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
              </span>
              محصّل {fmtNumber(paid)} ({fmtNumber(pct)}٪)
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
            لا دفعات بعد — أضف دفعات العقد (عند التوقيع، أو بتاريخ، أو عند حدث كالحكم الابتدائي) ليُتابَع تحصيلها ويُنبَّه بموعدها.
          </p>
        ) : (
          <div className="divide-y rounded-xl border">
            {list.map((i) => {
              const st = installmentState(i, today, e.fees_total)
              const amt = installmentAmount(i, e.fees_total)
              const partial = isPartiallyPaid(i, e.fees_total)
              const left = installmentRemaining(i, e.fees_total)
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{i.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.trigger === 'on_signing' && 'عند توقيع العقد'}
                      {i.trigger === 'date' && (i.due_date ? `في ${fmtDatePref(i.due_date)}` : 'تاريخ غير محدد')}
                      {i.trigger === 'event' &&
                        `عند ${eventLabel(i)}${i.event_reached_at ? ` — تحقق ${fmtDatePref(i.event_reached_at)}` : ''}`}
                    </p>
                  </div>
                  <span className="w-28 text-left font-semibold tabular-nums">{amt != null ? fmtNumber(amt) : '—'}</span>
                  <span className={cn('w-36 text-xs', STATE_TONE[st])}>
                    {st === 'paid' ? `✓ سُدّدت ${fmtDatePref(i.paid_at)}` : STATE_LABEL[st]}
                    {partial && left != null && (
                      <span className="block text-muted-foreground">
                        قُبض {fmtNumber(i.paid_amount ?? 0)} · يتبقى {fmtNumber(left)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    {st !== 'paid' && i.trigger === 'event' && !i.event_reached_at && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={saveM.isPending}
                        onClick={() => saveM.mutate({ id: i.id, event_reached_at: todayISO() })}>
                        تحقق الحدث
                      </Button>
                    )}
                    {st !== 'paid' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPay(i)}>
                        <Check className="h-3.5 w-3.5" />
                        تسجيل سداد
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(i)} aria-label="تعديل">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={delM.isPending}
                      onClick={() => confirm(`حذف «${i.label}»؟`) && delM.mutate(i.id)} aria-label="حذف">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          الدفعة «عند صدور الحكم الابتدائي» تستحق تلقائياً حين يُسجَّل الحكم في الملف المربوط، ويصلك تنبيه بالمستحق والمتأخر.
        </p>
      </CardContent>

      <InstallmentDialog draft={edit} feesTotal={e.fees_total} onClose={() => setEdit(null)}
        onSave={(v) => saveM.mutate(v, { onSuccess: () => setEdit(null) })} saving={saveM.isPending} />
      <PayDialog inst={pay} feesTotal={e.fees_total} onClose={() => setPay(null)} saving={saveM.isPending}
        onSave={(v) => saveM.mutate(v, { onSuccess: () => setPay(null) })} />
    </Card>
  )
}

function InstallmentDialog({
  draft, feesTotal, onClose, onSave, saving,
}: {
  draft: Partial<EngagementInstallment> | null
  feesTotal: number | null
  onClose: () => void
  onSave: (v: Partial<EngagementInstallment>) => void
  saving: boolean
}) {
  const [v, setV] = useState<Partial<EngagementInstallment>>({})
  const [byPct, setByPct] = useState(false)
  useEffect(() => {
    if (draft) { setV(draft); setByPct(draft.percent != null && draft.amount == null) }
  }, [draft])
  const set = (p: Partial<EngagementInstallment>) => setV((x) => ({ ...x, ...p }))
  const label =
    v.label?.trim() ||
    (v.trigger === 'on_signing' ? 'عند توقيع العقد' : v.trigger === 'event' ? `عند ${eventLabel({ event_kind: v.event_kind ?? null, event_label: v.event_label ?? null })}` : 'دفعة')
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{v.id ? 'تعديل الدفعة' : 'دفعة جديدة'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {TRIGGER_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => set({ trigger: o.value })}
                className={cn('rounded-xl border px-2 py-2 text-xs', v.trigger === o.value ? 'border-gold bg-gold/10 font-semibold' : 'hover:bg-muted')}>
                {o.label}
              </button>
            ))}
          </div>
          {v.trigger === 'date' && (
            <div className="space-y-1.5">
              <DualDatePicker label="التاريخ" value={v.due_date ?? null} onChange={(d) => set({ due_date: d })} />
            </div>
          )}
          {v.trigger === 'event' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الحدث</Label>
                <Select value={v.event_kind ?? ''} onValueChange={(x) => set({ event_kind: x as EngagementInstallment['event_kind'] })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {EVENT_KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}{o.auto ? ' (تلقائي)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>وصفه كما في العقد (اختياري)</Label>
                <Input value={v.event_label ?? ''} onChange={(e) => set({ event_label: e.target.value || null })} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{byPct ? 'النسبة من الأتعاب ٪' : 'المبلغ (ريال)'}</Label>
              {feesTotal ? (
                <button type="button" className="text-xs text-gold-700 hover:underline dark:text-gold-300" onClick={() => setByPct((b) => !b)}>
                  {byPct ? 'بالمبلغ' : 'بالنسبة'}
                </button>
              ) : null}
            </div>
            <Input dir="ltr" type="number" min={0} step="0.01"
              value={byPct ? (v.percent ?? '') : (v.amount ?? '')}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value)
                set(byPct ? { percent: n, amount: null } : { amount: n, percent: null })
              }} />
            {byPct && v.percent != null && feesTotal ? (
              <p className="text-xs text-muted-foreground">= {fmtNumber(Math.round((v.percent / 100) * feesTotal))} ريال</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={v.label ?? ''} placeholder={label} onChange={(e) => set({ label: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="gold" disabled={saving || !v.trigger || (v.trigger === 'event' && !v.event_kind)}
            onClick={() => onSave({ ...v, label })}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PayDialog({
  inst, feesTotal, onClose, onSave, saving,
}: {
  inst: EngagementInstallment | null
  feesTotal: number | null
  onClose: () => void
  onSave: (v: Partial<EngagementInstallment>) => void
  saving: boolean
}) {
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('تحويل بنكي')
  // دفعة سُدّد بعضها: المقترح هو المتبقي، والمقبوض يُضاف لما قبله
  const prior = inst?.paid_at ? (inst.paid_amount ?? 0) : 0
  const left = inst ? installmentRemaining(inst, feesTotal) : null
  useEffect(() => {
    if (inst) { setDate(todayISO()); setAmount(String(left ?? '')); setMethod('تحويل بنكي') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst, feesTotal])
  return (
    <Dialog open={!!inst} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>تسجيل سداد — {inst?.label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <DualDatePicker label="تاريخ السداد" value={date} onChange={(d) => setDate(d ?? '')} />
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ المستلم{prior > 0 ? ` (سبق قبض ${fmtNumber(prior)})` : ''}</Label>
            <Input dir="ltr" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['تحويل بنكي', 'نقداً', 'شيك', 'نقاط بيع'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="gold" disabled={saving || !date || !(Number(amount) > 0)}
            onClick={() => inst && onSave({ id: inst.id, paid_at: date, paid_amount: prior + Number(amount), payment_method: method })}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            سُدّدت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== البنود والأطراف ===================== */

export function EngagementTermsCard({ e, canEdit }: { e: Engagement; canEdit: boolean }) {
  const updateM = useUpdateEngagement()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const firstParty = FIRST_PARTY_OPTIONS.find((o) => o.value === e.first_party)?.label

  const uploadSigned = async (f: File | undefined) => {
    if (!f) return
    setUploading(true)
    try {
      const { publicUrl } = await uploadFile(f, { folder: `engagements/${e.id}` })
      updateM.mutate({ id: e.id, input: { signed_file_url: publicUrl } as Partial<EngagementInput> })
    } finally {
      setUploading(false)
    }
  }

  const terms: [string, string | null][] = [
    ['المقدّم قابل للاسترداد', yesNo(e.advance_refundable)],
    ['الأتعاب كاملة إن تصالح الموكّل أو عزل المحامي', yesNo(e.fees_due_on_settlement)],
    ['المصاريف والخبراء على الموكّل', yesNo(e.expenses_on_client)],
    ['إصدار وكالة مطلوب', yesNo(e.poa_required)],
    ['جهة الاختصاص عند النزاع', e.dispute_venue],
    ['ينتهي العقد بـ', e.ends_on],
  ]

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Scale className="h-[18px] w-[18px] text-gold" />
          </span>
          البنود والأطراف
        </CardTitle>
        <div className="flex items-center gap-2">
          {e.signed_file_url ? (
            <Button size="sm" variant="outline" onClick={() => openExternal(e.signed_file_url!)}>
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
              النسخة الموقّعة
            </Button>
          ) : canEdit && (
            <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted', uploading && 'opacity-60')}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              رفع النسخة الموقّعة
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(ev) => uploadSigned(ev.target.files?.[0])} />
            </label>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Pencil className="h-4 w-4" />
              تعديل البنود
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">الأطراف والقضية</p>
            {firstParty && <p><span className="text-muted-foreground">الطرف الأول:</span> {firstParty}</p>}
            {e.client_rep_name && <p><span className="text-muted-foreground">ممثل الموكّل:</span> {e.client_rep_name}{e.client_rep_capacity ? ` (${e.client_rep_capacity})` : ''}</p>}
            {e.beneficiary_name && <p><span className="text-muted-foreground">المستفيد:</span> {e.beneficiary_name}{e.beneficiary_relation ? ` — ${e.beneficiary_relation}` : ''}</p>}
            {e.client_side && <p><span className="text-muted-foreground">صفة الموكّل:</span> {e.client_side}</p>}
            {e.opponent_name && <p><span className="text-muted-foreground">الخصم:</span> {e.opponent_name}</p>}
            {!firstParty && !e.client_rep_name && !e.beneficiary_name && !e.client_side && !e.opponent_name && (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div className="space-y-2 rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">المراحل المشمولة</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_OPTIONS.map((s) => {
                const on = e.stages_covered?.includes(s)
                return (
                  <span key={s} title={on ? 'مشمولة' : 'غير مشمولة'} className={cn('rounded-md border px-2 py-0.5 text-xs', on ? 'border-gold/40 bg-gold/15 font-medium text-gold-700 dark:text-gold-300' : 'border-dashed bg-background text-muted-foreground/70')}>
                    {on ? '✓ ' : ''}{s}
                  </span>
                )
              })}
            </div>
            {!e.stages_covered?.length && <p className="text-xs text-muted-foreground">لم تُحدَّد — يحسم الخلاف المتكرر «هل الاستئناف داخل في العقد؟»</p>}
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {terms.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {open && <TermsDialog e={e} onClose={() => setOpen(false)} />}
    </Card>
  )
}

function TermsDialog({ e, onClose }: { e: Engagement; onClose: () => void }) {
  const updateM = useUpdateEngagement()
  const [v, setV] = useState<Partial<Engagement>>({
    fee_model: e.fee_model, fee_percentage: e.fee_percentage, percentage_base: e.percentage_base, vat_mode: e.vat_mode,
    first_party: e.first_party, client_rep_name: e.client_rep_name, client_rep_capacity: e.client_rep_capacity,
    beneficiary_name: e.beneficiary_name, beneficiary_relation: e.beneficiary_relation, client_side: e.client_side,
    opponent_name: e.opponent_name, stages_covered: e.stages_covered ?? [], ends_on: e.ends_on, dispute_venue: e.dispute_venue,
    advance_refundable: e.advance_refundable, fees_due_on_settlement: e.fees_due_on_settlement,
    expenses_on_client: e.expenses_on_client, poa_required: e.poa_required,
  })
  const set = (p: Partial<Engagement>) => setV((x) => ({ ...x, ...p }))
  const toggleStage = (s: string) =>
    set({ stages_covered: v.stages_covered?.includes(s) ? v.stages_covered.filter((x) => x !== s) : [...(v.stages_covered ?? []), s] })
  const bool = (k: keyof Engagement, label: string) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={!!v[k]} onCheckedChange={(c) => set({ [k]: c } as Partial<Engagement>)} />
    </div>
  )
  const text = (k: keyof Engagement, label: string, ph = '') => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={(v[k] as string) ?? ''} placeholder={ph} onChange={(ev) => set({ [k]: ev.target.value || null } as Partial<Engagement>)} />
    </div>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>بنود العقد</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <section className="space-y-3">
            <p className="text-sm font-semibold">الأتعاب</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>الطريقة</Label>
                <Select value={v.fee_model ?? ''} onValueChange={(x) => set({ fee_model: x as Engagement['fee_model'] })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{FEE_MODEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {(v.fee_model === 'percentage' || v.fee_model === 'mixed') && (
                <>
                  <div className="space-y-1.5">
                    <Label>النسبة ٪</Label>
                    <Input dir="ltr" type="number" min={0} max={100} step="0.5" value={v.fee_percentage ?? ''}
                      onChange={(ev) => set({ fee_percentage: ev.target.value === '' ? null : Number(ev.target.value) })} />
                  </div>
                  {text('percentage_base', 'أساس النسبة', 'مما يُحصَّل')}
                </>
              )}
              <div className="space-y-1.5">
                <Label>الضريبة</Label>
                <Select value={v.vat_mode ?? 'unspecified'} onValueChange={(x) => set({ vat_mode: x as Engagement['vat_mode'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold">الأطراف</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الطرف الأول</Label>
                <Select value={v.first_party ?? ''} onValueChange={(x) => set({ first_party: x as Engagement['first_party'] })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{FIRST_PARTY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>صفة الموكّل</Label>
                <Select value={v.client_side ?? ''} onValueChange={(x) => set({ client_side: x })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {/* قيمة مستوردة من عقد قديم خارج القائمة تبقى ظاهرة */}
                    {[...CLIENT_SIDE_OPTIONS, ...(v.client_side && !(CLIENT_SIDE_OPTIONS as readonly string[]).includes(v.client_side) ? [v.client_side] : [])].map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {text('client_rep_name', 'ممثل الموكّل (للشركات)')}
              {text('client_rep_capacity', 'صفته', 'مدير عام / وكيل')}
              {text('beneficiary_name', 'المستفيد إن كان غير الموكّل', 'مثل المتهم في الجزائي')}
              {text('beneficiary_relation', 'صلته بالموكّل', 'أخ / ابن')}
              {text('opponent_name', 'الخصم')}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold">المراحل المشمولة</p>
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => toggleStage(s)}
                  className={cn('rounded-full border px-3 py-1 text-xs', v.stages_covered?.includes(s) ? 'border-gold bg-gold/15 font-semibold' : 'hover:bg-muted')}>
                  {v.stages_covered?.includes(s) ? '✓ ' : ''}{s}
                </button>
              ))}
            </div>
            {text('ends_on', 'ينتهي العقد بـ', 'صدور حكم نهائي / صدور الصك / استلام المبلغ')}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold">الإنهاء والنزاع</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {bool('advance_refundable', 'المقدّم قابل للاسترداد')}
              {bool('fees_due_on_settlement', 'الأتعاب كاملة عند الصلح أو العزل')}
              {bool('expenses_on_client', 'المصاريف والخبراء على الموكّل')}
              {bool('poa_required', 'إصدار وكالة مطلوب')}
            </div>
            {text('dispute_venue', 'جهة الاختصاص عند النزاع', 'ودياً ثم محاكم بريدة')}
          </section>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="gold" disabled={updateM.isPending}
            onClick={() => updateM.mutate({ id: e.id, input: v as Partial<EngagementInput> }, { onSuccess: onClose })}>
            {updateM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ البنود
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
