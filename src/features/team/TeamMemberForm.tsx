import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DualDatePicker } from '@/components/DualDatePicker'
import { useCreateTeamMember, useUpdateTeamMember } from '@/hooks/useTeam'
import type { TeamMember, TeamMemberInput } from '@/types/db'

// حقل نصي اختياري: يقبل الفراغ
const optionalText = z.string().optional()

const schema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  short_name: optionalText,
  role: optionalText,
  email: z
    .string()
    .email('صيغة البريد غير صحيحة')
    .optional()
    .or(z.literal('')),
  phone: optionalText,
  is_director: z.boolean(),
  is_active: z.boolean(),
  date_of_birth: optionalText,
  id_number: optionalText,
  join_date: optionalText,
  national_address: optionalText,
  bank_name: optionalText,
  bank_iban: optionalText,
  qualifications: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  emergency_contact_relation: optionalText,
})

type FormValues = z.infer<typeof schema>

function toDefaults(member?: TeamMember | null): FormValues {
  return {
    name: member?.name ?? '',
    short_name: member?.short_name ?? '',
    role: member?.role ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    is_director: member?.is_director ?? false,
    is_active: member?.is_active ?? true,
    date_of_birth: member?.date_of_birth ?? '',
    id_number: member?.id_number ?? '',
    join_date: member?.join_date ?? '',
    national_address: member?.national_address ?? '',
    bank_name: member?.bank_name ?? '',
    bank_iban: member?.bank_iban ?? '',
    qualifications: member?.qualifications ?? '',
    emergency_contact_name: member?.emergency_contact_name ?? '',
    emergency_contact_phone: member?.emergency_contact_phone ?? '',
    emergency_contact_relation: member?.emergency_contact_relation ?? '',
  }
}

// حوّل الفراغ إلى null لقاعدة البيانات
function clean(values: FormValues): TeamMemberInput {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') out[k] = v.trim() === '' ? null : v.trim()
    else out[k] = v
  }
  return out as TeamMemberInput
}

interface Props {
  member?: TeamMember | null
  onDone: () => void
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gold-600 dark:text-gold-300">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function TeamMemberForm({ member, onDone }: Props) {
  const isEdit = Boolean(member)
  const createM = useCreateTeamMember()
  const updateM = useUpdateTeamMember()
  const pending = createM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(member),
  })

  const isDirector = watch('is_director')
  const isActive = watch('is_active')

  const onSubmit = async (values: FormValues) => {
    const input = clean(values)
    if (isEdit && member) {
      await updateM.mutateAsync({ id: member.id, input })
    } else {
      await createM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل موظف' : 'موظف جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] space-y-6 overflow-y-auto pl-1 pr-1">
        {/* أساسي */}
        <Section title="بيانات أساسية">
          <Field label="الاسم *" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label="الاسم المختصر" htmlFor="short_name">
            <Input id="short_name" {...register('short_name')} />
          </Field>
          <Field label="الدور / المسمى" htmlFor="role">
            <Input id="role" {...register('role')} />
          </Field>
          <Field
            label="البريد الإلكتروني"
            htmlFor="email"
            error={errors.email?.message}
          >
            <Input id="email" type="email" dir="ltr" {...register('email')} />
          </Field>
          <Field label="الجوال" htmlFor="phone">
            <Input id="phone" dir="ltr" {...register('phone')} />
          </Field>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={isDirector}
                onCheckedChange={(v) => setValue('is_director', v)}
              />
              مدير
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={isActive}
                onCheckedChange={(v) => setValue('is_active', v)}
              />
              نشط
            </label>
          </div>
        </Section>

        {/* شخصي */}
        <Section title="بيانات شخصية">
          <DualDatePicker
            label="تاريخ الميلاد"
            value={watch('date_of_birth') || null}
            onChange={(v) => setValue('date_of_birth', v ?? '')}
          />
          <Field label="رقم الهوية" htmlFor="id_number">
            <Input id="id_number" dir="ltr" {...register('id_number')} />
          </Field>
          <DualDatePicker
            label="تاريخ الالتحاق"
            value={watch('join_date') || null}
            onChange={(v) => setValue('join_date', v ?? '')}
          />
          <Field label="العنوان الوطني" htmlFor="national_address">
            <Input id="national_address" {...register('national_address')} />
          </Field>
        </Section>

        {/* بنكي */}
        <Section title="بيانات بنكية">
          <Field label="اسم البنك" htmlFor="bank_name">
            <Input id="bank_name" {...register('bank_name')} />
          </Field>
          <Field label="الآيبان (IBAN)" htmlFor="bank_iban">
            <Input id="bank_iban" dir="ltr" {...register('bank_iban')} />
          </Field>
        </Section>

        {/* مؤهلات وطوارئ */}
        <Section title="مؤهلات وجهة طوارئ">
          <div className="sm:col-span-2">
            <Field label="المؤهلات" htmlFor="qualifications">
              <Textarea id="qualifications" {...register('qualifications')} />
            </Field>
          </div>
          <Field label="اسم جهة الطوارئ" htmlFor="emergency_contact_name">
            <Input
              id="emergency_contact_name"
              {...register('emergency_contact_name')}
            />
          </Field>
          <Field label="جوال جهة الطوارئ" htmlFor="emergency_contact_phone">
            <Input
              id="emergency_contact_phone"
              dir="ltr"
              {...register('emergency_contact_phone')}
            />
          </Field>
          <Field label="صلة القرابة" htmlFor="emergency_contact_relation">
            <Input
              id="emergency_contact_relation"
              {...register('emergency_contact_relation')}
            />
          </Field>
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
