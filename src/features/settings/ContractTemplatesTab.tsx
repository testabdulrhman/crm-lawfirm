// إدارة قوالب العقود: رفع ملفات Word بمتغيرات {{KEY}} وتسمية كل متغيّر بالعربية.
import { useState } from 'react'
import {
  FileType2,
  Upload,
  Trash2,
  Loader2,
  Download,
  Pencil,
  Check,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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

import { pickFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { AUTO_KEYS } from '@/lib/docxTemplate'
import {
  useContractTemplates,
  useUploadContractTemplate,
  useUpdateContractTemplate,
  useDeleteContractTemplate,
  type ContractTemplate,
  type TemplatePlaceholder,
} from '@/hooks/useContractTemplates'

export function ContractTemplatesTab() {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: templates, isLoading } = useContractTemplates(true)
  const uploadM = useUploadContractTemplate()
  const updateM = useUpdateContractTemplate()
  const deleteM = useDeleteContractTemplate()

  const [addOpen, setAddOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [editing, setEditing] = useState<ContractTemplate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ContractTemplate | null>(null)

  const reset = () => {
    setFile(null)
    setName('')
    setDesc('')
  }

  const onPick = async () => {
    const f = await pickFile({ accept: '.docx' })
    if (!f) return
    setFile(f)
    if (name.trim() === '') setName(f.name.replace(/\.docx$/i, ''))
  }

  const onSave = () => {
    if (!file || name.trim() === '') return
    uploadM.mutate(
      {
        file,
        name,
        description: desc,
        createdBy: teamMember?.id ?? null,
      },
      {
        onSuccess: () => {
          reset()
          setAddOpen(false)
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      <Alert>
        <FileType2 className="h-4 w-4" />
        <AlertDescription className="text-sm leading-relaxed">
          أَلِّف العقد في Word كالمعتاد، وضع مكان كل بيان متغيّراً بالشكل{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">{'{{NAME}}'}</code>{' '}
          — ثم ارفعه هنا. يقرأ النظام المتغيرات تلقائياً ويسألك عنها عند التوليد.
          المتغيرات{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">{'{{DAY}}'}</code>{' '}
          و<code className="rounded bg-muted px-1 font-mono text-xs">{'{{HIJRI}}'}</code>{' '}
          و<code className="rounded bg-muted px-1 font-mono text-xs">{'{{GREG}}'}</code>{' '}
          يملؤها النظام من تاريخ التوقيع بلا سؤال.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setAddOpen(true)}>
          <Upload className="h-4 w-4" />
          رفع قالب
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (templates ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
          <FileType2 className="mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            لا قوالب بعد — ارفع أول قالب عقد بصيغة Word.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(templates ?? []).map((t) => (
            <Card key={t.id} className={t.is_active ? '' : 'opacity-60'}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileType2 className="h-4 w-4 shrink-0 text-gold" />
                      <p className="truncate text-sm font-semibold text-foreground">
                        {t.name}
                      </p>
                      {!t.is_active && <Badge variant="outline">معطَّل</Badge>}
                    </div>
                    {t.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="ml-2 flex items-center gap-2">
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={(v) =>
                          updateM.mutate({ id: t.id, input: { is_active: v } })
                        }
                      />
                      <span className="text-xs text-muted-foreground">مُفعَّل</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="تسمية المتغيرات"
                      onClick={() => setEditing(t)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a
                        href={t.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="تنزيل القالب"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {isDirector && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="حذف"
                        onClick={() => setConfirmDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 border-t pt-3">
                  {t.placeholders.map((p) => (
                    <Badge
                      key={p.key}
                      variant={
                        (AUTO_KEYS as readonly string[]).includes(p.key)
                          ? 'secondary'
                          : 'outline'
                      }
                      className="font-normal"
                    >
                      {p.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* رفع قالب */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>رفع قالب عقد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ملف القالب (.docx)</Label>
              <Button variant="outline" className="w-full" onClick={onPick}>
                <Upload className="h-4 w-4" />
                {file ? file.name : 'اختيار ملف Word'}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">اسم القالب</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: اتفاقية أتعاب محاماة"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">وصف مختصر (اختياري)</Label>
              <Input
                id="tpl-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="متى يُستخدم هذا القالب"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!file || name.trim() === '' || uploadM.isPending}
              onClick={onSave}
            >
              {uploadM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ القالب
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تسمية المتغيرات بالعربية */}
      <LabelsDialog
        template={editing}
        onClose={() => setEditing(null)}
        onSave={(placeholders) => {
          if (editing)
            updateM.mutate(
              { id: editing.id, input: { placeholders } },
              { onSuccess: () => setEditing(null) }
            )
        }}
        saving={updateM.isPending}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القالب</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{confirmDelete?.name}» من قائمة القوالب. العقود المولَّدة منه
              سابقاً لا تتأثر. متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete)
                  deleteM.mutate({
                    id: confirmDelete.id,
                    deletedBy: teamMember?.name ?? null,
                  })
                setConfirmDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// تسمية كل متغيّر بالعربية — ما يظهر للموظف عند التوليد
function LabelsDialog({
  template,
  onClose,
  onSave,
  saving,
}: {
  template: ContractTemplate | null
  onClose: () => void
  onSave: (p: TemplatePlaceholder[]) => void
  saving: boolean
}) {
  const [labels, setLabels] = useState<Record<string, string>>({})

  // عند فتح قالب جديد نبدأ من تسمياته الحالية
  const key = template?.id ?? ''
  const [loadedFor, setLoadedFor] = useState('')
  if (template && loadedFor !== key) {
    setLoadedFor(key)
    setLabels(Object.fromEntries(template.placeholders.map((p) => [p.key, p.label])))
  }

  if (!template) return null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تسمية متغيرات «{template.name}»</DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pl-1">
          {template.placeholders.map((p) => {
            const auto = (AUTO_KEYS as readonly string[]).includes(p.key)
            return (
              <div key={p.key} className="flex items-center gap-3">
                <code
                  dir="ltr"
                  className="w-32 shrink-0 truncate rounded bg-muted px-2 py-1 text-left font-mono text-xs"
                >
                  {`{{${p.key}}}`}
                </code>
                <Input
                  value={labels[p.key] ?? ''}
                  onChange={(e) =>
                    setLabels((s) => ({ ...s, [p.key]: e.target.value }))
                  }
                  disabled={auto}
                  placeholder={auto ? 'يملؤه النظام تلقائياً' : 'التسمية بالعربية'}
                />
              </div>
            )
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={saving}
            onClick={() =>
              onSave(
                template.placeholders.map((p) => ({
                  key: p.key,
                  label: (labels[p.key] ?? '').trim() || p.key,
                }))
              )
            }
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
