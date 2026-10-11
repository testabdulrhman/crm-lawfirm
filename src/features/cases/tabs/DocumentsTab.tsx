import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  FileImage,
  File as FileIcon,
  Paperclip,
  Eye,
  FolderOpen,
  CheckCircle2,
  XCircle,
  RotateCw,
  X,
  AlertTriangle,
  Folder,
  FolderPlus,
  FolderInput,
  Files,
  Inbox,
  MoreHorizontal,
  Pencil,
  Replace,
  History,
  ChevronLeft,
  ArrowUpDown,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { DualDatePicker } from '@/components/DualDatePicker'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'

import { fmtDatePref, fmtDateTime, fmtFileSize, fmtNumber, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePageState } from '@/hooks/usePageState'
import { pickFile } from '@/lib/files'
import { DropZone } from '@/components/DropZone'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import {
  useCaseDocuments,
  useAddDocument,
  useDeleteDocument,
  addDocumentDirect,
  useDocumentFolders,
  useSaveFolder,
  useDeleteFolder,
  useMoveDocuments,
  useRenameDocument,
  useReplaceDocumentFile,
  useDocumentVersions,
  useMatterSearch,
} from '@/hooks/useCaseDocuments'
import type { CaseDocument, DocumentFolder, DocumentVersion } from '@/types/db'

/* ===== تقرير رفع الدفعة — دائم حتى يُغلق، لأن المستخدم يحذف الأصل من جهازه ===== */

interface BatchItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'ok' | 'failed'
  error?: string
}

function BatchReport({
  batch,
  uploading,
  onRetry,
  onClose,
}: {
  batch: BatchItem[]
  uploading: boolean
  onRetry: () => void
  onClose: () => void
}) {
  const ok = batch.filter((b) => b.status === 'ok').length
  const failed = batch.filter((b) => b.status === 'failed').length
  const total = batch.length
  const allOk = !uploading && ok === total

  return (
    <div
      className={
        failed > 0 && !uploading
          ? 'space-y-2 rounded-xl border-2 border-destructive/60 bg-destructive/5 p-4'
          : 'space-y-2 rounded-xl border p-4 ' + (allOk ? 'border-green-600/40 bg-green-500/5' : 'bg-card')
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              جارٍ الرفع… {fmtNumber(ok + failed)}/{fmtNumber(total)}
            </>
          ) : failed > 0 ? (
            <>
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-destructive">
                {fmtNumber(failed)} من {fmtNumber(total)} لم يُرفع — لا تحذف هذه
                الملفات من جهازك
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              رُفعت كل الملفات ({fmtNumber(total)}) — يمكنك حذفها من جهازك بأمان
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {failed > 0 && !uploading && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
              <RotateCw className="h-3.5 w-3.5" />
              إعادة محاولة الفاشلة
            </Button>
          )}
          {!uploading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={onClose}
              aria-label="إغلاق التقرير"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {uploading && (
        <p className="text-xs text-muted-foreground">
          لا تغلق الصفحة حتى يكتمل الرفع ويظهر الملخّص.
        </p>
      )}

      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border bg-card">
        {batch.map((b) => (
          <li key={b.id} className="flex items-center gap-2.5 px-3 py-2">
            {b.status === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : b.status === 'failed' ? (
              <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            ) : b.status === 'uploading' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={
                  'truncate text-xs ' +
                  (b.status === 'failed'
                    ? 'font-semibold text-destructive'
                    : 'text-foreground')
                }
              >
                {b.file.name}
              </p>
              {b.error && (
                <p className="truncate text-xs text-destructive/80">{b.error}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {fmtFileSize(b.file.size)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function docIcon(d: CaseDocument) {
  const s = `${d.file_type ?? ''} ${d.name ?? ''}`.toLowerCase()
  if (s.includes('pdf')) return FileText
  if (/(image|jpg|jpeg|png|webp|gif)/.test(s)) return FileImage
  return FileIcon
}

type View = 'all' | 'none' | string // الكل · بدون مجلد · معرّف مجلد
type SortKey = 'date' | 'name' | 'type'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'التاريخ' },
  { key: 'name', label: 'الاسم' },
  { key: 'type', label: 'النوع' },
]

function sortDocs(docs: CaseDocument[], key: SortKey): CaseDocument[] {
  if (key === 'date') return docs // الاستعلام يرتّب بالتاريخ أصلاً
  const byName = (x: CaseDocument, y: CaseDocument) => (x.name ?? '').localeCompare(y.name ?? '', 'ar')
  return [...docs].sort(
    key === 'name'
      ? byName
      : (x, y) => (x.file_type ?? '').localeCompare(y.file_type ?? '') || byName(x, y)
  )
}

const DRAG_MIME = 'application/x-redwan-docs'

export function DocumentsTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError, error, refetch } = useCaseDocuments(caseId)
  const { data: folders = [] } = useDocumentFolders(caseId)
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const deleteM = useDeleteDocument(caseId)
  const moveM = useMoveDocuments(caseId)
  const deleteFolderM = useDeleteFolder(caseId)
  const replaceM = useReplaceDocumentFile(caseId)

  const [view, setView] = usePageState<View>(`docs-view:${caseId}`, 'all')
  const [sort, setSort] = usePageState<SortKey>('docs-sort', 'date')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<{ url: string | null; name: string | null } | null>(null)
  const [toDelete, setToDelete] = useState<CaseDocument | null>(null)
  const [folderDialog, setFolderDialog] = useState<null | { id?: string; name: string; parentId: string | null }>(null)
  const [folderToDelete, setFolderToDelete] = useState<DocumentFolder | null>(null)
  const [renaming, setRenaming] = useState<CaseDocument | null>(null)
  const [moving, setMoving] = useState<string[] | null>(null)
  const [versionsOf, setVersionsOf] = useState<CaseDocument | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const docs = data ?? []
  const { data: versions = {} } = useDocumentVersions(caseId, docs.map((d) => d.id))

  // المجلد المفتوح حُذف (أو من ملف آخر)؟ نرجع للكل
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const currentFolder = view !== 'all' && view !== 'none' ? folderById.get(view) ?? null : null
  useEffect(() => {
    if (view !== 'all' && view !== 'none' && folders.length > 0 && !folderById.has(view)) setView('all')
  }, [view, folders, folderById, setView])
  useEffect(() => setSelected(new Set()), [view])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    let none = 0
    for (const d of docs) {
      if (d.folder_id && folderById.has(d.folder_id)) m.set(d.folder_id, (m.get(d.folder_id) ?? 0) + 1)
      else none++
    }
    return { m, none }
  }, [docs, folderById])

  const children = (parentId: string | null) => folders.filter((f) => (f.parent_id ?? null) === parentId)
  const path = useMemo(() => {
    const out: DocumentFolder[] = []
    let f = currentFolder
    while (f) {
      out.unshift(f)
      f = f.parent_id ? folderById.get(f.parent_id) ?? null : null
    }
    return out
  }, [currentFolder, folderById])

  const shown = sortDocs(
    view === 'all'
      ? docs
      : view === 'none'
        ? docs.filter((d) => !d.folder_id || !folderById.has(d.folder_id))
        : docs.filter((d) => d.folder_id === view),
    sort
  )
  const subfolders = currentFolder ? children(currentFolder.id) : []
  const uploadFolderId = currentFolder?.id ?? null

  // رفع الدفعة بتقرير دائم: المستخدم يحذف الملفات من جهازه بعد الرفع،
  // فرسالة فشل تختفي بعد ثوانٍ = خطر ضياع ملف بلا رجعة. التقرير يبقى
  // معروضاً باسم كل ملف ومصيره حتى يُغلق بيده.
  const qc = useQueryClient()
  const [batch, setBatch] = useState<BatchItem[]>([])
  const uploading = batch.some((b) => b.status === 'uploading' || b.status === 'pending')

  const runBatch = useCallback(
    async (items: BatchItem[], folderId: string | null) => {
      for (const item of items) {
        setBatch((s) =>
          s.map((b) => (b.id === item.id ? { ...b, status: 'uploading' } : b))
        )
        try {
          await addDocumentDirect(caseId, {
            file: item.file,
            name: item.file.name,
            documentDate: todayISO(),
            description: null,
            uploadedByName: teamMember?.name ?? null,
            folderId,
          })
          setBatch((s) =>
            s.map((b) => (b.id === item.id ? { ...b, status: 'ok' } : b))
          )
        } catch (e) {
          setBatch((s) =>
            s.map((b) =>
              b.id === item.id
                ? { ...b, status: 'failed', error: errMessage(e) ?? 'سبب غير معروف' }
                : b
            )
          )
          // شبكة أمان: لو غادر المستخدم التبويب فتفكّك التقرير، يبقى التوست
          // (يظهر في أي شاشة وينجو من التفكيك) — لا فشل رفع صامتاً أبداً
          toast({
            variant: 'destructive',
            title: `لم يُرفع: ${item.file.name}`,
            description: errMessage(e) ?? undefined,
          })
        }
        // الشبكة تُحدَّث أولاً بأول حتى تظهر المرفوعة فوراً
        qc.invalidateQueries({ queryKey: ['case_documents', caseId] })
        qc.invalidateQueries({ queryKey: ['document_folders', caseId] })
      }
    },
    [caseId, teamMember?.name, qc]
  )

  // إغلاق المتصفح أثناء الرفع يقطع الدفعة بصمت — نعترض بسؤال تأكيد
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const uploadBatch = (files: File[]) => {
    if (files.length === 0 || uploading) return
    const items: BatchItem[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: 'pending',
    }))
    setBatch(items) // تقرير جديد يحل محل السابق
    void runBatch(items, uploadFolderId)
  }

  const retryFailed = () => {
    const failed = batch.filter((b) => b.status === 'failed')
    if (failed.length === 0 || uploading) return
    setBatch((s) =>
      s.map((b) => (b.status === 'failed' ? { ...b, status: 'pending', error: undefined } : b))
    )
    void runBatch(failed, uploadFolderId)
  }

  // السحب إلى مجلد: يُسحب المحدَّد كله إن كان المسحوب منه، وإلا المسحوب وحده
  const dragIds = (d: CaseDocument) => (selected.has(d.id) ? [...selected] : [d.id])
  const dropOn = (folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return
      e.preventDefault()
      setDropTarget(folderId ?? 'none')
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_MIME)
      setDropTarget(null)
      if (!raw) return
      e.preventDefault()
      const ids = (JSON.parse(raw) as string[]).filter((id) => {
        const d = docs.find((x) => x.id === id)
        return d && (d.folder_id ?? null) !== folderId
      })
      if (ids.length) moveM.mutate({ ids, folderId }, { onSuccess: () => setSelected(new Set()) })
    },
  })

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const replaceFile = async (d: CaseDocument) => {
    const f = await pickFile()
    if (f) replaceM.mutate({ id: d.id, file: f, by: teamMember?.name ?? null })
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل المستندات"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  const navItem = (
    key: View,
    label: string,
    count: number,
    icon: LucideIcon,
    depth = 0,
    folder?: DocumentFolder
  ) => {
    const Icon = icon
    const active = view === key
    const isDrop = key !== 'all' && dropTarget === key
    return (
      <div
        key={key}
        className={cn(
          'group flex shrink-0 items-center rounded-xl transition-colors',
          active ? 'bg-gold/15' : 'hover:bg-muted',
          isDrop && 'ring-2 ring-gold'
        )}
        style={depth ? { paddingInlineStart: depth * 14 } : undefined}
        {...(key === 'all' ? {} : dropOn(key === 'none' ? null : key))}
      >
        <button
          type="button"
          onClick={() => setView(key)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-start text-sm',
            active ? 'font-semibold text-gold-700 dark:text-gold-300' : 'text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate whitespace-nowrap">{label}</span>
          <span className="ms-auto text-xs tabular-nums opacity-70">{fmtNumber(count)}</span>
        </button>
        {folder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="me-1 rounded-md p-1 text-muted-foreground hover:bg-background lg:hidden lg:group-hover:block lg:data-[state=open]:block"
                aria-label={`خيارات ${folder.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFolderDialog({ parentId: folder.id, name: '' })}>
                <FolderPlus className="h-4 w-4" /> مجلد فرعي
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFolderDialog({ id: folder.id, name: folder.name, parentId: folder.parent_id })}>
                <Pencil className="h-4 w-4" /> إعادة تسمية
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setFolderToDelete(folder)}>
                <Trash2 className="h-4 w-4" /> حذف المجلد
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  const tree = (parentId: string | null, depth: number): React.ReactNode[] =>
    children(parentId).flatMap((f) => [
      navItem(f.id, f.name, counts.m.get(f.id) ?? 0, view === f.id ? FolderOpen : Folder, depth, f),
      ...tree(f.id, depth + 1),
    ])

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* المجلدات — عمود على اليمين في الحاسب، وشريط أفقي يُمرَّر في الجوال (min-w-0 وإلا مدّ الشريطُ الصفحة) */}
      <nav className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {navItem('all', 'كل المستندات', docs.length, Files)}
          {tree(null, 0)}
          {navItem('none', 'بدون مجلد', counts.none, Inbox)}
          <button
            type="button"
            onClick={() => setFolderDialog({ parentId: currentFolder?.id ?? null, name: '' })}
            className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" />
            مجلد جديد
          </button>
        </div>
      </nav>

      <div className="min-w-0 space-y-3">
        {/* المسار والأدوات */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setView('all')}>
              المستندات
            </button>
            {view === 'none' && (
              <>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">بدون مجلد</span>
              </>
            )}
            {path.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                {i === path.length - 1 ? (
                  <span className="font-semibold text-foreground">{f.name}</span>
                ) : (
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setView(f.id)}>
                    {f.name}
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-32" aria-label="الترتيب">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="gold" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              رفع مستند
            </Button>
          </div>
        </div>

        <DropZone
          onFiles={uploadBatch}
          uploadingCount={batch.filter((b) => b.status === 'pending' || b.status === 'uploading').length}
          hint={
            currentFolder
              ? `تُرفع داخل «${currentFolder.name}» باسم الملف وتاريخ اليوم.`
              : 'تُرفع مباشرة باسم الملف وتاريخ اليوم، ويضعها التصنيف في مجلدها. للتسمية والوصف استخدم «رفع مستند».'
          }
        />

        {batch.length > 0 && (
          <BatchReport
            batch={batch}
            uploading={uploading}
            onRetry={retryFailed}
            onClose={() => setBatch([])}
          />
        )}

        {/* المحدَّد */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2">
            <span className="text-sm font-medium text-foreground">حُدّد {fmtNumber(selected.size)}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="gold" onClick={() => setMoving([...selected])}>
                <FolderInput className="h-4 w-4" />
                نقل المحدد
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}

        {/* المجلدات الفرعية */}
        {subfolders.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {subfolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setView(f.id)}
                {...dropOn(f.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted',
                  dropTarget === f.id && 'ring-2 ring-gold'
                )}
              >
                <Folder className="h-5 w-5 shrink-0 text-gold" />
                <span className="truncate font-medium text-foreground">{f.name}</span>
                <span className="ms-auto text-xs text-muted-foreground">{fmtNumber(counts.m.get(f.id) ?? 0)}</span>
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 && subfolders.length === 0 ? (
          docs.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="لا توجد مستندات"
              description="ارفع أول مستند بسحبه هنا أو عبر زر الرفع."
              actionLabel="رفع مستند"
              onAction={() => setUploadOpen(true)}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              هذا المجلد فارغ — اسحب مستندات إليه أو ارفع هنا.
            </p>
          )
        ) : shown.length > 0 ? (
          <Card>
            <CardContent className="divide-y p-0">
              {shown.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  folderName={view === 'all' && d.folder_id ? folderById.get(d.folder_id)?.name ?? null : null}
                  versions={versions[d.id]?.length ?? 0}
                  selected={selected.has(d.id)}
                  isDirector={isDirector}
                  replacing={replaceM.isPending && replaceM.variables?.id === d.id}
                  onToggle={() => toggle(d.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds(d)))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onPreview={() => setPreview({ url: d.file_url, name: d.name })}
                  onRename={() => setRenaming(d)}
                  onMove={() => setMoving([d.id])}
                  onReplace={() => void replaceFile(d)}
                  onVersions={() => setVersionsOf(d)}
                  onDelete={() => setToDelete(d)}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
        {shown.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            اسحب المستند إلى مجلد لنقله · حدّد عدة مستندات لنقلها معاً
          </p>
        )}
      </div>

      <UploadDialog
        caseId={caseId}
        folderId={uploadFolderId}
        folderName={currentFolder?.name ?? null}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.url ?? null}
        fileName={preview?.name ?? null}
      />

      <FolderDialog caseId={caseId} value={folderDialog} onClose={() => setFolderDialog(null)} />
      <RenameDialog caseId={caseId} doc={renaming} onClose={() => setRenaming(null)} />
      <MoveDialog
        caseId={caseId}
        ids={moving}
        folders={folders}
        onClose={() => setMoving(null)}
        onMoved={() => setSelected(new Set())}
      />
      <VersionsDialog
        doc={versionsOf}
        versions={versionsOf ? versions[versionsOf.id] ?? [] : []}
        onClose={() => setVersionsOf(null)}
        onOpen={(v) => setPreview({ url: v.file_url, name: v.name })}
      />

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المجلد «{folderToDelete?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يُحذف أي مستند: ما في المجلد من ملفات ومجلدات فرعية ينتقل إلى
              {folderToDelete?.parent_id ? ' المجلد الأعلى' : ' «بدون مجلد»'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (folderToDelete) deleteFolderM.mutate(folderToDelete.id)
                setFolderToDelete(null)
              }}
            >
              حذف المجلد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المستند</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف: «{toDelete?.name}». يمكن استرجاعه لاحقاً من قِبل
              المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete)
                  deleteM.mutate({
                    id: toDelete.id,
                    deletedBy: teamMember?.name ?? null,
                  })
                setToDelete(null)
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

function DocRow({
  doc: d,
  folderName,
  versions,
  selected,
  isDirector,
  replacing,
  onToggle,
  onDragStart,
  onPreview,
  onRename,
  onMove,
  onReplace,
  onVersions,
  onDelete,
}: {
  doc: CaseDocument
  folderName: string | null
  versions: number
  selected: boolean
  isDirector: boolean
  replacing: boolean
  onToggle: () => void
  onDragStart: (e: React.DragEvent) => void
  onPreview: () => void
  onRename: () => void
  onMove: () => void
  onReplace: () => void
  onVersions: () => void
  onDelete: () => void
}) {
  const Icon = docIcon(d)
  const name = d.name ?? 'ملف'
  const meta = [
    d.document_date ? fmtDatePref(d.document_date) : null,
    fmtFileSize(d.file_size),
    d.uploaded_by_name ? `رفعه ${d.uploaded_by_name}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn('flex items-center gap-3 px-3 py-2.5', selected && 'bg-gold/5')}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-gold-600"
        aria-label={`تحديد ${name}`}
      />
      <button type="button" onClick={onPreview} className="flex min-w-0 flex-1 items-center gap-3 text-start" title="معاينة">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10">
          {replacing ? <Loader2 className="h-4 w-4 animate-spin text-gold" /> : <Icon className="h-4 w-4 text-gold" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {versions > 0 && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                نسخة {fmtNumber(versions + 1)}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
        </span>
      </button>
      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {folderName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <Folder className="h-3 w-3" />
            {folderName}
          </span>
        )}
        {d.category && (
          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold-700 dark:text-gold-300">
            {d.category}
          </span>
        )}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`خيارات ${name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="h-4 w-4" /> معاينة
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="h-4 w-4" /> إعادة تسمية
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMove}>
            <FolderInput className="h-4 w-4" /> نقل
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReplace}>
            <Replace className="h-4 w-4" /> استبدال الملف
          </DropdownMenuItem>
          {versions > 0 && (
            <DropdownMenuItem onClick={onVersions}>
              <History className="h-4 w-4" /> النسخ السابقة ({fmtNumber(versions)})
            </DropdownMenuItem>
          )}
          {/* الحذف للمدير فقط — كما كان */}
          {isDirector && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" /> حذف
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function FolderDialog({
  caseId,
  value,
  onClose,
}: {
  caseId: string
  value: null | { id?: string; name: string; parentId: string | null }
  onClose: () => void
}) {
  const saveM = useSaveFolder(caseId)
  const [name, setName] = useState('')
  useEffect(() => setName(value?.name ?? ''), [value])
  const submit = () => {
    if (!value || !name.trim()) return
    saveM.mutate({ id: value.id, name, parentId: value.parentId }, { onSuccess: onClose })
  }
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && !saveM.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{value?.id ? 'إعادة تسمية المجلد' : value?.parentId ? 'مجلد فرعي جديد' : 'مجلد جديد'}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          maxLength={80}
          placeholder="مثال: مذكرات الاستئناف"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={!name.trim() || saveM.isPending} onClick={submit}>
            {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saveM.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameDialog({ caseId, doc, onClose }: { caseId: string; doc: CaseDocument | null; onClose: () => void }) {
  const renameM = useRenameDocument(caseId)
  const [name, setName] = useState('')
  useEffect(() => setName(doc?.name ?? ''), [doc])
  const submit = () => {
    if (!doc || !name.trim()) return
    renameM.mutate({ id: doc.id, name }, { onSuccess: onClose })
  }
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && !renameM.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إعادة تسمية المستند</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={!name.trim() || renameM.isPending} onClick={submit}>
            {renameM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose} disabled={renameM.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({
  caseId,
  ids,
  folders,
  onClose,
  onMoved,
}: {
  caseId: string
  ids: string[] | null
  folders: DocumentFolder[]
  onClose: () => void
  onMoved: () => void
}) {
  const moveM = useMoveDocuments(caseId)
  const [mode, setMode] = useState<'here' | 'other'>('here')
  // مجلد في هذا الملف: null = بدون مجلد، undefined = لم يُختر بعد (لا نقل بالخطأ بضغطة واحدة)
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [otherCase, setOtherCase] = useState<{ id: string; label: string } | null>(null)
  const search = useMatterSearch(mode === 'other' ? q : '')
  useEffect(() => {
    if (ids) {
      setMode('here')
      setTarget(undefined)
      setQ('')
      setOtherCase(null)
    }
  }, [ids])

  const tree = (parentId: string | null, depth: number): React.ReactNode[] =>
    folders
      .filter((f) => (f.parent_id ?? null) === parentId)
      .flatMap((f) => [
        <button
          key={f.id}
          type="button"
          onClick={() => setTarget(f.id)}
          style={{ paddingInlineStart: 12 + depth * 16 }}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg py-2 pe-3 text-start text-sm hover:bg-muted',
            target === f.id && 'bg-gold/15 font-semibold'
          )}
        >
          <Folder className="h-4 w-4 text-gold" />
          {f.name}
        </button>,
        ...tree(f.id, depth + 1),
      ])

  const submit = () => {
    if (!ids) return
    const args =
      mode === 'other'
        ? otherCase ? { ids, folderId: null, targetCaseId: otherCase.id } : null
        : target !== undefined ? { ids, folderId: target } : null
    if (!args) return
    moveM.mutate(args, {
      onSuccess: () => {
        onMoved()
        onClose()
      },
    })
  }

  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && !moveM.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            نقل {ids && ids.length > 1 ? `${fmtNumber(ids.length)} مستندات` : 'المستند'}
          </DialogTitle>
        </DialogHeader>
        <div className="inline-flex rounded-xl border bg-card p-1 text-sm">
          {(['here', 'other'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn('rounded-lg px-3 py-1.5', mode === m ? 'bg-gold font-semibold text-navy' : 'text-muted-foreground')}
            >
              {m === 'here' ? 'مجلد في هذا الملف' : 'ملف آخر'}
            </button>
          ))}
        </div>
        {mode === 'here' ? (
          <div className="max-h-72 overflow-y-auto rounded-xl border p-1">
            <button
              type="button"
              onClick={() => setTarget(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted',
                target === null && 'bg-gold/15 font-semibold'
              )}
            >
              <Inbox className="h-4 w-4 text-muted-foreground" />
              بدون مجلد
            </button>
            {tree(null, 0)}
          </div>
        ) : (
          <div className="space-y-2">
            <Input autoFocus placeholder="رقم الملف أو عنوانه" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-60 overflow-y-auto rounded-xl border p-1">
              {q.trim().length < 2 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">اكتب حرفين على الأقل</p>
              ) : search.isLoading ? (
                <p className="p-3 text-center text-xs text-muted-foreground">جارٍ البحث…</p>
              ) : (search.data ?? []).filter((c) => c.id !== caseId).length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">لا نتائج</p>
              ) : (
                (search.data ?? [])
                  .filter((c) => c.id !== caseId)
                  .map((c) => {
                    const label = [c.office_num, c.title].filter(Boolean).join(' · ')
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setOtherCase({ id: c.id, label })}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted',
                          otherCase?.id === c.id && 'bg-gold/15 font-semibold'
                        )}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0 text-gold" />
                        <span className="truncate">{label}</span>
                      </button>
                    )
                  })
              )}
            </div>
            <p className="text-xs text-muted-foreground">يصل إلى الملف الآخر ويدخل مجلد تصنيفه إن وُجد.</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={moveM.isPending || (mode === 'other' ? !otherCase : target === undefined)}
            onClick={submit}
          >
            {moveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            نقل
          </Button>
          <Button variant="outline" onClick={onClose} disabled={moveM.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VersionsDialog({
  doc,
  versions,
  onClose,
  onOpen,
}: {
  doc: CaseDocument | null
  versions: DocumentVersion[]
  onClose: () => void
  onOpen: (v: DocumentVersion) => void
}) {
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-gold" />
            النسخ السابقة — {doc?.name}
          </DialogTitle>
        </DialogHeader>
        <ul className="divide-y rounded-xl border">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                نسخة {fmtNumber(versions.length - i)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{v.name ?? 'ملف'}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  استُبدلت {fmtDateTime(v.replaced_at)}
                  {v.replaced_by_name ? ` · ${v.replaced_by_name}` : ''} · {fmtFileSize(v.file_size)}
                </span>
              </span>
              <Button size="sm" variant="outline" disabled={!v.file_url} onClick={() => onOpen(v)}>
                <Eye className="h-4 w-4" />
                فتح
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">الحالية هي المعروضة في القائمة؛ والسابقة محفوظة هنا ولا تُحذف.</p>
      </DialogContent>
    </Dialog>
  )
}

function UploadDialog({
  caseId,
  folderId,
  folderName,
  open,
  onOpenChange,
}: {
  caseId: string
  folderId: string | null
  folderName: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { teamMember } = useAuth()
  const addM = useAddDocument(caseId)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')

  const reset = () => {
    setFile(null)
    setName('')
    setDate(todayISO())
    setDescription('')
  }

  const submit = () => {
    if (!file) return
    addM.mutate(
      {
        file,
        name: name || file.name,
        documentDate: date,
        description,
        uploadedByName: teamMember?.name ?? null,
        folderId,
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // لا إغلاق أثناء الرفع — الإغلاق يوهم أن الرفع أُلغي بينما يستمر خلف الكواليس
        if (addM.isPending) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفع مستند{folderName ? ` إلى «${folderName}»` : ''}</DialogTitle>
        </DialogHeader>

        <div className="my-3 space-y-3">
          <div className="space-y-1.5">
            <Label>الملف *</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const f = await pickFile()
                  if (f) {
                    setFile(f)
                    if (!name) setName(f.name)
                  }
                }}
              >
                <Paperclip className="h-4 w-4" />
                اختيار ملف
              </Button>
              {file && (
                <span className="truncate text-xs text-muted-foreground">
                  {file.name}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d_name">الاسم</Label>
            <Input
              id="d_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DualDatePicker
            label="تاريخ المستند"
            value={date || null}
            onChange={(v) => setDate(v ?? '')}
          />
          <div className="space-y-1.5">
            <Label htmlFor="d_desc">الوصف</Label>
            <Textarea
              id="d_desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={!file || addM.isPending}
            onClick={submit}
          >
            {addM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            رفع
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addM.isPending}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
