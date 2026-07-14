import { useMemo, useRef, useState } from 'react'
import { Loader2, Trash2, Send, MessageSquare, AtSign } from 'lucide-react'

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
import { useTeamMembers } from '@/hooks/useTeam'
import { useCaseNotes, useAddNote, useDeleteNote } from '@/hooks/useCaseNotes'
import type { Note, TeamMember } from '@/types/db'

export function NotesTab({
  caseId,
  caseTitle,
}: {
  caseId: string
  caseTitle?: string | null
}) {
  const { data, isLoading } = useCaseNotes(caseId)
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: members } = useTeamMembers()
  const addM = useAddNote(caseId)
  const deleteM = useDeleteNote(caseId)

  const [content, setContent] = useState('')
  const [toDelete, setToDelete] = useState<Note | null>(null)

  // المنشن: قائمة تظهر عند كتابة @ + تتبّع المذكورين
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set())

  const activeMembers = useMemo(
    () => (members ?? []).filter((m) => m.is_active),
    [members]
  )

  // أسماء الأعضاء لتلوين المنشن في الرسائل (الأطول أولاً كي لا يبتلع القصيرُ الطويلَ)
  const memberNames = useMemo(
    () =>
      activeMembers
        .flatMap((m) => [m.name, m.short_name].filter(Boolean) as string[])
        .sort((a, b) => b.length - a.length),
    [activeMembers]
  )

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.trim()
    return activeMembers
      .filter(
        (m) =>
          q === '' ||
          m.name.includes(q) ||
          (m.short_name ?? '').includes(q)
      )
      .slice(0, 6)
  }, [mentionQuery, activeMembers])

  // كشف @ قبل المؤشر لإظهار القائمة
  const handleChange = (v: string) => {
    setContent(v)
    const caret = taRef.current?.selectionStart ?? v.length
    const before = v.slice(0, caret)
    const m = before.match(/@([^\s@]*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  // اختيار عضو من القائمة: استبدال «@جزء» بـ «@الاسم الكامل »
  const pickMention = (m: TeamMember) => {
    const ta = taRef.current
    const caret = ta?.selectionStart ?? content.length
    const before = content
      .slice(0, caret)
      .replace(/@([^\s@]*)$/, `@${m.name} `)
    const after = content.slice(caret)
    setContent(before + after)
    setMentionQuery(null)
    setMentionedIds((prev) => new Set(prev).add(m.id))
    requestAnimationFrame(() => {
      ta?.focus()
      const pos = before.length
      ta?.setSelectionRange(pos, pos)
    })
  }

  const submit = () => {
    const text = content.trim()
    if (text === '') return
    // المذكورون = من اختيروا من القائمة وما زال ذكرهم موجوداً في النص
    const mentions = activeMembers
      .filter((m) => mentionedIds.has(m.id) && text.includes(`@${m.name}`))
      .filter((m) => m.id !== teamMember?.id) // لا تُشعر نفسك
      .map((m) => ({ id: m.id, name: m.name, phone: m.phone }))
    addM.mutate(
      {
        content: text,
        authorId: teamMember?.id ?? null,
        authorName: teamMember?.name ?? null,
        caseTitle,
        mentions,
      },
      {
        onSuccess: () => {
          setContent('')
          setMentionedIds(new Set())
          setMentionQuery(null)
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      {/* حقل الكتابة */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="relative">
            <Textarea
              ref={taRef}
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              onClick={(e) =>
                handleChange((e.target as HTMLTextAreaElement).value)
              }
              placeholder="أضف ملاحظة… اكتب @ لذكر محامٍ"
              rows={2}
            />
            {/* قائمة المنشن */}
            {mentionQuery != null && suggestions.length > 0 && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border bg-card shadow-lg">
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent/10"
                    onClick={() => pickMention(m)}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-700 dark:text-gold-300">
                      {m.avatar_initial || m.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {m.name}
                    </span>
                    <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              المذكور بـ @ يصله تنبيه SMS برابط القضية.
            </p>
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
                        <NoteContent text={n.content ?? ''} names={memberNames} />
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

// يلوّن ذكر @اسم لأي عضو معروف داخل نص الملاحظة
function NoteContent({ text, names }: { text: string; names: string[] }) {
  if (names.length === 0 || !text.includes('@')) return <>{text}</>
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`@(?:${escaped.join('|')})`, 'g')
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <span
        key={key++}
        className="rounded bg-gold/15 px-1 font-medium text-gold-700 dark:text-gold-300"
      >
        {match[0]}
      </span>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
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
