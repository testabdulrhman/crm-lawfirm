import { useState, type ReactNode } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { todayISO } from '@/lib/format'
import { useContacts } from '@/hooks/useContacts'
import { useTeamMembers } from '@/hooks/useTeam'
import { useCreateCase, useUpdateCase } from '@/hooks/useCases'
import { CASE_STATUS_OPTIONS, CASE_TYPES } from '@/lib/caseLabels'
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { CaseDocDropzone, type ExtractedCase } from './CaseDocDropzone'
import { addDocumentDirect } from '@/hooks/useCaseDocuments'
import { useAuth } from '@/stores/auth'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import type { Case, CaseInput } from '@/types/db'

const OTHER = '__other__'

const schema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  type: z.string().optional(),
  typeOther: z.string().optional(),
  status: z.string().min(1),
  court_num: z.string().optional(),
  court: z.string().optional(),
  court_division: z.string().optional(),
  assignee_id: z.string().optional(),
  subject: z.string().optional(),
  open_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function initialType(t: string | null | undefined): string {
  if (!t || t.trim() === '') return ''
  return (CASE_TYPES as readonly string[]).includes(t) ? t : OTHER
}

/**
 * قسم معنون داخل النموذج.
 *
 * لماذا أقسام ولا قائمة تنقّل جانبية كما في كليو؟ لأن نموذجهم ثلاثة عشر
 * قسماً (صلاحيات، إشعارات، حقول مخصّصة، فحص تعارض…) فيحتاج تنقّلاً،
 * ونموذجنا عشرة حقول — قائمة التنقّل ستكون أطول مما تنقّل إليه.
 */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h3 className="mb-3.5 border-b border-border/60 pb-2.5 text-[13px] font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function CaseForm({
  caseItem,
  onDone,
  variant = 'dialog',
}: {
  caseItem?: Case | null
  onDone: () => void
  /** 'page' يعرض شريط حفظ ثابت + منطقة إسقاط مستند */
  variant?: 'dialog' | 'page'
}) {
  const isPage = variant === 'page'
  const { teamMember } = useAuth()
  // مستند أُسقط قبل الحفظ: يُرفع أول مستند للقضية بعد نجاح الإنشاء
  const [pendingDoc, setPendingDoc] = useState<File | null>(null)
  // ما استُخرج ولا حقل له في النموذج — نعرضه ولا نُسقطه بصمت
  const [extras, setExtras] = useState<ExtractedCase | null>(null)
  const isEdit = Boolean(caseItem)
  const { data: contacts } = useContacts()
  const { data: members } = useTeamMembers()
  const createM = useCreateCase()
  const updateM = useUpdateCase()
  const pending = createM.isPending || updateM.isPending

  const [contactId, setContactId] = useState<string | null>(
    caseItem?.contact_id ?? null
  )

  const activeMembers = (members ?? []).filter((m) => m.is_active)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: caseItem?.title ?? '',
      type: initialType(caseItem?.type),
      typeOther:
        caseItem?.type && initialType(caseItem.type) === OTHER
          ? caseItem.type
          : '',
      status: caseItem?.status ?? 'jarri',
      court_num: caseItem?.court_num ?? '',
      court: caseItem?.court ?? '',
      court_division: caseItem?.court_division ?? '',
      assignee_id: caseItem?.assignee_id ?? '',
      subject: caseItem?.subject ?? '',
      open_date: caseItem?.open_date ?? todayISO(),
    },
  })

  const typeValue = watch('type')

  /**
   * تعبئة الحقول مما استُخرج — **دون طمس ما كتبه الموظف**. لو ملأ حقلاً
   * بنفسه ثم أسقط مستنداً، عمله أولى من تخمين النموذج.
   */
  const applyExtracted = (d: ExtractedCase) => {
    setExtras(d)
    const fill = (key: keyof FormValues, v: string | null | undefined) => {
      if (!v || String(v).trim() === '') return
      const current = String(watch(key) ?? '').trim()
      if (current !== '') return
      setValue(key, String(v).trim(), { shouldDirty: true })
    }
    fill('title', d.title)
    fill('court', d.court)
    fill('court_division', d.court_division)
    fill('court_num', d.court_num)
    fill('subject', d.subject)
    if (d.type && (CASE_TYPES as readonly string[]).includes(d.type)) {
      if (!watch('type')) setValue('type', d.type, { shouldDirty: true })
    }

    // مطابقة الموكّل بالاسم: نختاره فقط عند تطابق واحد لا لبس فيه
    if (d.client_name && !contactId) {
      const needle = d.client_name.trim().toLowerCase()
      const hits = (contacts ?? []).filter((c) => {
        const n = (c.name ?? '').trim().toLowerCase()
        return n === needle || n.includes(needle) || needle.includes(n)
      })
      if (hits.length === 1) setContactId(hits[0].id)
    }
  }

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const resolvedType =
      values.type === OTHER
        ? t(values.typeOther)
        : t(values.type)

    // ملاحظة: لا نرسل office_num (يولّده trigger في قاعدة البيانات تلقائياً)
    // ولا progress (يُترك للقيمة الافتراضية عند الإنشاء، ولا يُمسّ عند التعديل)
    const input: CaseInput = {
      title: values.title.trim(),
      type: resolvedType,
      status: values.status,
      court_num: t(values.court_num),
      court: t(values.court),
      court_division: t(values.court_division),
      assignee_id: values.assignee_id || null,
      contact_id: contactId,
      subject: t(values.subject),
      open_date: values.open_date || null,
    }
    if (isEdit && caseItem) {
      await updateM.mutateAsync({ id: caseItem.id, input })
    } else {
      const created = await createM.mutateAsync(input)
      // المستند الذي قُرئ منه يُرفق بالقضية — الرفع بعد الإنشاء لا قبله،
      // فلا يبقى ملف يتيم إن تراجع الموظف. فشل الرفع لا يُلغي القضية.
      if (pendingDoc && created?.id) {
        try {
          await addDocumentDirect(created.id, {
            file: pendingDoc,
            documentDate: extras?.filing_date ?? null,
            description: 'المستند الذي استُخرجت منه بيانات القضية',
            uploadedByName: teamMember?.name ?? null,
          })
        } catch (e) {
          toast({
            variant: 'destructive',
            title: 'أُنشئت القضية، لكن تعذّر إرفاق المستند',
            description: errMessage(e) ?? 'ارفعه يدوياً من تبويب المستندات.',
          })
        }
      }
    }
    onDone()
  }

  /* ===================== الحقول ===================== */

  const titleField = (
    <div className="space-y-1.5">
      <Label htmlFor="title">
        عنوان القضية <span className="text-destructive">*</span>
      </Label>
      <Input id="title" {...register('title')} />
      {errors.title && (
        <p className="text-xs text-destructive">{errors.title.message}</p>
      )}
    </div>
  )

  const clientField = (
    <div className="space-y-1.5">
      <Label>الموكّل</Label>
      <ContactPicker
        contacts={contacts ?? []}
        value={contactId}
        onSelect={(c) => setContactId(c?.id ?? null)}
      />
    </div>
  )

  const typeField = (
    <div className="space-y-1.5">
      <Label>النوع</Label>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder="اختر النوع" />
            </SelectTrigger>
            <SelectContent>
              {CASE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>أخرى…</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      {typeValue === OTHER && (
        <Input placeholder="اكتب النوع" className="mt-2" {...register('typeOther')} />
      )}
    </div>
  )

  const statusField = (
    <div className="space-y-1.5">
      <Label>الحالة</Label>
      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASE_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )

  const assigneeField = (
    <div className="space-y-1.5">
      <Label>المحامي المسؤول</Label>
      <Controller
        control={control}
        name="assignee_id"
        render={({ field }) => (
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder="اختر المسؤول" />
            </SelectTrigger>
            <SelectContent>
              {activeMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )

  // ما استُخرج ولا حقل له: الطرف المقابل والجلسة القادمة والتواريخ الهجرية.
  // نعرضه بدل إسقاطه — الموظف يقرّر ماذا يفعل به بعد الحفظ.
  const extraNotes =
    extras &&
    [
      extras.opponent_name ? `الطرف المقابل: ${extras.opponent_name}` : null,
      extras.filing_date ? `تاريخ القيد: ${extras.filing_date}` : null,
      extras.next_session_date ? `الجلسة القادمة: ${extras.next_session_date}` : null,
      extras.hijri_note ? `هجرياً: ${extras.hijri_note}` : null,
    ].filter(Boolean)

  const body = (
    <div className="space-y-3">
      {isPage && (
        <CaseDocDropzone
          onExtracted={applyExtracted}
          onFileChange={setPendingDoc}
        />
      )}

      {extraNotes && extraNotes.length > 0 && (
        <div className="rounded-xl border border-blue-300/60 bg-blue-50/50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="mb-1.5 text-xs font-semibold text-foreground">
            استُخرج أيضاً — لا حقل له هنا
          </p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {extraNotes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            الطرف المقابل يُضاف من تبويب «الأطراف»، والجلسة من تبويب «الجلسات»
            بعد الحفظ.
          </p>
        </div>
      )}

      <FormSection title="أساسيات">
        <div className="space-y-3">
          {titleField}
          {clientField}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {typeField}
            {statusField}
          </div>
        </div>
      </FormSection>

      <FormSection title="المحكمة">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="court">المحكمة</Label>
            <Input id="court" {...register('court')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="court_division">الدائرة</Label>
            <Input id="court_division" {...register('court_division')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="court_num">رقم المحكمة</Label>
            <Input id="court_num" dir="ltr" className="text-right" {...register('court_num')} />
          </div>
        </div>
      </FormSection>

      <FormSection title="الإسناد والموضوع">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {assigneeField}
            <Controller
              control={control}
              name="open_date"
              render={({ field }) => (
                <DualDatePicker
                  label="تاريخ الفتح"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">الموضوع / التفاصيل</Label>
            <Textarea id="subject" rows={4} {...register('subject')} />
          </div>
        </div>
      </FormSection>
    </div>
  )

  const actions = (
    <>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isEdit ? 'حفظ التعديلات' : 'حفظ القضية'}
      </Button>
      <Button type="button" variant="outline" onClick={onDone}>
        إلغاء
      </Button>
    </>
  )

  /* ===================== الوضعان ===================== */

  if (isPage) {
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-4xl">
        {/* شريط ثابت: الحفظ في متناول اليد مهما طال التمرير */}
        <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 px-4 py-3 backdrop-blur">
          <h2 className="text-lg font-bold text-foreground">
            {isEdit ? 'تعديل قضية' : 'قضية جديدة'}
          </h2>
          <div className="flex gap-2">{actions}</div>
        </div>
        {body}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل قضية' : 'قضية جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] overflow-y-auto pl-1 pr-1">{body}</div>

      <DialogFooter className="gap-2">{actions}</DialogFooter>
    </form>
  )
}
