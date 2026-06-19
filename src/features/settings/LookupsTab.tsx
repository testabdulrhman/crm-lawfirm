import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, Tags } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useLookups,
  useCreateLookup,
  useUpdateLookup,
  useDeleteLookup,
} from '@/hooks/useSettings'
import type { LookupValue, LookupValueInput } from '@/types/db'

const schema = z.object({
  type: z.string().min(1, 'النوع مطلوب'),
  value: z.string().min(1, 'القيمة مطلوبة'),
  label: z.string().min(1, 'النص المعروض مطلوب'),
  color: z.string().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
})

type FormValues = z.infer<typeof schema>

export function LookupsTab() {
  const { data, isLoading } = useLookups()
  const deleteM = useDeleteLookup()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LookupValue | null>(null)
  const [presetType, setPresetType] = useState<string | undefined>(undefined)

  // أنواع موجودة (للاقتراح)
  const types = useMemo(
    () => Array.from(new Set((data ?? []).map((l) => l.type))).sort(),
    [data]
  )

  // التجميع حسب النوع
  const grouped = useMemo(() => {
    const map = new Map<string, LookupValue[]>()
    for (const l of data ?? []) {
      const arr = map.get(l.type) ?? []
      arr.push(l)
      map.set(l.type, arr)
    }
    return Array.from(map.entries())
  }, [data])

  const openNew = (type?: string) => {
    setEditing(null)
    setPresetType(type)
    setDialogOpen(true)
  }
  const openEdit = (l: LookupValue) => {
    setEditing(l)
    setPresetType(undefined)
    setDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => openNew()}>
          <Plus className="h-4 w-4" />
          تصنيف جديد
        </Button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {grouped.map(([type, values]) => (
            <Card key={type}>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  <span className="font-mono text-xs text-muted-foreground">
                    {type}
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openNew(type)}
                >
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {values.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {l.color && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: l.color }}
                        />
                      )}
                      <span className="text-sm font-medium">{l.label}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {l.value}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(l)}
                        title="تعديل"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteM.mutate(l.id)}
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <LookupForm
            lookup={editing}
            presetType={presetType}
            knownTypes={types}
            onDone={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LookupForm({
  lookup,
  presetType,
  knownTypes,
  onDone,
}: {
  lookup: LookupValue | null
  presetType?: string
  knownTypes: string[]
  onDone: () => void
}) {
  const isEdit = Boolean(lookup)
  const createM = useCreateLookup()
  const updateM = useUpdateLookup()
  const pending = createM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: lookup?.type ?? presetType ?? '',
      value: lookup?.value ?? '',
      label: lookup?.label ?? '',
      color: lookup?.color ?? '',
      sort_order: lookup?.sort_order ?? 0,
    },
  })

  const onSubmit = async (values: FormValues) => {
    const input: LookupValueInput = {
      type: values.type.trim(),
      value: values.value.trim(),
      label: values.label.trim(),
      color: values.color?.trim() ? values.color.trim() : null,
      sort_order: values.sort_order ?? 0,
    }
    if (isEdit && lookup) {
      await updateM.mutateAsync({ id: lookup.id, input })
    } else {
      await createM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل تصنيف' : 'تصنيف جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="type">النوع (type)</Label>
          <Input
            id="type"
            list="lookup-types"
            dir="ltr"
            placeholder="case_type"
            {...register('type')}
          />
          <datalist id="lookup-types">
            {knownTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {errors.type && (
            <p className="text-xs text-destructive">{errors.type.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="value">القيمة (value)</Label>
            <Input id="value" dir="ltr" {...register('value')} />
            {errors.value && (
              <p className="text-xs text-destructive">{errors.value.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">النص المعروض</Label>
            <Input id="label" {...register('label')} />
            {errors.label && (
              <p className="text-xs text-destructive">{errors.label.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="color">اللون</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="color"
                className="h-10 w-14 p-1"
                {...register('color')}
              />
              <Input dir="ltr" placeholder="#C9A84C" {...register('color')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sort_order">الترتيب</Label>
            <Input
              id="sort_order"
              type="number"
              dir="ltr"
              {...register('sort_order')}
            />
          </div>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Tags className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد تصنيفات</p>
      <p className="text-sm text-muted-foreground">
        أضِف أول تصنيف عبر زر «تصنيف جديد».
      </p>
    </div>
  )
}
