// مستندات المكتب (طلب المدير 2026-09-26): تراخيص المكتب وشهاداته بتواريخ انتهائها.
// «ارفع ملف بشكل مباشر والنظام يصنّف لي المستند ويدخل البيانات تلقائي»: الإفلات ← رفع ← قراءة
// بالذكاء ← نافذة مراجعة معبّأة ومطابَقة بمستندها المسجّل ← حفظ بضغطة. والقاعدة تنبّه قبل الانتهاء.
import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Building2,
  Copy,
  Eye,
  FileBadge,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DropZone } from '@/components/DropZone'
import { DualDatePicker } from '@/components/DualDatePicker'
import { EmptyState } from '@/components/EmptyState'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useConfirm } from '@/components/ConfirmDialog'
import { Ltr } from '@/components/Ltr'
import { useIsDirector } from '@/hooks/useIsDirector'
import { toast } from '@/hooks/use-toast'
import { pickFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { daysLabel, fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  OFFICE_DOC_CATEGORY_LABELS,
  uploadAndExtract,
  useDeleteOfficeDoc,
  useOfficeDocuments,
  useSaveOfficeDoc,
  type OfficeDocCategory,
  type OfficeDocExtraction,
  type OfficeDocument,
} from '@/hooks/useOfficeDocuments'

/* ===== حالة الانتهاء ===== */

type Health = 'expired' | 'soon' | 'valid' | 'none'

function dayDiff(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayISO().split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5)
}

function health(doc: OfficeDocument): { h: Health; days: number | null } {
  if (!doc.expiry_date) return { h: 'none', days: null }
  const days = dayDiff(doc.expiry_date)
  if (days <= 0) return { h: 'expired', days }
  if (days <= 60) return { h: 'soon', days }
  return { h: 'valid', days }
}

const HEALTH_STYLE: Record<Health, { chip: string; ring: string; icon: string }> = {
  expired: { chip: 'bg-destructive/10 text-destructive', ring: 'border-destructive/40', icon: 'bg-destructive/10 text-destructive' },
  soon: { chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', ring: 'border-amber-500/40', icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  valid: { chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: '', icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  none: { chip: 'bg-muted text-muted-foreground', ring: '', icon: 'bg-muted text-muted-foreground' },
}

function healthText(doc: OfficeDocument): string {
  const { h, days } = health(doc)
  if (h === 'none') return 'بلا تاريخ انتهاء'
  // صياغة محايدة تصلح للترخيص والشهادة معاً
  if (days === 0) return 'تنتهي الصلاحية اليوم'
  if (h === 'expired') return `انتهت الصلاحية منذ ${daysLabel(-days!)}`
  if (h === 'soon') return `تنتهي الصلاحية بعد ${daysLabel(days!)}`
  return `الصلاحية حتى ${fmtDatePref(doc.expiry_date)}`
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  license: BadgeCheck,
  certificate: FileBadge,
  registration: ScrollText,
  membership: Building2,
  contract: FileSignature,
}

const ORDER: Record<Health, number> = { expired: 0, soon: 1, valid: 2, none: 3 }

type Filter = 'all' | Health | 'nofile'

/* ===== مسودة المراجعة ===== */

interface Draft {
  targetId: string | 'new'
  lockTarget: boolean
  name: string
  category: OfficeDocCategory
  doc_number: string
  issuing_authority: string
  issue_date: string | null
  expiry_date: string | null
  notes: string
  file_url: string | null
  file_name: string | null
  extraction: OfficeDocExtraction | null
  readError: string | null
  /** رُفع ملف في هذه الجلسة — يُحفظ رابطه */
  newFile: boolean
}

function draftFromDoc(d: OfficeDocument): Draft {
  return {
    targetId: d.id,
    lockTarget: true,
    name: d.name,
    category: ((d.type as OfficeDocCategory) || 'other') as OfficeDocCategory,
    doc_number: d.doc_number ?? '',
    issuing_authority: d.issuing_authority ?? '',
    issue_date: d.issue_date,
    expiry_date: d.expiry_date,
    notes: d.notes ?? '',
    file_url: d.file_url,
    file_name: d.file_name,
    extraction: null,
    readError: null,
    newFile: false,
  }
}

/* ===== الصفحة ===== */

export function OfficeDocumentsPage() {
  const { data, isLoading, error, refetch } = useOfficeDocuments()
  const isDirector = useIsDirector()
  const del = useDeleteOfficeDoc()
  const { confirm, dialog } = useConfirm()
  const [filter, setFilter] = useState<Filter>('all')
  const [reading, setReading] = useState(0)
  const [queue, setQueue] = useState<Draft[]>([])
  const [preview, setPreview] = useState<OfficeDocument | null>(null)

  const docs = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => {
        const ha = health(a)
        const hb = health(b)
        if (ORDER[ha.h] !== ORDER[hb.h]) return ORDER[ha.h] - ORDER[hb.h]
        return (ha.days ?? 99999) - (hb.days ?? 99999)
      }),
    [data]
  )
  const counts = useMemo(() => {
    const c = { expired: 0, soon: 0, valid: 0, none: 0, nofile: 0 }
    for (const d of docs) {
      c[health(d).h]++
      if (!d.file_url) c.nofile++
    }
    return c
  }, [docs])
  const shown = docs.filter((d) =>
    filter === 'all' ? true : filter === 'nofile' ? !d.file_url : health(d).h === filter
  )

  /** يرفع كل ملف ويقرؤه ثم يضعه في طابور المراجعة — نافذة لكل ملف بالترتيب */
  const ingest = async (files: File[], forDoc?: OfficeDocument) => {
    setReading((n) => n + files.length)
    for (const f of files) {
      try {
        const r = await uploadAndExtract(f)
        const x = r.extraction
        const base: Draft = forDoc
          ? draftFromDoc(forDoc)
          : {
              targetId: 'new',
              lockTarget: false,
              name: '',
              category: 'certificate',
              doc_number: '',
              issuing_authority: '',
              issue_date: null,
              expiry_date: null,
              notes: '',
              file_url: null,
              file_name: null,
              extraction: null,
              readError: null,
              newFile: false,
            }
        // ما قرأه الذكاء يعلو القديم، والفارغ منه لا يمسح المسجّل
        const target = forDoc ? forDoc.id : x?.match_id ?? 'new'
        const matched = (data ?? []).find((d) => d.id === target)
        setQueue((q) => [
          ...q,
          {
            ...base,
            targetId: target,
            name: forDoc?.name ?? matched?.name ?? x?.name ?? f.name.replace(/\.[^.]+$/, ''),
            category: x?.category ?? base.category,
            doc_number: x?.doc_number ?? base.doc_number,
            issuing_authority: x?.issuing_authority ?? base.issuing_authority,
            issue_date: x?.issue_date ?? base.issue_date,
            expiry_date: x?.expiry_date ?? base.expiry_date,
            file_url: r.file_url,
            file_name: r.file_name,
            extraction: x,
            readError: r.error,
            newFile: true,
          },
        ])
      } catch (e) {
        toast({ variant: 'destructive', title: `تعذّر رفع «${f.name}»`, description: errMessage(e) })
      } finally {
        setReading((n) => n - 1)
      }
    }
  }

  const uploadFor = async (d: OfficeDocument) => {
    const f = await pickFile({ accept: 'application/pdf,image/*' })
    if (f) void ingest([f], d)
  }

  const current = queue[0] ?? null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <FileBadge className="h-6 w-6 text-gold" />
            مستندات المكتب
            {data && <span className="text-base font-normal text-muted-foreground">({fmtNumber(data.length)})</span>}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            تراخيص المكتب وشهاداته الرسمية — ينبّهك النظام قبل انتهاء أيٍّ منها بـ60 و30 و7 أيام.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => setQueue((q) => [...q, { ...emptyDraft() }])}
        >
          <Plus className="h-4 w-4" />
          إضافة يدوية
        </Button>
      </div>

      {/* الإفلات: الطريق الأسرع */}
      <DropZone
        onFiles={(fs) => void ingest(fs)}
        uploadingCount={reading}
        hint="أفلت ملف الترخيص أو الشهادة هنا (PDF أو صورة) — يقرؤه النظام ويعبّئ بياناته، وتراجعها قبل الحفظ"
        className="py-8"
      />
      {reading > 0 && (
        <p className="-mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-gold" />
          يقرأ النظام {reading === 1 ? 'الملف' : `${fmtNumber(reading)} ملفات`}… (بضع ثوانٍ)
        </p>
      )}

      {/* ملخّص قابل للنقر */}
      {!isLoading && !error && docs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile label="منتهية" value={counts.expired} tone="red" active={filter === 'expired'} onClick={() => setFilter(filter === 'expired' ? 'all' : 'expired')} />
          <SummaryTile label="تنتهي خلال 60 يوماً" value={counts.soon} tone="amber" active={filter === 'soon'} onClick={() => setFilter(filter === 'soon' ? 'all' : 'soon')} />
          <SummaryTile label="سارية" value={counts.valid} tone="green" active={filter === 'valid'} onClick={() => setFilter(filter === 'valid' ? 'all' : 'valid')} />
          <SummaryTile label="بلا ملف مرفوع" value={counts.nofile} tone="gray" active={filter === 'nofile'} onClick={() => setFilter(filter === 'nofile' ? 'all' : 'nofile')} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <QueryErrorState title="تعذّر تحميل مستندات المكتب" error={error} onRetry={() => refetch()} />
      ) : docs.length === 0 ? (
        <EmptyState icon={FileBadge} title="لا مستندات بعد" description="أفلت أول ترخيص أو شهادة في المنطقة أعلاه." />
      ) : shown.length === 0 ? (
        <EmptyState icon={FileBadge} title="لا مستندات بهذا التصنيف" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <DocCard
              key={d.id}
              doc={d}
              isDirector={isDirector}
              onPreview={() => setPreview(d)}
              onEdit={() => setQueue((q) => [...q, draftFromDoc(d)])}
              onUpload={() => void uploadFor(d)}
              onDelete={() =>
                confirm({
                  title: 'حذف المستند',
                  description: `سيُحذف «${d.name}» من مستندات المكتب. متابعة؟`,
                  onConfirm: () => del.mutate(d.id),
                })
              }
            />
          ))}
        </div>
      )}

      {current && (
        <ReviewDialog
          key={queue.length + (current.file_url ?? current.targetId)}
          draft={current}
          docs={data ?? []}
          remaining={queue.length - 1}
          onDone={() => setQueue((q) => q.slice(1))}
        />
      )}

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.file_name ?? preview?.name ?? null}
      />
      {dialog}
    </div>
  )
}

function emptyDraft(): Draft {
  return {
    targetId: 'new',
    lockTarget: false,
    name: '',
    category: 'certificate',
    doc_number: '',
    issuing_authority: '',
    issue_date: null,
    expiry_date: null,
    notes: '',
    file_url: null,
    file_name: null,
    extraction: null,
    readError: null,
    newFile: false,
  }
}

/* ===== بطاقة ملخّص ===== */

const TONES = {
  red: 'text-destructive',
  amber: 'text-amber-600 dark:text-amber-300',
  green: 'text-emerald-600 dark:text-emerald-300',
  gray: 'text-muted-foreground',
}

function SummaryTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: keyof typeof TONES
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border bg-card p-4 text-right shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'ring-2 ring-gold'
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-3xl font-bold tracking-tight', value > 0 ? TONES[tone] : 'text-foreground')}>
        {fmtNumber(value)}
      </p>
    </button>
  )
}

/* ===== بطاقة المستند ===== */

function DocCard({
  doc,
  isDirector,
  onPreview,
  onEdit,
  onUpload,
  onDelete,
}: {
  doc: OfficeDocument
  isDirector: boolean
  onPreview: () => void
  onEdit: () => void
  onUpload: () => void
  onDelete: () => void
}) {
  const { h } = health(doc)
  const st = HEALTH_STYLE[h]
  const Icon = CATEGORY_ICON[doc.type ?? ''] ?? FileText
  return (
    <Card className={cn('flex flex-col transition-shadow hover:shadow-md', st.ring)}>
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', st.icon)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-foreground">{doc.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {doc.issuing_authority || (doc.type ? OFFICE_DOC_CATEGORY_LABELS[doc.type as OfficeDocCategory] : 'جهة الإصدار غير مسجّلة')}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          {doc.doc_number && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span>الرقم</span>
              <Ltr className="font-medium text-foreground">{doc.doc_number}</Ltr>
              <button
                type="button"
                title="نسخ الرقم"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => {
                  void navigator.clipboard?.writeText(doc.doc_number!)
                  toast({ title: 'نُسخ الرقم' })
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {doc.issue_date && (
            <p className="text-muted-foreground">
              صدر <span className="text-foreground">{fmtDatePref(doc.issue_date)}</span>
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', st.chip)}>{healthText(doc)}</span>
          {!doc.file_url && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">بلا ملف</span>
          )}
          {doc.ai_extracted && (
            <span title="عُبّئت بياناته من قراءة الملف" className="text-gold">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="-mx-2 flex flex-wrap gap-1 border-t pt-2">
          {doc.file_url && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={onPreview}>
              <Eye className="h-3.5 w-3.5" />
              معاينة
            </Button>
          )}
          <Button
            variant={doc.file_url && h !== 'expired' ? 'ghost' : 'gold'}
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            onClick={onUpload}
          >
            {doc.file_url ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {doc.file_url ? (h === 'expired' || h === 'soon' ? 'رفع النسخة المجدّدة' : 'استبدال الملف') : 'رفع الملف'}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </Button>
          {isDirector && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
              title="حذف"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ===== نافذة المراجعة ===== */

function ReviewDialog({
  draft,
  docs,
  remaining,
  onDone,
}: {
  draft: Draft
  docs: OfficeDocument[]
  remaining: number
  onDone: () => void
}) {
  const save = useSaveOfficeDoc()
  const [v, setV] = useState<Draft>(draft)
  const [showFile, setShowFile] = useState(false)
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((p) => ({ ...p, [k]: val }))
  const target = docs.find((d) => d.id === v.targetId)
  const x = v.extraction

  const submit = () => {
    if (!v.name.trim()) {
      toast({ variant: 'destructive', title: 'اكتب اسم المستند' })
      return
    }
    save.mutate(
      {
        id: v.targetId === 'new' ? null : v.targetId,
        input: {
          name: v.name.trim(),
          type: v.category,
          doc_number: v.doc_number.trim() || null,
          issuing_authority: v.issuing_authority.trim() || null,
          issue_date: v.issue_date,
          expiry_date: v.expiry_date,
          notes: v.notes.trim() || null,
          ...(v.newFile ? { file_url: v.file_url, file_name: v.file_name, ai_extracted: !!x } : {}),
        },
      },
      { onSuccess: onDone }
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onDone()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {x ? <Sparkles className="h-5 w-5 text-gold" /> : <FileBadge className="h-5 w-5 text-gold" />}
            {x ? 'قرأ النظام الملف — راجع قبل الحفظ' : draft.lockTarget ? 'تعديل المستند' : 'مستند جديد'}
          </DialogTitle>
          <DialogDescription>
            {x
              ? x.summary
              : v.readError
                ? `تعذّرت قراءة الملف (${v.readError}) — عبّئ البيانات يدوياً، والملف مرفق.`
                : 'بيانات المستند كما تظهر في صفحة مستندات المكتب.'}
            {remaining > 0 && ` · بعده ${fmtNumber(remaining)} ${remaining === 1 ? 'ملف' : 'ملفات'} للمراجعة`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {x && x.confidence !== 'high' && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              القراءة {x.confidence === 'low' ? 'ضعيفة' : 'متوسطة الثقة'} — دقّق التواريخ والرقم.
            </p>
          )}

          {/* أين يُحفظ: تحديث مستند مسجّل أو جديد */}
          {!draft.lockTarget && v.newFile && (
            <div className="space-y-1.5">
              <Label>يُحفظ في</Label>
              <Select value={v.targetId} onValueChange={(id) => {
                const d = docs.find((o) => o.id === id)
                setV((p) => ({ ...p, targetId: id, name: d?.name ?? (x?.name || p.name) }))
              }} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">➕ مستند جديد</SelectItem>
                  <SelectSeparator />
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      تحديث: {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {target && x?.match_id === target.id && (
                <p className="text-xs text-muted-foreground">
                  تعرّف النظام عليه نسخةً من «{target.name}» المسجّل — سيُحدَّث بدل أن يتكرر.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="od_name">اسم المستند</Label>
              <Input id="od_name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: شهادة الزكاة" />
            </div>
            <div className="space-y-1.5">
              <Label>التصنيف</Label>
              <Select value={v.category} onValueChange={(c) => set('category', c as OfficeDocCategory)} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OFFICE_DOC_CATEGORY_LABELS) as OfficeDocCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {OFFICE_DOC_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="od_num">الرقم</Label>
              <Input id="od_num" dir="ltr" value={v.doc_number} onChange={(e) => set('doc_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od_auth">جهة الإصدار</Label>
              <Input id="od_auth" value={v.issuing_authority} onChange={(e) => set('issuing_authority', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DualDatePicker label="تاريخ الإصدار" value={v.issue_date} onChange={(d) => set('issue_date', d)} />
            <DualDatePicker label="تاريخ الانتهاء" value={v.expiry_date} onChange={(d) => set('expiry_date', d)} />
          </div>
          {x?.hijri_note && <p className="-mt-2 text-xs text-muted-foreground">في المستند: {x.hijri_note}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="od_notes">ملاحظات</Label>
            <Textarea id="od_notes" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="مثال: يُجدَّد من منصة قوى قبل الانتهاء بشهر" />
          </div>

          {v.file_url && (
            <button
              type="button"
              onClick={() => setShowFile(true)}
              className="flex w-full items-center gap-3 rounded-xl border bg-muted/30 p-3 text-right hover:bg-muted/60"
            >
              <FileText className="h-5 w-5 text-gold" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <bdi>{v.file_name || 'الملف المرفق'}</bdi>
              </span>
              <span className="text-xs text-muted-foreground">معاينة</span>
            </button>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {v.targetId === 'new' ? 'إضافة المستند' : 'حفظ'}
          </Button>
          <Button variant="outline" disabled={save.isPending} onClick={onDone}>
            {remaining > 0 ? 'تخطٍّ' : 'إلغاء'}
          </Button>
        </DialogFooter>

        <FilePreviewDialog
          open={showFile}
          onOpenChange={setShowFile}
          fileUrl={v.file_url}
          fileName={v.file_name}
        />
      </DialogContent>
    </Dialog>
  )
}
