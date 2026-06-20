import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  Send,
  FileText,
  ExternalLink,
  Scale,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
import { FilePreviewDialog } from '@/components/FilePreviewDialog'

import { fmtDatePref } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useOutgoingLetter,
  useDeleteOutgoingLetter,
} from '@/hooks/useOutgoingLetters'
import { OutgoingLetterForm } from './OutgoingLetterForm'

export function OutgoingLetterDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: l, isLoading, isError } = useOutgoingLetter(id)
  const deleteM = useDeleteOutgoingLetter()

  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !l) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/outgoing')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الخطاب</AlertTitle>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/outgoing')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للصادر
        </Button>
        {isDirector && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 shrink-0 text-gold" />
            <h2 className="text-xl font-bold text-foreground">
              {l.subject || 'خطاب صادر'}
            </h2>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2">
            <Row label="رقم الخطاب" value={l.letter_number} dir="ltr" />
            <Row label="التاريخ" value={l.letter_date ? fmtDatePref(l.letter_date) : null} />
            <Row label="الجهة المستلِمة" value={l.recipient} />
            <Row label="ملاحظات" value={l.notes} full />
          </dl>

          {/* روابط + ملف */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {l.case_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cases/${l.case_id}`}>
                  <Scale className="h-4 w-4" />
                  {l.case?.title || 'القضية المرتبطة'}
                </Link>
              </Button>
            )}
            {l.file_url && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <FileText className="h-4 w-4" />
                  معاينة الملف
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={l.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    فتح/تنزيل
                  </a>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mr-auto"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <OutgoingLetterForm letter={l} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={l.file_url}
        fileName={l.subject || 'خطاب صادر'}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الخطاب</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{l.subject || l.letter_number || ''}». يمكن استرجاعه لاحقاً
              من قِبل المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: l.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/outgoing') }
                )
              }
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Row({
  label,
  value,
  dir,
  full,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
  full?: boolean
}) {
  if (!value || value.trim() === '') return null
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        dir={dir}
        className={
          'mt-0.5 whitespace-pre-wrap text-sm text-foreground ' +
          (dir === 'ltr' ? 'text-right' : '')
        }
      >
        {value}
      </dd>
    </div>
  )
}
