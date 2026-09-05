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
import { useAuth } from '@/stores/auth'
import { todayISO } from '@/lib/format'
import { useContacts } from '@/hooks/useContacts'
import { useCreateRequest, useUpdateRequest } from '@/hooks/useRequests'
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { CAPACITY_LABELS, CRITICAL_KIND_LABELS, SOURCE_OPTIONS, TYPE_OPTIONS } from './labels'
import { CASE_TYPES } from '@/lib/caseLabels'
import type { Contact, IncomingRequest, IncomingRequestInput } from '@/types/db'

const NONE = '__none__'

const schema = z.object({
  client_name: z.string().min(1, 'اختر العميل من جهات الاتصال أو أضفه جديداً'),
  client_phone: z.string().optional(),
  client_email: z.string().optional(),
  request_type: z.string().min(1, 'نوع الطلب مطلوب'),
  case_type: z.string().optional(),
  source: z.string().optional(),
  received_at: z.string().min(1, 'تاريخ الاستلام مطلوب'),
  description: z.string().optional(),
  client_id: z.string().optional(),
  // الجلسة التمهيدية — بند ٢ من الوثيقة: جمع بيانات لا إبداء رأي
  capacity: z.enum(['principal', 'agent']).optional(),
  opponent_name: z.string().optional(),
  court_name: z.string().optional(),
  claim_number: z.string().optional(),
  critical_date: z.string().optional(),
  critical_date_kind: z.enum(['notice', 'objection', 'prescription']).optional(),
  prior_lawyer: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toDefaults(r?: IncomingRequest | null): FormValues {
  return {
    client_name: r?.client_name ?? '',
    client_phone: r?.client_phone ?? '',
    client_email: r?.client_email ?? '',
    request_type: r?.request_type ?? 'case',
    case_type: r?.case_type ?? NONE,
    source: r?.source ?? 'هاتف',
    received_at: r?.received_at ?? todayISO(),
    description: r?.description ?? '',
    client_id: r?.client_id ?? NONE,
    capacity: r?.capacity ?? 'principal',
    opponent_name: r?.opponent_name ?? '',
    court_name: r?.court_name ?? '',
    claim_number: r?.claim_number ?? '',
    critical_date: r?.critical_date ?? '',
    critical_date_kind: r?.critical_date_kind ?? undefined,
    prior_lawyer: r?.prior_lawyer ?? '',
  }
}

export function RequestForm({
  request,
  onDone,
}: {
  request?: IncomingRequest | null
  onDone: () => void
}) {
  const isEdit = Boolean(request)
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const createM = useCreateRequest()
  const updateM = useUpdateRequest()
  const pending = createM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(request),
  })

  // طلب قديم مسجل بالاسم الحر بلا جهة اتصال — نعرضه بدل إخفائه
  const watchedClientId = watch('client_id')
  const legacyName =
    isEdit && (!watchedClientId || watchedClientId === NONE)
      ? request?.client_name || ''
      : ''

  const onSubmit = async (values: FormValues) => {
    const input: IncomingRequestInput = {
      client_name: values.client_name.trim(),
      client_phone: values.client_phone?.trim() || null,
      client_email: values.client_email?.trim() || null,
      case_type: values.case_type && values.case_type !== NONE ? values.case_type : null,
      request_type: values.request_type,
      source: values.source ?? 'هاتف',
      received_at: values.received_at,
      description: values.description?.trim() || null,
      client_id: values.client_id && values.client_id !== NONE ? values.client_id : null,
      capacity: values.capacity ?? null,
      opponent_name: values.opponent_name?.trim() || null,
      court_name: values.court_name?.trim() || null,
      claim_number: values.claim_number?.trim() || null,
      critical_date: values.critical_date || null,
      critical_date_kind: values.critical_date ? (values.critical_date_kind ?? 'objection') : null,
      prior_lawyer: values.prior_lawyer?.trim() || null,
    }
    if (isEdit && request) {
      await updateM.mutateAsync({ id: request.id, input })
    } else {
      // عند الإضافة: الحالة قيد الدراسة + المُنشئ = المستخدم الحالي
      await createM.mutateAsync({
        ...input,
        status: 'under_review',
        created_by: teamMember?.name ?? null,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل طلب' : 'طلب جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* العميل من سجل جهات الاتصال — الأساس لا الاستثناء: الجديد
              يُنشأ جهة اتصال من داخل المنتقي فيبقى في سجل المكتب الموحد */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>العميل *</Label>
            <Controller
              control={control}
              name="client_id"
              render={({ field }) => (
                <ContactPicker
                  contacts={contacts ?? []}
                  value={field.value && field.value !== NONE ? field.value : null}
                  placeholder="ابحث بالاسم أو الجوال — أو أضف جهة جديدة…"
                  onSelect={(c: Contact | null) => {
                    field.onChange(c?.id ?? NONE)
                    setValue('client_name', c?.name ?? '')
                    setValue('client_phone', c?.phone ?? '')
                  }}
                />
              )}
            />
            {legacyName && (
              <p className="text-xs text-muted-foreground">
                الطلب مسجل باسم «{legacyName}» بلا جهة اتصال — اختر جهة لربطه
                (أو اتركه كما هو).
              </p>
            )}
            {errors.client_name && (
              <p className="text-xs text-destructive">
                {errors.client_name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client_email">البريد الإلكتروني</Label>
            <Input
              id="client_email"
              type="email"
              dir="ltr"
              placeholder="example@email.com"
              {...register('client_email')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>نوع الطلب *</Label>
            <Controller
              control={control}
              name="request_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.request_type && (
              <p className="text-xs text-destructive">
                {errors.request_type.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>نوع القضية</Label>
            <Controller
              control={control}
              name="case_type"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="غير محدّد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>غير محدّد</SelectItem>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              ينتقل إلى الملف عند فتحه — فلا يُعاد تصنيفه مرتين.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>قناة الوصول</Label>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'هاتف'}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              توحيد القناة — حتى لا يضيع استفسار على جوال شخصي بلا سجل.
            </p>
          </div>

          {/* ===== الجلسة التمهيدية — بند ٢: جمع بيانات لا إبداء رأي ===== */}
          <div className="space-y-1.5">
            <Label>الصفة</Label>
            <Controller
              control={control}
              name="capacity"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'principal'}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(CAPACITY_LABELS) as Array<
                        keyof typeof CAPACITY_LABELS
                      >
                    ).map((k) => (
                      <SelectItem key={k} value={k}>
                        {CAPACITY_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="opponent_name">
              الأطراف المقابلة (بأسمائها الرسمية)
            </Label>
            <Input
              id="opponent_name"
              placeholder="يتعبأ تلقائياً في فحص التعارض"
              {...register('opponent_name')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="court_name">الجهة القضائية (إن وُجدت)</Label>
            <Input id="court_name" {...register('court_name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim_number">رقم الدعوى (إن وُجد)</Label>
            <Input id="claim_number" dir="ltr" {...register('claim_number')} />
          </div>

          <div className="space-y-1.5">
            <Controller
              control={control}
              name="critical_date"
              render={({ field }) => (
                <DualDatePicker
                  label="⚠ أقرب تاريخ حرج"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>نوع التاريخ الحرج</Label>
            <Controller
              control={control}
              name="critical_date_kind"
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="تبليغ / اعتراض / تقادم" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(CRITICAL_KIND_LABELS) as Array<
                        keyof typeof CRITICAL_KIND_LABELS
                      >
                    ).map((k) => (
                      <SelectItem key={k} value={k}>
                        {CRITICAL_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              وجود تاريخ حرج يرفع الطلب عاجلاً لرأس السجل — نص الوثيقة.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="prior_lawyer">محامٍ سابق ووضع العلاقة</Label>
            <Input
              id="prior_lawyer"
              placeholder="اتركه فارغاً إن لم يوجد"
              {...register('prior_lawyer')}
            />
          </div>
          <div className="space-y-1.5">
            <Controller
              control={control}
              name="received_at"
              render={({ field }) => (
                <DualDatePicker
                  label="تاريخ الاستلام"
                  required
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
            {errors.received_at && (
              <p className="text-xs text-destructive">
                {errors.received_at.message}
              </p>
            )}
          </div>

        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">وصف الطلب</Label>
          <Textarea
            id="description"
            rows={4}
            {...register('description')}
          />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
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
