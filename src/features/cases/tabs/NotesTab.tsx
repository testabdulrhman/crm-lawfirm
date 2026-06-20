import { useState } from 'react'
import { Loader2, Trash2, Send, MessageSquare } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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

import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useCaseNotes, useAddNote, useDeleteNote } from '@/hooks/useCaseNotes'
import type { Note } from '@/types/db'

export function NotesTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseNotes(caseId)
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const addM = useAddNote(caseId)
  const deleteM = useDeleteNote(caseId)

  const [content, setContent] = useState('')
  const [toDelete, setToDelete] = useState<Note | null>(null)

  const submit = () => {
    if (content.trim() === '') return
    addM.mutate(
      { content: content.trim(), authorId: teamMember?.id ?? null },
      { onSuccess: () => setContent('') }
    )
  }

  return (
    <div className="space-y-4">
      {/* حقل الكتابة */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="أضف ملاحظة…"
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              variant="gold"
              size="sm"
              onClick={submit}
              disabled={addM.isPending || content.trim() === ''}
            >
              {addM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              إضافة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* الخيط */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((n) => {
            const canDelete =
              isDirector || (!!n.author_id && n.author_id === teamMember?.id)
            const name = n.author?.name ?? 'مستخدم'
            const initial = n.author?.short_name?.charAt(0) || name.charAt(0) || '؟'
            return (
              <Card key={n.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-navy">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {name}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {fmtDateTime(n.created_at)}
                          </span>
                          {canDelete && (
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setToDelete(n)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {n.content}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الملاحظة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذه الملاحظة نهائياً. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteM.mutate(toDelete.id)
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا ملاحظات بعد</p>
      <p className="text-sm text-muted-foreground">أضِف أول ملاحظة من الحقل أعلاه.</p>
    </div>
  )
}
