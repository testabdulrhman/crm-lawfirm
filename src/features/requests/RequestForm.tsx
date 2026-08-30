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
import { SOURCE_OPTIONS, TYPE_OPTIONS } from './labels'
import type { Contact, IncomingRequest, IncomingRequestInput } from '@/types/db'

const NONE = '__none__'

const schema = z.object({
  client_name: z.string().min(1, 'اسم العميل مطلوب'),
  client_phone: z.string().optional(),
  request_type: z.string().min(1, 'نوع الطلب مطلوب'),
  source: z.string().optional(),
  received_at: z.string().min(1, 'تاريخ الاستلام مطلوب'),
  description: z.string().optional(),
  client_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toDefaults(r?: IncomingRequest | null): FormValues {
  return {
    client_name: r?.client_name ?? '',
    client_phone: r?.client_phone ?? '',
    request_type: r?.request_type ?? 'case',
    source: r?.source ?? 'هاتف',
    received_at: r?.received_at ?? todayISO(),
    description: r?.description ?? '',
    client_id: r?.client_id ?? NONE,
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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(request),
  })

  const onSubmit = async (values: FormValues) => {
    const input: IncomingRequestInput = {
      client_name: values.client_name.trim(),
      client_phone: values.client_phone?.trim() || null,
      request_type: values.request_type,
      source: values.source ?? 'هاتف',
      received_at: values.received_at,
      description: values.description?.trim() || null,
      client_id: values.client_id && values.client_id !== NONE ? values.client_id : null,
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
          <div className="space-y-1.5">
            <Label htmlFor="client_name">اسم العميل *</Label>
            <Input id="client_name" {...register('client_name')} />
            {errors.client_name && (
              <p className="text-xs text-destructive">
                {errors.client_name.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client_phone">الجوال</Label>
            <Input id="client_phone" dir="ltr" {...register('client_phone')} />
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

          {/* ربط بجهة اتصال (اختياري) — الاختيار يعبّئ الاسم والجوال تلقائياً */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ربط بجهة اتصال (اختياري)</Label>
            <Controller
              control={control}
              name="client_id"
              render={({ field }) => (
                <ContactPicker
                  contacts={contacts ?? []}
                  value={field.value && field.value !== NONE ? field.value : null}
                  onSelect={(c: Contact | null) => {
                    field.onChange(c?.id ?? NONE)
                    if (c) {
                      setValue('client_name', c.name ?? '')
                      setValue('client_phone', c.phone ?? '')
                    }
                  }}
                />
              )}
            />
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
