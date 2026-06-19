import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { useOfficeInfo, useUpdateOfficeInfo } from '@/hooks/useSettings'
import type { OfficeInfo, OfficeInfoInput } from '@/types/db'

const schema = z.object({
  office_name: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('صيغة البريد غير صحيحة').optional().or(z.literal('')),
  tax_number: z.string().optional(),
  commercial_register: z.string().optional(),
  bank_name: z.string().optional(),
  iban: z.string().optional(),
  account_number: z.string().optional(),
  account_short_name: z.string().optional(),
  details: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toDefaults(o?: OfficeInfo | null): FormValues {
  return {
    office_name: o?.office_name ?? '',
    address: o?.address ?? '',
    phone: o?.phone ?? '',
    email: o?.email ?? '',
    tax_number: o?.tax_number ?? '',
    commercial_register: o?.commercial_register ?? '',
    bank_name: o?.bank_name ?? '',
    iban: o?.iban ?? '',
    account_number: o?.account_number ?? '',
    account_short_name: o?.account_short_name ?? '',
    details: o?.details ?? '',
  }
}

function clean(values: FormValues): OfficeInfoInput {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? null : v
  }
  return out as OfficeInfoInput
}

export function OfficeInfoTab() {
  const { data, isLoading } = useOfficeInfo()
  const updateM = useUpdateOfficeInfo()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(data),
  })

  // عبّئ القيم عند وصول البيانات
  useEffect(() => {
    if (data) reset(toDefaults(data))
  }, [data, reset])

  const onSubmit = (values: FormValues) => {
    updateM.mutate({ id: data?.id ?? null, input: clean(values) })
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="اسم المكتب" id="office_name">
              <Input id="office_name" {...register('office_name')} />
            </FormField>
            <FormField label="العنوان" id="address">
              <Input id="address" {...register('address')} />
            </FormField>
            <FormField label="الهاتف" id="phone">
              <Input id="phone" dir="ltr" {...register('phone')} />
            </FormField>
            <FormField
              label="البريد الإلكتروني"
              id="email"
              error={errors.email?.message}
            >
              <Input id="email" type="email" dir="ltr" {...register('email')} />
            </FormField>
            <FormField label="الرقم الضريبي" id="tax_number">
              <Input id="tax_number" dir="ltr" {...register('tax_number')} />
            </FormField>
            <FormField label="السجل التجاري" id="commercial_register">
              <Input
                id="commercial_register"
                dir="ltr"
                {...register('commercial_register')}
              />
            </FormField>
            <FormField label="اسم البنك" id="bank_name">
              <Input id="bank_name" {...register('bank_name')} />
            </FormField>
            <FormField label="الآيبان (IBAN)" id="iban">
              <Input id="iban" dir="ltr" {...register('iban')} />
            </FormField>
            <FormField label="رقم الحساب" id="account_number">
              <Input id="account_number" dir="ltr" {...register('account_number')} />
            </FormField>
            <FormField label="الاسم المختصر للحساب" id="account_short_name">
              <Input
                id="account_short_name"
                {...register('account_short_name')}
              />
            </FormField>
          </div>

          <FormField label="تفاصيل" id="details">
            <Textarea id="details" {...register('details')} />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" variant="gold" disabled={updateM.isPending}>
              {updateM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormField({
  label,
  id,
  error,
  children,
}: {
  label: string
  id: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
