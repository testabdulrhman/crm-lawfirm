import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  ImagePlus,
  Scale,
  Building2,
  ReceiptText,
  Landmark,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  useOfficeInfo,
  useUpdateOfficeInfo,
  useLookups,
  useCreateLookup,
  useUpdateLookup,
} from '@/hooks/useSettings'
import { pickFile, uploadFile } from '@/lib/files'
import { toast } from '@/hooks/use-toast'
import type { OfficeInfo, OfficeInfoInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

// توقيع المدير يُخزَّن في lookup_values (إعدادات التكاملات) — بلا أعمدة جديدة
export const SIGNATURE_CONFIG_KEY = 'director_signature_url'

const schema = z.object({
  office_name: z.string().optional(),
  address: z.string().optional(),
  location_url: z.string().url('الرابط غير صحيح').optional().or(z.literal('')),
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
    location_url: o?.location_url ?? '',
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
  const { data: lookups } = useLookups()
  const createLookupM = useCreateLookup()
  const updateLookupM = useUpdateLookup()
  const [uploading, setUploading] = useState<string | null>(null)

  const signatureRow = (lookups ?? []).find(
    (l) => l.type === 'integration_config' && l.label === SIGNATURE_CONFIG_KEY
  )

  // رفع صورة علامة (شعار/ختم/توقيع) وحفظ رابطها في وجهتها
  const pickAndSave = async (
    kind: string,
    save: (url: string) => void
  ) => {
    const f = await pickFile({ accept: 'image/*' })
    if (!f) return
    setUploading(kind)
    try {
      const res = await uploadFile(f, { bucket: 'avatars', folder: 'branding' })
      save(res.publicUrl)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر رفع الصورة',
        description: errMessage(e),
      })
    } finally {
      setUploading(null)
    }
  }

  const onPickLogo = () =>
    pickAndSave('logo', (url) =>
      updateM.mutate({ id: data?.id ?? null, input: { logo_url: url } })
    )
  const onPickStamp = () =>
    pickAndSave('stamp', (url) =>
      updateM.mutate({ id: data?.id ?? null, input: { stamp_url: url } })
    )
  const onPickSignature = () =>
    pickAndSave('signature', (url) => {
      if (signatureRow)
        updateLookupM.mutate({
          id: signatureRow.id,
          input: {
            type: 'integration_config',
            label: SIGNATURE_CONFIG_KEY,
            value: url,
          },
        })
      else
        createLookupM.mutate({
          type: 'integration_config',
          label: SIGNATURE_CONFIG_KEY,
          value: url,
          sort_order: 0,
        })
    })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
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
    // يحاكي البنية الفعلية: بطاقة هوية بثلاث خانات ثم بطاقة نموذج بحقول ثنائية
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-8 w-40" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-8 w-40" />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* الهوية البصرية: الشعار + الختم + التوقيع */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <SectionTitle icon={ImagePlus} title="الهوية البصرية" />
          <div className="grid gap-3 sm:grid-cols-3">
            <BrandingCard
              title="شعار المكتب"
              hint="يظهر في القائمة الجانبية — يُفضَّل PNG بخلفية شفافة."
              imageUrl={data?.logo_url}
              uploading={uploading === 'logo'}
              onPick={onPickLogo}
            />
            <BrandingCard
              title="ختم الشركة"
              hint="يُدمَج في خطابات الصادر عند اعتماد المدير."
              imageUrl={data?.stamp_url}
              uploading={uploading === 'stamp'}
              onPick={onPickStamp}
            />
            <BrandingCard
              title="توقيع المدير"
              hint="اختياري — يُدمَج عند الاعتماد متى ما رُفع."
              imageUrl={signatureRow?.value}
              uploading={uploading === 'signature'}
              onPick={onPickSignature}
            />
          </div>
        </CardContent>
      </Card>

      {/* البيانات — مجمَّعة في أقسام واضحة */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <section className="space-y-4">
              <SectionTitle icon={Building2} title="بيانات المكتب" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="اسم المكتب" id="office_name">
                  <Input id="office_name" {...register('office_name')} />
                </FormField>
                <FormField label="العنوان" id="address">
                  <Input id="address" {...register('address')} />
                </FormField>
                <FormField
                  label="رابط موقع المكتب (خرائط)"
                  id="location_url"
                  error={errors.location_url?.message}
                >
                  <Input
                    id="location_url"
                    dir="ltr"
                    placeholder="https://maps.app.goo.gl/…"
                    {...register('location_url')}
                  />
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
              </div>
            </section>

            <section className="space-y-4 border-t pt-5">
              <SectionTitle icon={ReceiptText} title="البيانات النظامية" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>
            </section>

            <section className="space-y-4 border-t pt-5">
              <SectionTitle
                icon={Landmark}
                title="الحساب البنكي"
                hint="يُستخدم في العقود والفواتير."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="اسم البنك" id="bank_name">
                  <Input id="bank_name" {...register('bank_name')} />
                </FormField>
                <FormField label="الآيبان (IBAN)" id="iban">
                  <Input id="iban" dir="ltr" {...register('iban')} />
                </FormField>
                <FormField label="رقم الحساب" id="account_number">
                  <Input
                    id="account_number"
                    dir="ltr"
                    {...register('account_number')}
                  />
                </FormField>
                <FormField label="الاسم المختصر للحساب" id="account_short_name">
                  <Input
                    id="account_short_name"
                    {...register('account_short_name')}
                  />
                </FormField>
              </div>
            </section>

            <section className="space-y-4 border-t pt-5">
              <FormField label="تفاصيل إضافية" id="details">
                <Textarea id="details" rows={3} {...register('details')} />
              </FormField>
            </section>

            <div className="flex items-center justify-end gap-3 border-t pt-4">
              {isDirty && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-500">
                  تغييرات غير محفوظة
                </span>
              )}
              <Button type="submit" variant="gold" disabled={updateM.isPending}>
                {updateM.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                حفظ البيانات
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

// عنوان قسم بنمط النظام: أيقونة في مربع ذهبي + نص
function SectionTitle({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon
  title: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold/10">
        <Icon className="h-[18px] w-[18px] text-gold" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

// بطاقة علامة (شعار/ختم/توقيع): معاينة ثابتة الارتفاع + زر بعرض البطاقة
function BrandingCard({
  title,
  hint,
  imageUrl,
  uploading,
  onPick,
}: {
  title: string
  hint: string
  imageUrl: string | null | undefined
  uploading: boolean
  onPick: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex h-24 items-center justify-center rounded-lg bg-white ring-1 ring-border">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="max-h-20 max-w-[85%] object-contain"
          />
        ) : (
          <Scale className="h-7 w-7 text-gold/60" />
        )}
      </div>
      <div className="min-h-[3.25rem]">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onPick}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {imageUrl ? 'تغيير' : 'رفع'}
      </Button>
    </div>
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
