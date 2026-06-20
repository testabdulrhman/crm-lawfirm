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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CasePicker } from '@/components/CasePicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { pickFile, uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useCases } from '@/hooks/useCases'
import {
  useCreateOutgoingLetter,
  useUpdateOutgoingLetter,
} from '@/hooks/useOutgoingLetters'
import type { OutgoingLetter, OutgoingLetterInput } from '@/types/db'

const schema = z.object({
  letter_number: z.string().optional(),
  subject: z.string().min(1, 'الموضوع مطلوب'),
  recipient: z.string().optional(),
  letter_date: z.string().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function OutgoingLetterForm({
  letter,
  onDone,
}: {
  letter?: OutgoingLetter | null
  onDone: () => void
}) {
  const isEdit = Boolean(letter)
  const { teamMember } = useAuth()
  const { data: cases } = useCases()
  const createM = useCreateOutgoingLetter()
  const updateM = useUpdateOutgoingLetter()

  const [caseId, setCaseId] = useState<string | null>(letter?.case_id ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const pending = createM.isPending || updateM.isPending || uploading

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      letter_number: letter?.letter_number ?? '',
      subject: letter?.subject ?? '',
      recipient: letter?.recipient ?? '',
      letter_date: letter?.letter_date ?? '',
      notes: letter?.notes ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

    let fileUrl: string | null | undefined
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, { folder: 'outgoing' })
        fileUrl = publicUrl
      } finally {
        setUploading(false)
      }
    }

    const input: OutgoingLetterInput = {
      letter_number: t(values.letter_number),
      subject: values.subject.trim(),
      recipient: t(values.recipient),
      letter_date: t(values.letter_date),
      case_id: caseId,
      notes: t(values.notes),
    }
    if (fileUrl) input.file_url = fileUrl

    if (isEdit && letter) {
      await updateM.mutateAsync({ id: letter.id, input })
    } else {
      await createM.mutateAsync({ ...input, created_by: teamMember?.id ?? null })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل خطاب' : 'خطاب صادر جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="letter_number">رقم الخطاب</Label>
            <Input id="letter_number" dir="ltr" {...register('letter_number')} />
          </div>
          <Controller
            control={control}
            name="letter_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الخطاب"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">الموضوع *</Label>
          <Input id="subject" {...register('subject')} />
          {errors.subject && (
            <p className="text-xs text-destructive">{errors.subject.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recipient">الجهة المستلِمة</Label>
          <Input id="recipient" {...register('recipient')} />
        </div>

        <div className="space-y-1.5">
          <Label>ربط بقضية (اختياري)</Label>
          <CasePicker cases={cases ?? []} value={caseId} onChange={setCaseId} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="out_notes">ملاحظات</Label>
          <Textarea id="out_notes" rows={2} {...register('notes')} />
        </div>

        {/* الملف */}
        <div className="space-y-1.5">
          <Label>ملف الخطاب</Label>
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
            ) : letter?.file_url ? (
              <span className="text-xs text-muted-foreground">يوجد ملف مرفق</span>
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
