import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, X, Check } from 'lucide-react'

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
import type { Case, CaseInput, Contact } from '@/types/db'

const OTHER = '__other__'

const schema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  type: z.string().optional(),
  typeOther: z.string().optional(),
  status: z.string().min(1),
  office_num: z.string().optional(),
  court_num: z.string().optional(),
  court: z.string().optional(),
  court_division: z.string().optional(),
  assignee_id: z.string().optional(),
  subject: z.string().optional(),
  open_date: z.string().optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
})

type FormValues = z.infer<typeof schema>

function initialType(t: string | null | undefined): string {
  if (!t || t.trim() === '') return ''
  return (CASE_TYPES as readonly string[]).includes(t) ? t : OTHER
}

export function CaseForm({
  caseItem,
  onDone,
}: {
  caseItem?: Case | null
  onDone: () => void
}) {
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
      office_num: caseItem?.office_num ?? '',
      court_num: caseItem?.court_num ?? '',
      court: caseItem?.court ?? '',
      court_division: caseItem?.court_division ?? '',
      assignee_id: caseItem?.assignee_id ?? '',
      subject: caseItem?.subject ?? '',
      open_date: caseItem?.open_date ?? todayISO(),
      progress: caseItem?.progress ?? 0,
    },
  })

  const typeValue = watch('type')

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const resolvedType =
      values.type === OTHER
        ? t(values.typeOther)
        : t(values.type)

    const input: CaseInput = {
      title: values.title.trim(),
      type: resolvedType,
      status: values.status,
      office_num: t(values.office_num),
      court_num: t(values.court_num),
      court: t(values.court),
      court_division: t(values.court_division),
      assignee_id: values.assignee_id || null,
      contact_id: contactId,
      subject: t(values.subject),
      open_date: values.open_date || null,
      progress: values.progress ?? 0,
    }
    if (isEdit && caseItem) {
      await updateM.mutateAsync({ id: caseItem.id, input })
    } else {
      await createM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل قضية' : 'قضية جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] overflow-y-auto pl-1 pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="title">عنوان القضية *</Label>
            <Input id="title" {...register('title')} />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>النوع</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                >
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
              <Input
                placeholder="اكتب النوع"
                className="mt-2"
                {...register('typeOther')}
              />
            )}
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

          <div className="space-y-1.5">
            <Label htmlFor="office_num">رقم المكتب</Label>
            <Input id="office_num" dir="ltr" {...register('office_num')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="court_num">رقم المحكمة</Label>
            <Input id="court_num" dir="ltr" {...register('court_num')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="court">المحكمة</Label>
            <Input id="court" {...register('court')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="court_division">الدائرة</Label>
            <Input id="court_division" {...register('court_division')} />
          </div>

          {/* الموكّل */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>الموكّل</Label>
            <ContactPicker
              contacts={contacts ?? []}
              value={contactId}
              onChange={setContactId}
            />
          </div>

          {/* المسؤول */}
          <div className="space-y-1.5">
            <Label>المحامي المسؤول</Label>
            <Controller
              control={control}
              name="assignee_id"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                >
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

          <div className="space-y-1.5">
            <Label htmlFor="open_date">تاريخ الفتح</Label>
            <Input id="open_date" type="date" {...register('open_date')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="progress">نسبة الإنجاز (٪)</Label>
            <Input
              id="progress"
              type="number"
              min={0}
              max={100}
              dir="ltr"
              {...register('progress')}
            />
            {errors.progress && (
              <p className="text-xs text-destructive">من 0 إلى 100</p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="subject">الموضوع / التفاصيل</Label>
            <Textarea id="subject" rows={4} {...register('subject')} />
          </div>
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

// منتقي موكّل بحثي خفيف (من 777 جهة)
function ContactPicker({
  contacts,
  value,
  onChange,
}: {
  contacts: Contact[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = useMemo(
    () => contacts.find((c) => c.id === value) ?? null,
    [contacts, value]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts.slice(0, 20)
    return contacts
      .filter((c) =>
        [c.name, c.phone, c.phone2]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20)
  }, [contacts, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="text-sm">
          {selected.name}
          {selected.phone ? (
            <span dir="ltr" className="mr-2 text-xs text-muted-foreground">
              {selected.phone}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            onChange(null)
            setQuery('')
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder="ابحث عن موكّل بالاسم أو الجوال…"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              لا نتائج
            </p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent/20"
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                <span className="truncate">{c.name}</span>
                {c.phone && (
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    {c.phone}
                  </span>
                )}
              </button>
            ))
          )}
          <button
            type="button"
            className="flex w-full items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent/20"
            onClick={() => setOpen(false)}
          >
            <Check className="h-3 w-3" />
            إغلاق
          </button>
        </div>
      )}
    </div>
  )
}
