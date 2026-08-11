// توليد عقد من قالب Word مرفوع: اختيار القالب ← تعبئة متغيراته ← تنزيل الملف.
import { useMemo, useState } from 'react'
import { FileType2, Loader2, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { todayISO } from '@/lib/format'
import {
  useContractTemplates,
  fetchTemplateFile,
} from '@/hooks/useContractTemplates'
import { AUTO_KEYS, autoDateValues, fillDocx, downloadBlob } from '@/lib/docxTemplate'

export function GenerateFromTemplateDialog({
  open,
  onOpenChange,
  /** قيم مبدئية تُملأ من العقد/الموكّل إن فُتح الحوار من صفحة عقد */
  presets,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  presets?: Record<string, string>
}) {
  const { data: templates, isLoading } = useContractTemplates()
  const [templateId, setTemplateId] = useState<string>('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [signedDate, setSignedDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const template = (templates ?? []).find((t) => t.id === templateId) ?? null

  // الحقول التي يملؤها الموظف — بلا المتغيرات التلقائية
  const fields = useMemo(
    () =>
      (template?.placeholders ?? []).filter(
        (p) => !(AUTO_KEYS as readonly string[]).includes(p.key)
      ),
    [template]
  )

  const onPickTemplate = (id: string) => {
    setTemplateId(id)
    const t = (templates ?? []).find((x) => x.id === id)
    // نبدأ من القيم الممرَّرة (اسم الموكّل، جواله…) ثم يكمل الموظف الباقي
    const init: Record<string, string> = {}
    for (const p of t?.placeholders ?? []) init[p.key] = presets?.[p.key] ?? ''
    setValues(init)
  }

  const onGenerate = async () => {
    if (!template) return
    setBusy(true)
    try {
      const buf = await fetchTemplateFile(template.file_url)
      const blob = await fillDocx(buf, {
        ...values,
        ...autoDateValues(signedDate),
      })
      const safe = template.name.replace(/[^\w؀-ۿ\s.-]+/g, '_').trim()
      downloadBlob(blob, `${safe} - ${values.NAME || 'عقد'}.docx`)
      toast({ variant: 'success', title: 'وُلّد العقد وبدأ التنزيل' })
      onOpenChange(false)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر توليد العقد',
        description: errMessage(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>توليد عقد من قالب</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (templates ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed py-8 text-center">
            <FileType2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              لا قوالب مفعَّلة — ارفع قالباً من الإعدادات ← قوالب العقود.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>القالب</Label>
              <Select value={templateId} onValueChange={onPickTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر قالباً" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template?.description && (
                <p className="text-xs text-muted-foreground">{template.description}</p>
              )}
            </div>

            {template && (
              <div className="max-h-[45vh] space-y-3 overflow-y-auto pl-1">
                <div className="space-y-1.5">
                  <Label htmlFor="gen-date">تاريخ التوقيع</Label>
                  <Input
                    id="gen-date"
                    type="date"
                    value={signedDate}
                    onChange={(e) => setSignedDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    منه يُملأ اليوم والتاريخان الهجري والميلادي في القالب.
                  </p>
                </div>
                {fields.map((p) => (
                  <div key={p.key} className="space-y-1.5">
                    <Label htmlFor={`f-${p.key}`}>{p.label}</Label>
                    <Input
                      id={`f-${p.key}`}
                      value={values[p.key] ?? ''}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [p.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={!template || busy} onClick={onGenerate}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            توليد وتنزيل
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
