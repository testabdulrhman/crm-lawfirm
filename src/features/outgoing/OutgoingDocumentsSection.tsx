// مرفقات الخطاب الصادر — رفع متعدد بالسحب والإفلات، معاينة، وحذف (للمدير)
import { useState } from 'react'
import { Paperclip, FileText, ExternalLink, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { DropZone } from '@/components/DropZone'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useOutgoingDocuments,
  useUploadOutgoingDocument,
  useDeleteOutgoingDocument,
  type OutgoingDocument,
} from '@/hooks/useOutgoingDocuments'

const fmtSize = (bytes: number | null): string => {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} م.ب`
  return `${Math.round(bytes / 1024)} ك.ب`
}

export function OutgoingDocumentsSection({ letterId }: { letterId: string }) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data, isLoading } = useOutgoingDocuments(letterId)
  const uploadM = useUploadOutgoingDocument(letterId)
  const deleteM = useDeleteOutgoingDocument(letterId)

  const [uploading, setUploading] = useState(0)
  const [preview, setPreview] = useState<OutgoingDocument | null>(null)
  const [toDelete, setToDelete] = useState<OutgoingDocument | null>(null)

  // رفع عدة ملفات معاً — كلٌّ يُرفع على حدة ليظهر تقدّم صحيح
  const onFiles = async (files: File[]) => {
    setUploading(files.length)
    for (const file of files) {
      await uploadM.mutateAsync({
        file,
        uploadedBy: teamMember?.name ?? null,
      })
      setUploading((n) => n - 1)
    }
    setUploading(0)
  }

  const docs = data ?? []

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Paperclip className="h-[18px] w-[18px] text-gold" />
          </span>
          <h3 className="text-[15px] font-semibold text-foreground">
            المرفقات
            {docs.length > 0 && (
              <span className="mr-1.5 text-sm font-normal text-muted-foreground">
                ({fmtNumber(docs.length)})
              </span>
            )}
          </h3>
        </div>

        <DropZone
          onFiles={onFiles}
          uploadingCount={uploading}
          hint="اسحب الملفات هنا أو اضغط للاختيار — يمكن اختيار عدة ملفات معاً (حتى 10 م.ب للملف)"
        />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            لا مرفقات — ملف الخطاب نفسه في الأعلى.
          </p>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-gold" />
                <button
                  className="min-w-0 flex-1 text-right"
                  onClick={() => setPreview(d)}
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {d.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      fmtSize(d.file_size),
                      d.uploaded_by,
                      d.created_at ? fmtDateTime(d.created_at) : null,
                    ]
                      .filter(Boolean)
                      .join(' — ')}
                  </p>
                </button>
                {d.file_url && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="فتح/تنزيل"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {isDirector && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="حذف"
                    onClick={() => setToDelete(d)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.name ?? null}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المرفق</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{toDelete?.name}» من قائمة المرفقات — ويمكن استرجاعه لاحقاً.
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
    </Card>
  )
}
