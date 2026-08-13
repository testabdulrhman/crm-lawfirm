// نموذج إضافة/تعديل عقد (اتفاقية أتعاب) — رقم تلقائي قابل للتعديل + تحقق تكرار لحظي
import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Paperclip, X } from 'lucide-react'

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
import { pickFile, uploadFile } from '@/lib/files'
import { todayISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import {
  useEngagements,
  useCreateEngagement,
  useUpdateEngagement,
} from '@/hooks/useEngagements'
import { ENG_TYPE_OPTIONS } from './labels'
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
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const pending = createM.isPending || updateM.isPending || uploading

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

    let fileUrl: string | null | undefined
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, { folder: 'engagements' })
        fileUrl = publicUrl
      } catch (err) {
        // فشل الرفع يوقف الحفظ برسالة واضحة — لا حفظ عقد بلا ملفه المختار
        toast({
          variant: 'destructive',
          title: 'تعذّر رفع ملف العقد',
          description: errMessage(err),
        })
        return
      } finally {
        setUploading(false)
      }
    }

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

    if (isEdit && engagement) {
      await updateM.mutateAsync({ id: engagement.id, input })
    } else {
      await createM.mutateAsync({ ...input, created_by: teamMember?.id ?? null })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل العقد' : 'عقد جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
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
            onSelect={(c) => setClientId(c?.id ?? null)}
          />
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

        {/* ملف العقد الموقّع */}
        <div className="space-y-1.5">
          <Label>ملف العقد الموقّع</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const f = await pickFile()
                if (f) setFile(f)
              }}
            >
              <Paperclip className="h-4 w-4" />
              اختيار ملف
            </Button>
            {file ? (
              <span className="truncate text-xs text-muted-foreground">
                {file.name}
              </span>
            ) : engagement?.file_url ? (
              <span className="text-xs text-muted-foreground">يوجد ملف مرفق</span>
            ) : null}
            {file && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => setFile(null)}
              >
                <X className="h-3.5 w-3.5" />
                إزالة
              </Button>
            )}
          </div>
        </div>
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
