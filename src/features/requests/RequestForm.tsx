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
import { TYPE_OPTIONS } from './labels'
import type { IncomingRequest, IncomingRequestInput } from '@/types/db'

const NONE = '__none__'

const schema = z.object({
  client_name: z.string().min(1, 'اسم العميل مطلوب'),
  client_phone: z.string().optional(),
  request_type: z.string().min(1, 'نوع الطلب مطلوب'),
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="received_at">تاريخ الاستلام *</Label>
            <Input id="received_at" type="date" {...register('received_at')} />
            {errors.received_at && (
              <p className="text-xs text-destructive">
                {errors.received_at.message}
              </p>
            )}
          </div>

          {/* ربط بجهة اتصال (اختياري). لاحقاً: بحث متقدّم في contacts. */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ربط بجهة اتصال (اختياري)</Label>
            <Controller
              control={control}
              name="client_id"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون</SelectItem>
                    {(contacts ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
