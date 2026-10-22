// نموذج إضافة/تعديل عقد (اتفاقية أتعاب) — رقم تلقائي قابل للتعديل + تحقق تكرار لحظي
import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Sparkles, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
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
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { arNorm } from '@/lib/arabic'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useContacts, useCreateContact } from '@/hooks/useContacts'
import { useIsDirector } from '@/hooks/useIsDirector'
import type { ContractExtraction } from '@/hooks/useAiAnalysis'
import {
  useEngagements,
  useCreateEngagement,
  useUpdateEngagement,
} from '@/hooks/useEngagements'
import { ENG_TYPE_OPTIONS, EVENT_KIND_OPTIONS, FEE_MODEL_OPTIONS, FIRST_PARTY_OPTIONS, VAT_OPTIONS } from './labels'
import { ContractFilesBox, type ContractFile } from './ContractFilesBox'
import type { Engagement, EngagementInput } from '@/types/db'

const schema = z.object({
  engagement_number: z.string().optional(),
  title: z.string().min(1, 'عنوان العقد مطلوب'),
  type: z.string().optional(),
  signed_date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  fees_total: z.string().optional(),
  payment_terms: z.string().optional(),
  scope: z.string().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function EngagementForm({
  engagement,
  onDone,
}: {
  engagement?: Engagement | null
  onDone: () => void
}) {
  const isEdit = Boolean(engagement)
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const { data: engagements } = useEngagements()
  const createM = useCreateEngagement()
  const updateM = useUpdateEngagement()

  const [clientId, setClientId] = useState<string | null>(
    engagement?.client_id ?? null
  )
  const isDirector = useIsDirector()
  const createContactM = useCreateContact()
  // ملفات العقد (Word وPDF) وما قرأه الذكاء منها — طلب المدير 2026-10-22
  const [files, setFiles] = useState<ContractFile[]>([])
  const [extracted, setExtracted] = useState<ContractExtraction | null>(null)
  const [keepTerms, setKeepTerms] = useState(true)
  // موكّل العقد غير مسجّل ⇒ يُضاف عميلاً عند الحفظ (ما لم يُختر غيره)
  const [newClient, setNewClient] = useState<{ name: string; phone: string | null; id_number: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = createM.isPending || updateM.isPending || saving || files.some((f) => f.uploading)

  // الرقم التالي تلقائياً: CTR-YY-NNN حسب السنة (قابل للتعديل)
  const nextNumber = useMemo(() => {
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const re = new RegExp(`^CTR-${yy}-(\\d+)$`)
    const max = (engagements ?? []).reduce((m, e) => {
      const match = e.engagement_number?.trim().match(re)
      return match ? Math.max(m, parseInt(match[1], 10)) : m
    }, 0)
    return `CTR-${yy}-${String(max + 1).padStart(3, '0')}`
  }, [engagements])

  const usedNumbers = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of engagements ?? []) {
      const n = e.engagement_number?.trim()
      if (n) m.set(n, e.id)
    }
    return m
  }, [engagements])

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      engagement_number: engagement?.engagement_number ?? nextNumber,
      title: engagement?.title ?? '',
      type: engagement?.type ?? 'case',
      signed_date: engagement?.signed_date ?? todayISO(),
      start_date: engagement?.start_date ?? '',
      end_date: engagement?.end_date ?? '',
      fees_total:
        engagement?.fees_total != null ? String(engagement.fees_total) : '',
      payment_terms: engagement?.payment_terms ?? '',
      scope: engagement?.scope ?? '',
      notes: engagement?.notes ?? '',
    },
  })

  // تعبئة الرقم المقترح لو وصلت القائمة بعد الفتح
  useEffect(() => {
    if (!isEdit && getValues('engagement_number')?.trim() === '') {
      setValue('engagement_number', nextNumber)
    }
  }, [isEdit, nextNumber, getValues, setValue])

  /** يعبّئ النموذج مما قرأه الذكاء — في التعديل يملأ الفارغ فقط ولا يطمس ما أُدخل */
  const applyExtraction = (r: ContractExtraction) => {
    setExtracted(r)
    const put = (k: keyof FormValues, v: string | number | null | undefined) => {
      if (v === null || v === undefined || v === '') return
      if (isEdit && (getValues(k) ?? '').toString().trim() !== '') return
      setValue(k, String(v), { shouldDirty: true })
    }
    put('title', r.title)
    if (r.type && ENG_TYPE_OPTIONS.some((o) => o.value === r.type)) put('type', r.type)
    put('signed_date', r.signed_date)
    put('start_date', r.start_date)
    put('end_date', r.end_date)
    put('fees_total', r.fees_total)
    put('payment_terms', r.payment_terms)
    put('scope', r.scope)
    // الموكّل: يُطابق بالاسم المطبَّع، وإلا يُقترح إضافته
    if (r.client_name && !(isEdit && clientId)) {
      const n = arNorm(r.client_name).replace(/\s+/g, ' ').trim()
      const hit = (contacts ?? []).find((c) => {
        const cn = arNorm(c.name ?? '').replace(/\s+/g, ' ').trim()
        return cn.length > 3 && (cn === n || (n.includes(cn) && cn.length > 8) || (cn.includes(n) && n.length > 8))
      })
      if (hit) { setClientId(hit.id); setNewClient(null) }
      else { setClientId(null); setNewClient({ name: r.client_name, phone: r.client_phone ?? null, id_number: r.client_id_number ?? null }) }
    }
  }

  // تحقق لحظي من تكرار الرقم
  const numberValue = watch('engagement_number')
  const duplicateOf = useMemo(() => {
    const n = numberValue?.trim()
    if (!n) return null
    const id = usedNumbers.get(n)
    return id && id !== engagement?.id ? id : null
  }, [numberValue, usedNumbers, engagement?.id])

  const onSubmit = async (values: FormValues) => {
    if (duplicateOf) return
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

    if (files.some((f) => f.uploading)) return
    // Word ⇒ «ملف العقد» (قابل للتعديل)، وPDF ⇒ «النسخة الموقّعة»؛ وإن لم يكن إلا واحد فهو الاثنان
    const ok = files.filter((f) => f.url)
    const word = ok.find((f) => f.kind === 'word')?.url ?? null
    const pdf = (ok.find((f) => f.kind === 'pdf') ?? ok.find((f) => f.kind === 'image'))?.url ?? null
    const fileUrl = word ?? pdf ?? ok[0]?.url ?? null

    const feesRaw = (values.fees_total ?? '').replace(/[^\d.]/g, '')
    const input: EngagementInput = {
      engagement_number: t(values.engagement_number),
      title: values.title.trim(),
      type: t(values.type),
      client_id: clientId,
      signed_date: t(values.signed_date),
      start_date: t(values.start_date),
      end_date: t(values.end_date),
      fees_total: feesRaw !== '' ? Number(feesRaw) : null,
      payment_terms: t(values.payment_terms),
      scope: t(values.scope),
      notes: t(values.notes),
    }
    if (fileUrl) input.file_url = fileUrl
    const extra: Record<string, unknown> = {}
    if (pdf) extra.signed_file_url = pdf
    const r = extracted
    if (r && keepTerms) {
      const terms: Partial<Engagement> = {
        fee_model: r.fee_model ?? null, fee_percentage: r.fee_percentage ?? null, percentage_base: r.percentage_base ?? null,
        vat_mode: r.vat_mode ?? undefined, first_party: r.first_party ?? null, client_side: r.client_side ?? null,
        client_rep_name: r.client_rep_name ?? null, client_rep_capacity: r.client_rep_capacity ?? null,
        beneficiary_name: r.beneficiary_name ?? null, beneficiary_relation: r.beneficiary_relation ?? null,
        opponent_name: r.opponent_name ?? null, stages_covered: r.stages_covered?.length ? r.stages_covered : undefined,
        ends_on: r.ends_on ?? null, dispute_venue: r.dispute_venue ?? null, expenses_on_client: r.expenses_on_client ?? null,
        poa_required: r.poa_required ?? null, fees_due_on_settlement: r.fees_due_on_settlement ?? null,
        advance_refundable: r.advance_refundable ?? null, auto_renew: r.auto_renew ?? null, notice_period_days: r.notice_period_days ?? null,
      }
      for (const [k, v] of Object.entries(terms)) {
        if (v === null || v === undefined) continue
        // في التعديل: لا يُطمس ما أُدخل
        const cur = engagement?.[k as keyof Engagement]
        if (isEdit && cur !== null && cur !== undefined && !(Array.isArray(cur) && cur.length === 0) && cur !== 'unspecified') continue
        extra[k] = v
      }
      extra.extracted_at = new Date().toISOString()
      extra.extract_summary = r.summary ?? null
    }

    setSaving(true)
    try {
      // موكّل العقد غير المسجّل يُضاف عميلاً
      let client = clientId
      if (!client && newClient) {
        const c = await createContactM.mutateAsync({
          name: newClient.name, category: 'client', type: 'client',
          entity_type: /شركة|مؤسسة|مصنع|مكتب|جمعية/.test(newClient.name) ? 'منشأة' : 'فرد',
          phone: newClient.phone, id_number: newClient.id_number,
        })
        client = c.id
      }
      const full = { ...input, client_id: client, ...extra } as EngagementInput
      if (isEdit && engagement) {
        await updateM.mutateAsync({ id: engagement.id, input: full })
      } else {
        const created = await createM.mutateAsync({ ...full, created_by: teamMember?.id ?? null })
        // الدفعات للمدير وحده (المال) — وتُحفظ مع العقد الجديد فقط
        const inst = r && keepTerms ? r.installments ?? [] : []
        if (inst.length && isDirector && created?.id) {
          const { error } = await supabase.from('engagement_installments').insert(
            inst.map((i, n) => ({ ...i, engagement_id: created.id, seq: n + 1 }))
          )
          if (error) toast({ variant: 'destructive', title: 'حُفظ العقد وتعذّر حفظ دفعاته', description: errMessage(error) })
        }
      }
      onDone()
    } catch {
      /* رسالة الخطأ من الخطاف نفسه */
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل العقد' : 'عقد جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <ContractFilesBox files={files} setFiles={setFiles} existing={!!engagement?.file_url} onExtracted={applyExtraction} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="eng_number">
              رقم العقد{' '}
              <span className="font-normal text-muted-foreground">
                (تلقائي — يمكن تعديله)
              </span>
            </Label>
            <Input
              id="eng_number"
              dir="ltr"
              className={duplicateOf ? 'border-destructive' : undefined}
              {...register('engagement_number')}
            />
            {duplicateOf && (
              <p className="text-xs font-medium text-destructive">
                يوجد عقد آخر بنفس الرقم «{numberValue?.trim()}» — غيّر الرقم
                للمتابعة.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>النوع</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENG_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eng_title">عنوان العقد *</Label>
          <Input id="eng_title" {...register('title')} />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>الموكّل</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={clientId}
            onSelect={(c) => { setClientId(c?.id ?? null); if (c) setNewClient(null) }}
          />
          {!clientId && newClient && (
            <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5 text-gold" />
              الموكّل في العقد «<b>{newClient.name}</b>» غير مسجّل — يُضاف عميلاً عند الحفظ، أو اختر عميلاً موجوداً.
              <button type="button" className="ms-auto text-muted-foreground underline" onClick={() => setNewClient(null)}>لا تضفه</button>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Controller
            control={control}
            name="signed_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ التوقيع"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <Controller
            control={control}
            name="start_date"
            render={({ field }) => (
              <DualDatePicker
                label="بداية السريان"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <Controller
            control={control}
            name="end_date"
            render={({ field }) => (
              <DualDatePicker
                label="نهاية السريان"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="eng_fees">إجمالي الأتعاب (ريال)</Label>
            <Input
              id="eng_fees"
              dir="ltr"
              inputMode="decimal"
              {...register('fees_total')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eng_terms">طريقة الدفع</Label>
            <Input
              id="eng_terms"
              placeholder="مثال: دفعتان — 50% عند التوقيع"
              {...register('payment_terms')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eng_scope">نطاق العمل</Label>
          <Textarea id="eng_scope" rows={3} {...register('scope')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="eng_notes">ملاحظات</Label>
          <Textarea id="eng_notes" rows={2} {...register('notes')} />
        </div>

        {extracted && <TermsPreview r={extracted} keep={keepTerms} setKeep={setKeepTerms} canInstallments={isDirector && !isEdit} />}
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending || !!duplicateOf}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ التعديلات' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}

/** ما قرأه الذكاء من بنود العقد وأطرافه ودفعاته — يُحفظ مع العقد، ويُعدَّل بعدها من صفحته */
function TermsPreview({
  r, keep, setKeep, canInstallments,
}: { r: ContractExtraction; keep: boolean; setKeep: (v: boolean) => void; canInstallments: boolean }) {
  const lbl = <T extends { value: string; label: string }>(opts: readonly T[], v: string | null | undefined) =>
    opts.find((o) => o.value === v)?.label ?? null
  const yes = (v: boolean | null | undefined, t: string) => (v === true ? t : null)
  const chips = [
    lbl(FEE_MODEL_OPTIONS, r.fee_model) && `الأتعاب: ${lbl(FEE_MODEL_OPTIONS, r.fee_model)}${r.fee_percentage ? ` ${r.fee_percentage}٪` : ''}`,
    r.vat_mode && r.vat_mode !== 'unspecified' && lbl(VAT_OPTIONS, r.vat_mode),
    lbl(FIRST_PARTY_OPTIONS, r.first_party) && `الطرف الأول: ${lbl(FIRST_PARTY_OPTIONS, r.first_party)}`,
    r.client_side && `صفة الموكّل: ${r.client_side}`,
    r.client_rep_name && `ممثل الموكّل: ${r.client_rep_name}${r.client_rep_capacity ? ` (${r.client_rep_capacity})` : ''}`,
    r.beneficiary_name && `المستفيد: ${r.beneficiary_name}`,
    r.opponent_name && `الخصم: ${r.opponent_name}`,
    r.stages_covered?.length ? `المراحل: ${r.stages_covered.join('، ')}` : null,
    r.ends_on && `ينتهي بـ${r.ends_on}`,
    yes(r.fees_due_on_settlement, 'الأتعاب كاملة عند الصلح أو العزل'),
    yes(r.expenses_on_client, 'المصاريف على الموكّل'),
    yes(r.poa_required, 'إصدار وكالة'),
    yes(r.advance_refundable, 'المقدّم يُسترد'),
    r.dispute_venue && `النزاع: ${r.dispute_venue}`,
  ].filter(Boolean) as string[]
  const inst = r.installments ?? []
  if (!chips.length && !inst.length) return null
  return (
    <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-gold" /> البنود والأطراف كما قرأها الذكاء
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-[hsl(var(--gold))]" />
          احفظها مع العقد
        </label>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => <span key={c} className="rounded-md bg-background px-2 py-0.5 text-xs">{c}</span>)}
        </div>
      )}
      {inst.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">
            الدفعات ({inst.length}){!canInstallments && ' — تُضاف من صفحة العقد (للمدير)'}
          </p>
          {inst.map((i, n) => (
            <p key={n} className="flex justify-between gap-2 text-xs">
              <span>
                {n + 1}. {i.label} —{' '}
                {i.trigger === 'on_signing' ? 'عند التوقيع'
                  : i.trigger === 'date' ? (i.due_date ? fmtDatePref(i.due_date) : 'بتاريخ')
                  : i.event_label || EVENT_KIND_OPTIONS.find((o) => o.value === i.event_kind)?.label || 'عند حدث'}
              </span>
              <span className="shrink-0 font-medium">
                {i.amount != null ? `${fmtNumber(i.amount)} ر.س` : i.percent != null ? `${i.percent}٪` : '—'}
              </span>
            </p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">تُعدَّل بعد الحفظ من «البنود والأطراف» في صفحة العقد.</p>
    </div>
  )
}
