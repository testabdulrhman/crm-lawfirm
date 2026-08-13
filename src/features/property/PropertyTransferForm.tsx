import { useState } from 'react'
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
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { SelectOrOther } from '@/components/SelectOrOther'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import {
  useCreatePropertyTransfer,
  useUpdatePropertyTransfer,
} from '@/hooks/usePropertyTransfers'
import {
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  TRANSFER_TYPE_OPTIONS,
} from '@/lib/propertyLabels'
import type {
  Contact,
  PropertyTransfer,
  PropertyTransferInput,
} from '@/types/db'

const schema = z.object({
  transfer_type: z.string().optional(),
  seller_name: z.string().optional(),
  seller_id_num: z.string().optional(),
  seller_phone: z.string().optional(),
  buyer_name: z.string().optional(),
  buyer_id_num: z.string().optional(),
  buyer_phone: z.string().optional(),
  property_type: z.string().optional(),
  deed_number: z.string().optional(),
  area: z.string().optional(),
  location: z.string().optional(),
  property_notes: z.string().optional(),
  amount: z.string().optional(),
  amount_text: z.string().optional(),
  transfer_date: z.string().optional(),
  status: z.string().min(1),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold text-gold-600 dark:text-gold-300">
        {title}
      </h3>
      {children}
    </div>
  )
}

export function PropertyTransferForm({
  transfer,
  onDone,
}: {
  transfer?: PropertyTransfer | null
  onDone: () => void
}) {
  const isEdit = Boolean(transfer)
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const createM = useCreatePropertyTransfer()
  const updateM = useUpdatePropertyTransfer()
  const pending = createM.isPending || updateM.isPending

  const [sellerId, setSellerId] = useState<string | null>(transfer?.seller_id ?? null)
  const [buyerId, setBuyerId] = useState<string | null>(transfer?.buyer_id ?? null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transfer_type: transfer?.transfer_type ?? 'نقل ملكية',
      seller_name: transfer?.seller_name ?? '',
      seller_id_num: transfer?.seller_id_num ?? '',
      seller_phone: transfer?.seller_phone ?? '',
      buyer_name: transfer?.buyer_name ?? '',
      buyer_id_num: transfer?.buyer_id_num ?? '',
      buyer_phone: transfer?.buyer_phone ?? '',
      property_type: transfer?.property_type ?? '',
      deed_number: transfer?.deed_number ?? '',
      area: transfer?.area != null ? String(transfer.area) : '',
      location: transfer?.location ?? '',
      property_notes: transfer?.property_notes ?? '',
      amount: transfer?.amount != null ? String(transfer.amount) : '',
      amount_text: transfer?.amount_text ?? '',
      transfer_date: transfer?.transfer_date ?? '',
      status: transfer?.status ?? 'قيد التنفيذ',
      notes: transfer?.notes ?? '',
    },
  })

  const fillSeller = (c: Contact | null) => {
    setSellerId(c?.id ?? null)
    if (c) {
      setValue('seller_name', c.name ?? '')
      setValue('seller_phone', c.phone ?? '')
      setValue('seller_id_num', c.id_number ?? '')
    }
  }
  const fillBuyer = (c: Contact | null) => {
    setBuyerId(c?.id ?? null)
    if (c) {
      setValue('buyer_name', c.name ?? '')
      setValue('buyer_phone', c.phone ?? '')
      setValue('buyer_id_num', c.id_number ?? '')
    }
  }

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const num = (v: string | undefined) => {
      const n = v != null && v.trim() !== '' ? Number(v) : null
      return n != null && !isNaN(n) ? n : null
    }
    const input: PropertyTransferInput = {
      transfer_type: t(values.transfer_type),
      seller_id: sellerId,
      seller_name: t(values.seller_name),
      seller_id_num: t(values.seller_id_num),
      seller_phone: t(values.seller_phone),
      buyer_id: buyerId,
      buyer_name: t(values.buyer_name),
      buyer_id_num: t(values.buyer_id_num),
      buyer_phone: t(values.buyer_phone),
      property_type: t(values.property_type),
      deed_number: t(values.deed_number),
      area: num(values.area),
      location: t(values.location),
      property_notes: t(values.property_notes),
      amount: num(values.amount),
      amount_text: t(values.amount_text),
      transfer_date: t(values.transfer_date),
      status: values.status,
      notes: t(values.notes),
    }
    if (isEdit && transfer) {
      await updateM.mutateAsync({ id: transfer.id, input })
    } else {
      await createM.mutateAsync({ ...input, created_by: teamMember?.name ?? null })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل معاملة' : 'معاملة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[64vh] space-y-3 overflow-y-auto pl-1 pr-1">
        {/* البائع */}
        <Section title="البائع">
          <ContactPicker
            contacts={contacts ?? []}
            value={sellerId}
            onSelect={fillSeller}
            placeholder="اختر البائع من جهات الاتصال…"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seller_name">اسم البائع</Label>
              <Input id="seller_name" {...register('seller_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller_phone">جوال البائع</Label>
              <Input
                id="seller_phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                {...register('seller_phone')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="seller_id_num">هوية البائع</Label>
              <Input
                id="seller_id_num"
                inputMode="numeric"
                dir="ltr"
                {...register('seller_id_num')}
              />
            </div>
          </div>
        </Section>

        {/* المشتري */}
        <Section title="المشتري">
          <ContactPicker
            contacts={contacts ?? []}
            value={buyerId}
            onSelect={fillBuyer}
            placeholder="اختر المشتري من جهات الاتصال…"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="buyer_name">اسم المشتري</Label>
              <Input id="buyer_name" {...register('buyer_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="buyer_phone">جوال المشتري</Label>
              <Input
                id="buyer_phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                {...register('buyer_phone')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="buyer_id_num">هوية المشتري</Label>
              <Input
                id="buyer_id_num"
                inputMode="numeric"
                dir="ltr"
                {...register('buyer_id_num')}
              />
            </div>
          </div>
        </Section>

        {/* العقار */}
        <Section title="العقار">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع العقار</Label>
              <Controller
                control={control}
                name="property_type"
                render={({ field }) => (
                  <SelectOrOther
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={PROPERTY_TYPE_OPTIONS}
                    placeholder="أرض / فيلا…"
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deed_number">رقم الصك</Label>
              <Input id="deed_number" inputMode="numeric" dir="ltr" {...register('deed_number')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">المساحة (م²)</Label>
              <Input id="area" type="number" step="any" dir="ltr" {...register('area')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">الموقع</Label>
              <Input id="location" {...register('location')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property_notes">ملاحظات العقار</Label>
            <Textarea id="property_notes" rows={2} {...register('property_notes')} />
          </div>
        </Section>

        {/* المالية */}
        <Section title="المالية">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">المبلغ (ريال)</Label>
              <Input id="amount" type="number" step="any" dir="ltr" {...register('amount')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount_text">المبلغ كتابةً</Label>
              <Input id="amount_text" {...register('amount_text')} />
            </div>
          </div>
        </Section>

        {/* عام */}
        <Section title="عام">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع المعاملة</Label>
              <Controller
                control={control}
                name="transfer_type"
                render={({ field }) => (
                  <SelectOrOther
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={TRANSFER_TYPE_OPTIONS}
                    placeholder="نقل ملكية…"
                  />
                )}
              />
            </div>
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
                      {PROPERTY_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Controller
              control={control}
              name="transfer_date"
              render={({ field }) => (
                <DualDatePicker
                  label="تاريخ الإفراغ"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt_notes">ملاحظات</Label>
            <Textarea id="pt_notes" rows={2} {...register('notes')} />
          </div>
        </Section>
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
