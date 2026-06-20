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
import { useCreateContact, useUpdateContact } from '@/hooks/useContacts'
import { CATEGORY_OPTIONS, ENTITY_OPTIONS } from '@/lib/contactLabels'
import type { Contact, ContactInput } from '@/types/db'

// عند الكتابة: نكتب category و type معاً. service → type='client' (أقرب قيمة قديمة مقبولة).
function categoryToType(category: string): string {
  return category === 'service' ? 'client' : category
}

const schema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  category: z.string().min(1, 'التصنيف مطلوب'),
  entity_type: z.string().min(1, 'النوع مطلوب'),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  email: z.string().email('صيغة البريد غير صحيحة').optional().or(z.literal('')),
  city: z.string().optional(),
  nationality: z.string().optional(),
  id_number: z.string().optional(),
  gender: z.string().optional(),
  birth_date: z.string().optional(),
  occupation: z.string().optional(),
  contract_date: z.string().optional(),
  serial_number: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toDefaults(c?: Contact | null): FormValues {
  return {
    name: c?.name ?? '',
    category: c?.category ?? 'caller',
    entity_type: c?.entity_type ?? 'فرد',
    phone: c?.phone ?? '',
    phone2: c?.phone2 ?? '',
    email: c?.email ?? '',
    city: c?.city ?? '',
    nationality: c?.nationality ?? '',
    id_number: c?.id_number ?? '',
    gender: c?.gender ?? '',
    birth_date: c?.birth_date ?? '',
    occupation: c?.occupation ?? '',
    contract_date: c?.contract_date ?? '',
    serial_number: c?.serial_number ?? '',
    notes: c?.notes ?? '',
  }
}

function clean(values: FormValues): ContactInput {
  const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
  return {
    name: values.name.trim(),
    category: values.category,
    type: categoryToType(values.category),
    entity_type: values.entity_type,
    phone: t(values.phone),
    phone2: t(values.phone2),
    email: t(values.email),
    city: t(values.city),
    nationality: t(values.nationality),
    id_number: t(values.id_number),
    gender: t(values.gender),
    birth_date: t(values.birth_date),
    occupation: t(values.occupation),
    contract_date: t(values.contract_date),
    serial_number: t(values.serial_number),
    notes: t(values.notes),
  }
}

function Field({
  label,
  htmlFor,
  error,
  children,
  full,
}: {
  label: string
  htmlFor?: string
  error?: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={'space-y-1.5 ' + (full ? 'sm:col-span-2' : '')}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ContactForm({
  contact,
  onDone,
}: {
  contact?: Contact | null
  onDone: () => void
}) {
  const isEdit = Boolean(contact)
  const createM = useCreateContact()
  const updateM = useUpdateContact()
  const pending = createM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(contact),
  })

  const onSubmit = async (values: FormValues) => {
    const input = clean(values)
    if (isEdit && contact) {
      await updateM.mutateAsync({ id: contact.id, input })
    } else {
      await createM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل جهة اتصال' : 'جهة اتصال جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] overflow-y-auto pl-1 pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم *" htmlFor="name" error={errors.name?.message} full>
            <Input id="name" {...register('name')} />
          </Field>

          <Field label="التصنيف *">
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="النوع *">
            <Controller
              control={control}
              name="entity_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="فرد / منشأة" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_OPTIONS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="الجوال" htmlFor="phone">
            <Input id="phone" dir="ltr" {...register('phone')} />
          </Field>
          <Field label="جوال آخر" htmlFor="phone2">
            <Input id="phone2" dir="ltr" {...register('phone2')} />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" dir="ltr" {...register('email')} />
          </Field>
          <Field label="المدينة" htmlFor="city">
            <Input id="city" {...register('city')} />
          </Field>
          <Field label="الجنسية" htmlFor="nationality">
            <Input id="nationality" {...register('nationality')} />
          </Field>
          <Field label="رقم الهوية" htmlFor="id_number">
            <Input id="id_number" dir="ltr" {...register('id_number')} />
          </Field>
          <Field label="الجنس" htmlFor="gender">
            <Input id="gender" {...register('gender')} />
          </Field>
          <Field label="تاريخ الميلاد" htmlFor="birth_date">
            <Input id="birth_date" type="date" {...register('birth_date')} />
          </Field>
          <Field label="المهنة" htmlFor="occupation">
            <Input id="occupation" {...register('occupation')} />
          </Field>
          <Field label="تاريخ التعاقد" htmlFor="contract_date">
            <Input id="contract_date" type="date" {...register('contract_date')} />
          </Field>
          <Field label="الرقم التسلسلي" htmlFor="serial_number">
            <Input id="serial_number" dir="ltr" {...register('serial_number')} />
          </Field>
          <Field label="ملاحظات" htmlFor="notes" full>
            <Textarea id="notes" {...register('notes')} />
          </Field>
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
