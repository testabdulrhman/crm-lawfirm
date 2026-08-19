import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Phone, Loader2, BookUser } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fmtNumber } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Ltr } from '@/components/Ltr'
import { ContactPicker } from '@/components/ContactPicker'
import { useContacts } from '@/hooks/useContacts'
import {
  useCaseParties,
  useAddParty,
  useUpdateParty,
  useDeleteParty,
} from '@/hooks/useCaseParties'
import {
  PARTY_SIDE_OPTIONS,
  partySideBadge,
  partySideLabel,
} from '@/lib/caseLabels'
import type { CaseParty, Contact } from '@/types/db'

export function PartiesTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError, error, refetch } = useCaseParties(caseId)
  const deleteM = useDeleteParty(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CaseParty | null>(null)
  const [defaultSide, setDefaultSide] = useState('defendant')
  const [toDelete, setToDelete] = useState<CaseParty | null>(null)

  const { plaintiffs, defendants } = useMemo(() => {
    const list = data ?? []
    return {
      plaintiffs: list.filter((p) => p.party_side === 'plaintiff'),
      defendants: list.filter((p) => p.party_side !== 'plaintiff'),
    }
  }, [data])

  const openNew = (side = 'defendant') => {
    setEditing(null)
    setDefaultSide(side)
    setFormOpen(true)
  }
  const openEdit = (p: CaseParty) => {
    setEditing(p)
    setFormOpen(true)
  }

  if (isLoading) {
    // سكيلتون يطابق الشكل النهائي: صف الزر ثم شبكة العمودين
    return (
      <div className="space-y-5">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل الأطراف"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => openNew()}>
          <Plus className="h-4 w-4" />
          إضافة طرف
        </Button>
      </div>

      {/* عمودان متقابلان: بحكم RTL المدّعون على اليمين والمدّعى عليهم على اليسار.
          ينهاران إلى عمود واحد على الجوال. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PartySection
          title="المدّعون"
          parties={plaintiffs}
          emptyText="لم يُسجَّل مدّعون بعد"
          onAdd={() => openNew('plaintiff')}
          onEdit={openEdit}
          onDelete={setToDelete}
        />
        <PartySection
          title="المدّعى عليهم"
          parties={defendants}
          emptyText="لم يُسجَّل مدّعى عليهم بعد"
          onAdd={() => openNew('defendant')}
          onEdit={openEdit}
          onDelete={setToDelete}
        />
      </div>

      {/* النموذج */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <PartyForm
            caseId={caseId}
            party={editing}
            defaultSide={defaultSide}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف — يبقى مفتوحاً مع مؤشر حتى اكتمال الحذف */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o && !deleteM.isPending) setToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الطرف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الطرف «{toDelete?.name}». هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteM.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteM.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (!toDelete) return
                deleteM.mutate(toDelete.id, {
                  onSuccess: () => setToDelete(null),
                })
              }}
            >
              {deleteM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PartySection({
  title,
  parties,
  emptyText,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  parties: CaseParty[]
  emptyText: string
  onAdd: () => void
  onEdit: (p: CaseParty) => void
  onDelete: (p: CaseParty) => void
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className="text-xs text-muted-foreground">
          ({fmtNumber(parties.length)})
        </span>
      </h3>
      {parties.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          <span>{emptyText}</span>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
            إضافة طرف
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {parties.map((p) => (
            <PartyCard key={p.id} party={p} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function PartyCard({
  party: p,
  onEdit,
  onDelete,
}: {
  party: CaseParty
  onEdit: (p: CaseParty) => void
  onDelete: (p: CaseParty) => void
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{p.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={partySideBadge(p.party_side)}>
                {partySideLabel(p.party_side)}
              </Badge>
              {p.role && p.role !== 'opponent' && (
                <span className="text-xs text-muted-foreground">{p.role}</span>
              )}
              {p.contact_id && (
                <Link
                  href={`/contacts/${p.contact_id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold-700 hover:underline dark:text-gold-300"
                >
                  <BookUser className="h-3 w-3" />
                  من جهات الاتصال
                </Link>
              )}
            </div>
          </div>
          <div className="-my-1 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="تعديل الطرف"
              title="تعديل الطرف"
              onClick={() => onEdit(p)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive"
              aria-label="حذف الطرف"
              title="حذف الطرف"
              onClick={() => onDelete(p)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {p.phone && (
            <button
              dir="ltr"
              className="flex items-center justify-end gap-1 rounded-sm hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openExternal(`tel:${p.phone}`)}
            >
              <span>{p.phone}</span>
              <Phone className="h-3 w-3" />
            </button>
          )}
          {p.id_number && (
            <p>
              هوية: <Ltr>{p.id_number}</Ltr>
            </p>
          )}
          {p.nationality && <p>الجنسية: {p.nationality}</p>}
          {p.notes && <p className="whitespace-pre-wrap">{p.notes}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ===================== النموذج ===================== */

const schema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  party_side: z.string().min(1, 'الصفة مطلوبة'),
  role: z.string().optional(),
  phone: z.string().optional(),
  id_number: z.string().optional(),
  nationality: z.string().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function PartyForm({
  caseId,
  party,
  defaultSide = 'defendant',
  onDone,
}: {
  caseId: string
  party: CaseParty | null
  /** الصفة المبدئية عند الإضافة (حسب العمود الذي فُتح منه النموذج) */
  defaultSide?: string
  onDone: () => void
}) {
  const isEdit = Boolean(party)
  const addM = useAddParty(caseId)
  const updateM = useUpdateParty(caseId)
  const pending = addM.isPending || updateM.isPending
  const { data: contacts } = useContacts()
  const [contactId, setContactId] = useState<string | null>(
    party?.contact_id ?? null
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: party?.name ?? '',
      party_side: party
        ? party.party_side === 'plaintiff'
          ? 'plaintiff'
          : 'defendant'
        : defaultSide,
      role: party?.role && party.role !== 'opponent' ? party.role : '',
      phone: party?.phone ?? '',
      id_number: party?.id_number ?? '',
      nationality: party?.nationality ?? '',
      notes: party?.notes ?? '',
    },
  })

  // عند اختيار جهة اتصال: عبّئ الحقول (تبقى قابلة للتعديل) واضبط contact_id
  const onPickContact = (c: Contact | null) => {
    setContactId(c?.id ?? null)
    if (c) {
      setValue('name', c.name ?? '', { shouldValidate: true })
      setValue('phone', c.phone ?? '')
      setValue('id_number', c.id_number ?? '')
      setValue('nationality', c.nationality ?? '')
    }
  }

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const base = {
      name: values.name.trim(),
      party_side: values.party_side,
      role: t(values.role),
      phone: t(values.phone),
      id_number: t(values.id_number),
      nationality: t(values.nationality),
      notes: t(values.notes),
      contact_id: contactId,
    }
    if (isEdit && party) {
      await updateM.mutateAsync({ id: party.id, input: base })
    } else {
      await addM.mutateAsync({ case_id: caseId, ...base })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل طرف' : 'إضافة طرف'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        {/* اختيار من جهات الاتصال (اختياري) — يعبّئ الحقول تلقائياً */}
        <div className="space-y-1.5 rounded-lg border border-dashed p-3">
          <Label>اختر من جهات الاتصال (اختياري)</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={contactId}
            onSelect={onPickContact}
            // منتقٍ مساعد لا سجلّ موكّلين: الطرف قد يكون خصماً، والإدخال
            // اليدوي متاح أدناه — فإنشاء جهة اتصال هنا يلوّث القائمة.
            allowCreate={false}
          />
          <p className="text-xs text-muted-foreground">
            للأطراف المسجّلين — يعبّئ الاسم/الجوال/الهوية/الجنسية (تبقى قابلة
            للتعديل). اتركه فارغاً للإدخال اليدوي.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="party_name">الاسم *</Label>
          <Input id="party_name" {...register('name')} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الصفة *</Label>
            <Controller
              control={control}
              name="party_side"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_SIDE_OPTIONS.map((o) => (
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
            <Label htmlFor="party_role">الدور (وصفي)</Label>
            <Input
              id="party_role"
              placeholder="مثل: المدّعي الأول، الوكيل…"
              {...register('role')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="party_phone">الجوال</Label>
            <Input id="party_phone" dir="ltr" {...register('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party_id">رقم الهوية</Label>
            <Input id="party_id" dir="ltr" {...register('id_number')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="party_nat">الجنسية</Label>
          <Input id="party_nat" {...register('nationality')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="party_notes">ملاحظات</Label>
          <Textarea id="party_notes" rows={2} {...register('notes')} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}
