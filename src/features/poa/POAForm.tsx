import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Paperclip, X } from 'lucide-react'

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
import { pickFile, uploadFile } from '@/lib/files'
import { useContacts } from '@/hooks/useContacts'
import { useCases } from '@/hooks/useCases'
import { useCreatePOA, useUpdatePOA } from '@/hooks/usePOAs'
import { POA_STATUS_OPTIONS } from '@/lib/poaLabels'
import type { Case, Contact, PowerOfAttorney, POAInput } from '@/types/db'

const schema = z.object({
  poa_number: z.string().optional(),
  client_name: z.string().optional(),
  agent_name: z.string().optional(),
  poa_date: z.string().optional(),
  expiry_date: z.string().optional(),
  status: z.string().min(1),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function POAForm({
  poa,
  onDone,
}: {
  poa?: PowerOfAttorney | null
  onDone: () => void
}) {
  const isEdit = Boolean(poa)
  const { data: contacts } = useContacts()
  const { data: cases } = useCases()
  const createM = useCreatePOA()
  const updateM = useUpdatePOA()

  const [clientId, setClientId] = useState<string | null>(poa?.client_id ?? null)
  const [caseId, setCaseId] = useState<string | null>(poa?.case_id ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const pending = createM.isPending || updateM.isPending || uploading

  const {
    register,
    handleSubmit,
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      poa_number: poa?.poa_number ?? '',
      client_name: poa?.client_name ?? '',
      agent_name: poa?.agent_name ?? '',
      poa_date: poa?.poa_date ?? '',
      expiry_date: poa?.expiry_date ?? '',
      status: poa?.status ?? 'active',
      notes: poa?.notes ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

    let documentUrl: string | null | undefined
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, { folder: 'poa' })
        documentUrl = publicUrl
      } finally {
        setUploading(false)
      }
    }

    const input: POAInput = {
      poa_number: t(values.poa_number),
      client_id: clientId,
      client_name: t(values.client_name),
      agent_name: t(values.agent_name),
      poa_date: t(values.poa_date),
      expiry_date: t(values.expiry_date),
      status: values.status,
      case_id: caseId,
      notes: t(values.notes),
    }
    if (documentUrl) input.document_url = documentUrl

    if (isEdit && poa) {
      await updateM.mutateAsync({ id: poa.id, input })
    } else {
      await createM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل وكالة' : 'وكالة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="poa_number">رقم الوكالة</Label>
          <Input id="poa_number" dir="ltr" {...register('poa_number')} />
        </div>

        {/* الموكّل */}
        <div className="space-y-1.5 rounded-lg border border-dashed p-3">
          <Label>الموكّل (اختر من جهات الاتصال — اختياري)</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={clientId}
            onSelect={(c: Contact | null) => {
              setClientId(c?.id ?? null)
              if (c) setValue('client_name', c.name ?? '')
            }}
          />
          <Label htmlFor="client_name" className="pt-1">
            اسم الموكّل
          </Label>
          <Input id="client_name" {...register('client_name')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent_name">اسم الوكيل</Label>
          <Input id="agent_name" {...register('agent_name')} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="poa_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الإصدار"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <Controller
            control={control}
            name="expiry_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الانتهاء"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    {POA_STATUS_OPTIONS.map((o) => (
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
            <Label>ربط بقضية (اختياري)</Label>
            <CasePicker cases={cases ?? []} value={caseId} onChange={setCaseId} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="poa_notes">ملاحظات</Label>
          <Textarea id="poa_notes" rows={2} {...register('notes')} />
        </div>

        {/* المستند */}
        <div className="space-y-1.5">
          <Label>مستند الوكالة</Label>
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
            ) : poa?.document_url ? (
              <span className="text-xs text-muted-foreground">يوجد مستند مرفق</span>
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

// منتقي قضية بحثي خفيف
function CasePicker({
  cases,
  value,
  onChange,
}: {
  cases: Case[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = useMemo(
    () => cases.find((c) => c.id === value) ?? null,
    [cases, value]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cases.slice(0, 20)
    return cases
      .filter((c) =>
        [c.title, c.office_num, c.court_num]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20)
  }, [cases, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="truncate text-sm">{selected.title || 'قضية'}</span>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onChange(null)}
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
        placeholder="ابحث عن قضية…"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">لا نتائج</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full truncate px-3 py-2 text-right text-sm hover:bg-accent/20"
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                {c.title || 'قضية'}
                {c.office_num ? (
                  <span dir="ltr" className="mr-2 text-xs text-muted-foreground">
                    {c.office_num}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
