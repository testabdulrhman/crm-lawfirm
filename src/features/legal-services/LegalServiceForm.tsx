import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Paperclip } from 'lucide-react'

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
import { pickFile, uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useCreateLegalService,
  useUpdateLegalService,
} from '@/hooks/useLegalServices'
import {
  LS_TYPE_OPTIONS,
  LS_STATUS_OPTIONS,
  SERVICE_KIND_OPTIONS,
  REGULATION_TYPE_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
} from '@/lib/legalServiceLabels'
import type { Contact, LegalService, LegalServiceInput } from '@/types/db'

const schema = z.object({
  type: z.string().min(1, 'النوع مطلوب'),
  title: z.string().min(1, 'العنوان مطلوب'),
  client_name: z.string().optional(),
  service_kind: z.string().optional(),
  regulation_type: z.string().optional(),
  contract_type: z.string().optional(),
  party_first: z.string().optional(),
  party_second: z.string().optional(),
  service_date: z.string().optional(),
  received_date: z.string().optional(),
  delivered_date: z.string().optional(),
  assignee_id: z.string().optional(),
  status: z.string().min(1),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function LegalServiceForm({
  service,
  onDone,
}: {
  service?: LegalService | null
  onDone: () => void
}) {
  const isEdit = Boolean(service)
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const { data: members } = useTeamMembers()
  const createM = useCreateLegalService()
  const updateM = useUpdateLegalService()
  const activeMembers = (members ?? []).filter((m) => m.is_active)

  const [clientId, setClientId] = useState<string | null>(service?.client_id ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const pending = createM.isPending || updateM.isPending || uploading

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: service?.type ?? 'consultation',
      title: service?.title ?? '',
      client_name: service?.client_name ?? '',
      service_kind: service?.service_kind ?? '',
      regulation_type: service?.regulation_type ?? '',
      contract_type: service?.contract_type ?? '',
      party_first: service?.party_first ?? '',
      party_second: service?.party_second ?? '',
      service_date: service?.service_date ?? '',
      received_date: service?.received_date ?? service?.received_at?.slice(0, 10) ?? '',
      delivered_date:
        service?.delivered_date ?? service?.delivered_at?.slice(0, 10) ?? '',
      assignee_id: service?.assignee_id ?? '',
      status: service?.status ?? 'draft',
      notes: service?.notes ?? '',
    },
  })

  const type = watch('type')

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

    let fileUrl: string | null | undefined
    let fileName: string | null | undefined
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, { folder: 'legal_services' })
        fileUrl = publicUrl
        fileName = file.name
      } finally {
        setUploading(false)
      }
    }

    const assignee = activeMembers.find((m) => m.id === values.assignee_id)
    const input: LegalServiceInput = {
      type: values.type,
      title: values.title.trim(),
      client_id: clientId,
      client_name: t(values.client_name),
      service_kind: t(values.service_kind),
      // حقول خاصة بالنوع
      regulation_type: values.type === 'regulation' ? t(values.regulation_type) : null,
      contract_type: values.type === 'contract' ? t(values.contract_type) : null,
      party_first: values.type === 'contract' ? t(values.party_first) : null,
      party_second: values.type === 'contract' ? t(values.party_second) : null,
      service_date: t(values.service_date),
      received_date: t(values.received_date),
      delivered_date: t(values.delivered_date),
      assignee_id: values.assignee_id || null,
      assignee_name: assignee?.name ?? null,
      status: values.status,
      notes: t(values.notes),
    }
    if (fileUrl) {
      input.file_url = fileUrl
      input.file_name = fileName
    }

    if (isEdit && service) {
      await updateM.mutateAsync({ id: service.id, input })
    } else {
      await createM.mutateAsync({ ...input, created_by: teamMember?.name ?? null })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل خدمة' : 'خدمة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>النوع *</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LS_TYPE_OPTIONS.map((o) => (
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
                    {LS_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ls_title">العنوان *</Label>
          <Input id="ls_title" {...register('title')} />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        {/* الموكّل */}
        <div className="space-y-1.5 rounded-lg border border-dashed p-3">
          <Label>الموكّل (من جهات الاتصال — اختياري)</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={clientId}
            onSelect={(c: Contact | null) => {
              setClientId(c?.id ?? null)
              if (c) setValue('client_name', c.name ?? '')
            }}
          />
          <Input
            placeholder="اسم الموكّل"
            className="mt-1"
            {...register('client_name')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>نوع العمل</Label>
          <Controller
            control={control}
            name="service_kind"
            render={({ field }) => (
              <SelectOrOther
                value={field.value || ''}
                onChange={field.onChange}
                options={SERVICE_KIND_OPTIONS}
                placeholder="إعداد / مراجعة…"
              />
            )}
          />
        </div>

        {/* حقول اللائحة */}
        {type === 'regulation' && (
          <div className="space-y-1.5">
            <Label>نوع اللائحة</Label>
            <Controller
              control={control}
              name="regulation_type"
              render={({ field }) => (
                <SelectOrOther
                  value={field.value || ''}
                  onChange={field.onChange}
                  options={REGULATION_TYPE_OPTIONS}
                  placeholder="اعتراضية / جوابية…"
                />
              )}
            />
          </div>
        )}

        {/* حقول العقد */}
        {type === 'contract' && (
          <>
            <div className="space-y-1.5">
              <Label>نوع العقد</Label>
              <Controller
                control={control}
                name="contract_type"
                render={({ field }) => (
                  <SelectOrOther
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={CONTRACT_TYPE_OPTIONS}
                    placeholder="عقد شراكة…"
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ls_p1">الطرف الأول</Label>
                <Input id="ls_p1" {...register('party_first')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls_p2">الطرف الثاني</Label>
                <Input id="ls_p2" {...register('party_second')} />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="service_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الخدمة"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <div className="space-y-1.5">
            <Label>المسؤول</Label>
            <Controller
              control={control}
              name="assignee_id"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
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
          <Controller
            control={control}
            name="received_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الاستلام"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <Controller
            control={control}
            name="delivered_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ التسليم"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ls_notes">ملاحظات</Label>
          <Textarea id="ls_notes" rows={2} {...register('notes')} />
        </div>

        {/* الملف */}
        <div className="space-y-1.5">
          <Label>ملف الخدمة</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const f = await pickFile()
                if (f) setFile(f)
              }}
            >
              <Paperclip className="h-4 w-4" />
              اختيار ملف
            </Button>
            {file ? (
              <span className="truncate text-xs text-muted-foreground">
                {file.name}
              </span>
            ) : service?.file_url ? (
              <span className="text-xs text-muted-foreground">
                {service.file_name || 'يوجد ملف مرفق'}
              </span>
            ) : null}
            {file && (
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() => setFile(null)}
              >
                إزالة
              </button>
            )}
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
