import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark,
  BookmarkX,
  Loader2,
  Megaphone,
  MessagesSquare,
  Paperclip,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/stores/auth'
import { pickFile } from '@/lib/files'
import { fmtDatePref, fmtNumber, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useBookmarks,
  useDeleteMessage,
  useDiscussions,
  useEditMessage,
  useMarkRead,
  usePostAttachment,
  usePostMessage,
  useStream,
  useThread,
  useToggleBookmark,
  useToggleReaction,
  type DiscussionRow,
  type Reaction,
  type StreamMsg,
  type ThreadMsg,
} from '@/hooks/useDiscussions'

// «النقاشات» في الويب — نفس بنية التطبيق (مجرى بخيوط + ذكاء + قناة عامة)
// بأسلوب سلاك المكتبي: ثلاث لوحات — القنوات، المجرى، والخيط المفتوح.
// تخدم الأنواع الثلاثة (قضية/استشارة/توثيق) بحكم توحيد «الملفات».

const QUICK_EMOJIS = ['👍', '❤️', '✅', '😂', '😮', '🙏']

/** طابع مختصر بأسلوب الواتساب */
function stamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return fmtTime(d.toTimeString().slice(0, 5))
  const yest = new Date(now.getTime() - 86400000)
  if (d.toDateString() === yest.toDateString()) return 'أمس'
  return fmtDatePref(d.toISOString().slice(0, 10))
}

export function DiscussionsPage() {
  // القناة المختارة: undefined = لا اختيار بعد · null = العامة · uuid = ملف
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const [openThreadRoot, setOpenThreadRoot] = useState<StreamMsg | null>(null)
  const [showBookmarks, setShowBookmarks] = useState(false)

  const { data: channels, isLoading, error, refetch } = useDiscussions()
  const markRead = useMarkRead()

  // أول فتح: العامة إن لا رسائل، وإلا الأحدث نشاطاً
  useEffect(() => {
    if (selected !== undefined || !channels?.length) return
    setSelected(channels[0].case_id)
  }, [channels, selected])

  useEffect(() => {
    if (selected === undefined) return
    markRead.mutate(selected)
    setOpenThreadRoot(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const current = useMemo(
    () => channels?.find((c) => c.case_id === (selected ?? null)),
    [channels, selected]
  )

  return (
    <div className="mx-auto h-[calc(100vh-7.5rem)] max-w-[1400px]">
      <div
        className={cn(
          'grid h-full gap-3',
          openThreadRoot
            ? 'grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)_340px]'
            : 'grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)]'
        )}
      >
        <ChannelList
          channels={channels ?? []}
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          selected={selected}
          onSelect={setSelected}
          onBookmarks={() => setShowBookmarks(true)}
        />

        {selected === undefined ? (
          <div className="hidden items-center justify-center rounded-2xl border border-border/70 bg-card lg:flex">
            <EmptyState
              icon={MessagesSquare}
              title="اختر نقاشاً"
              description="كل ملف له نقاشه — وقناة «عام — المكتب» لما سواه"
            />
          </div>
        ) : (
          <StreamPane
            key={selected ?? 'general'}
            caseId={selected}
            title={current?.case_title ?? (selected === null ? 'عام — المكتب' : 'ملف')}
            officeNum={current?.office_num ?? null}
            openThread={setOpenThreadRoot}
          />
        )}

        {openThreadRoot && (
          <ThreadPane
            root={openThreadRoot}
            caseId={selected ?? null}
            onClose={() => setOpenThreadRoot(null)}
          />
        )}
      </div>

      <BookmarksDialog
        open={showBookmarks}
        onOpenChange={setShowBookmarks}
        onJump={(caseId) => {
          setShowBookmarks(false)
          setSelected(caseId)
        }}
      />
    </div>
  )
}

/* ===================== لوحة القنوات ===================== */

function ChannelList({
  channels,
  loading,
  error,
  onRetry,
  selected,
  onSelect,
  onBookmarks,
}: {
  channels: DiscussionRow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  selected: string | null | undefined
  onSelect: (id: string | null) => void
  onBookmarks: () => void
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = needle
      ? channels.filter(
          (c) =>
            (c.case_title ?? '').toLowerCase().includes(needle) ||
            (c.last_body ?? '').toLowerCase().includes(needle)
        )
      : channels
    // العامة مثبّتة أولاً دائماً
    return [...base].sort((a, b) =>
      a.case_id === null ? -1 : b.case_id === null ? 1 : 0
    )
  }, [channels, q])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 p-3">
        <h2 className="flex-1 text-[15px] font-bold text-foreground">النقاشات</h2>
        <button
          type="button"
          title="محفوظاتي"
          onClick={onBookmarks}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
        >
          <Bookmark className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border/60 p-2">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث…"
            className="h-8 pr-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <QueryErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          filtered.map((c) => {
            const isGeneral = c.case_id === null
            const active = selected !== undefined && (selected ?? null) === c.case_id
            return (
              <button
                key={c.case_id ?? 'general'}
                onClick={() => onSelect(c.case_id)}
                className={cn(
                  'flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-right transition-colors',
                  active ? 'bg-gold/10' : 'hover:bg-muted/50'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    isGeneral ? 'bg-navy text-gold' : 'bg-gold/15 text-gold-600 dark:text-gold-300'
                  )}
                >
                  {isGeneral ? (
                    <Megaphone className="h-4 w-4" />
                  ) : (
                    <MessagesSquare className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {c.case_title ?? 'ملف'}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {stamp(c.last_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {c.has_file && (
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {c.last_author ? `${c.last_author}: ` : ''}
                      {c.last_body ?? (c.has_file ? 'مرفق' : 'ابدأ النقاش…')}
                    </span>
                    {(c.unread ?? 0) > 0 && (
                      <span className="mr-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                        {fmtNumber(c.unread ?? 0)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ===================== لوحة المجرى ===================== */

function StreamPane({
  caseId,
  title,
  officeNum,
  openThread,
}: {
  caseId: string | null
  title: string
  officeNum: string | null
  openThread: (m: StreamMsg) => void
}) {
  const { teamMember } = useAuth()
  const { data: msgs, isLoading, error, refetch } = useStream(caseId, true)
  const post = usePostMessage()
  const postFile = usePostAttachment()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs?.length])

  const send = () => {
    const body = draft.trim()
    if (!body || post.isPending) return
    post.mutate(
      { caseId, body },
      {
        onSuccess: () => {
          setDraft('')
          // ردّ الذكاء يصل بعد ثوانٍ عبر الخادم
          setTimeout(() => refetch(), 6000)
          setTimeout(() => refetch(), 14000)
        },
      }
    )
  }

  const attach = async () => {
    const file = await pickFile({ accept: '.pdf,image/*,.docx,.xlsx' })
    if (!file) return
    postFile.mutate({ caseId, file, caption: draft.trim() || undefined })
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            caseId === null ? 'bg-navy text-gold' : 'bg-gold/15 text-gold-600 dark:text-gold-300'
          )}
        >
          {caseId === null ? <Megaphone className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
          {officeNum && <p className="text-xs text-muted-foreground">{officeNum}</p>}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {error ? (
          <QueryErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))
        ) : !msgs?.length ? (
          <EmptyState
            icon={MessagesSquare}
            title={caseId === null ? 'القناة العامة هادئة' : 'لا كلام في هذا الملف بعد'}
            description="اكتب أول رسالة — تبقى هنا مربوطة بمكانها إلى الأبد"
          />
        ) : (
          msgs.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              caseId={caseId}
              mine={m.author_id === teamMember?.id}
              onOpenThread={() => openThread(m)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <Composer
        draft={draft}
        setDraft={setDraft}
        onSend={send}
        onAttach={attach}
        sending={post.isPending}
        uploading={postFile.isPending}
        placeholder="اكتب رسالة… (@الذكاء للسؤال)"
      />
    </div>
  )
}

/* ===================== فقاعة رسالة ===================== */

function MessageBubble({
  msg,
  caseId,
  mine,
  onOpenThread,
}: {
  msg: StreamMsg
  caseId: string | null
  mine: boolean
  onOpenThread: () => void
}) {
  const isAI = msg.kind === 'ai'
  const isSystem = msg.kind === 'system'

  if (isSystem) {
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-full bg-navy/5 px-4 py-1.5 text-center text-[11px] text-muted-foreground dark:bg-navy-100/10">
        {msg.body}
      </p>
    )
  }

  return (
    <div className="group">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {isAI && <Sparkles className="h-3 w-3 text-gold" />}
        <span className={cn('font-medium', isAI && 'text-gold-600 dark:text-gold-300')}>
          {isAI ? 'الذكاء' : msg.author_name ?? '—'}
        </span>
        <span className="opacity-80">{stamp(msg.created_at)}</span>
        {msg.edited_at && <span className="text-[10px] opacity-70">(معدّلة)</span>}
        <MessageActions msg={msg} caseId={caseId} mine={mine} />
      </div>

      <div
        className={cn(
          'rounded-2xl border p-3',
          mine
            ? 'border-transparent bg-gold/15'
            : isAI
              ? 'border-gold/40 bg-gold/5'
              : 'border-border/60 bg-background/60'
        )}
      >
        {msg.body && (
          <p className="whitespace-pre-wrap text-sm text-foreground">{msg.body}</p>
        )}
        {msg.document_name && (
          <a
            href={msg.document_url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 transition-colors hover:border-gold/50"
          >
            <Paperclip className="h-4 w-4 shrink-0 text-gold" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {msg.document_name}
              </span>
              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
                محفوظ في المستندات — اضغط للفتح
              </span>
            </span>
          </a>
        )}

        <button
          onClick={onOpenThread}
          className="mt-2 flex w-full items-center gap-1.5 border-t border-border/40 pt-2 text-right text-xs transition-colors hover:text-gold"
        >
          {(msg.reply_count ?? 0) > 0 ? (
            <>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {msg.reply_count === 1
                  ? 'ردّ واحد'
                  : msg.reply_count === 2
                    ? 'ردّان'
                    : `${fmtNumber(msg.reply_count ?? 0)} ردود`}
              </span>
              {msg.last_reply_at && (
                <span className="text-muted-foreground">آخرها {stamp(msg.last_reply_at)}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">ردّ في خيط</span>
          )}
        </button>
      </div>

      <ReactionChips msg={msg} caseId={caseId} />
    </div>
  )
}

/** أزرار تظهر عند التحويم: تفاعل · حفظ · تعديل · حذف */
function MessageActions({
  msg,
  caseId,
  mine,
}: {
  msg: { id: string; body: string | null; reactions: Reaction[] | null; bookmarked: boolean | null }
  caseId: string | null
  mine: boolean
}) {
  const react = useToggleReaction()
  const bookmark = useToggleBookmark()
  const del = useDeleteMessage()
  const edit = useEditMessage()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState('')

  return (
    <span className="mr-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="تفاعل"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-gold"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-0 p-1.5" side="top">
          <div className="flex gap-1">
            {QUICK_EMOJIS.map((e) => {
              const isMine = msg.reactions?.find((r) => r.e === e)?.me ?? false
              return (
                <button
                  key={e}
                  onClick={() =>
                    react.mutate({ commentId: msg.id, emoji: e, mine: isMine, caseId })
                  }
                  className={cn(
                    'rounded-lg px-1.5 py-1 text-base transition-colors hover:bg-muted',
                    isMine && 'bg-gold/20'
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        title={msg.bookmarked ? 'إزالة من المحفوظات' : 'حفظ للرجوع إليها'}
        onClick={() =>
          bookmark.mutate({ commentId: msg.id, on: msg.bookmarked ?? false, caseId })
        }
        className={cn(
          'rounded p-1 hover:bg-muted',
          msg.bookmarked ? 'text-gold' : 'text-muted-foreground hover:text-gold'
        )}
      >
        {msg.bookmarked ? <BookmarkX className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      </button>

      {mine && (
        <>
          <button
            type="button"
            title="تعديل"
            onClick={() => {
              setEditBody(msg.body ?? '')
              setEditing(true)
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="حذف"
            onClick={() =>
              confirm({
                title: 'حذف الرسالة؟',
                description: 'تُحذف من النقاش لدى الجميع.',
                confirmLabel: 'حذف',
                destructive: true,
                onConfirm: () => del.mutate({ id: msg.id, caseId }),
              })
            }
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {dialog}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الرسالة</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!editBody.trim() || edit.isPending}
              onClick={() =>
                edit.mutate(
                  { id: msg.id, body: editBody.trim(), caseId },
                  { onSuccess: () => setEditing(false) }
                )
              }
            >
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  )
}

function ReactionChips({
  msg,
  caseId,
}: {
  msg: { id: string; reactions: Reaction[] | null }
  caseId: string | null
}) {
  const react = useToggleReaction()
  if (!msg.reactions?.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {msg.reactions.map((r) => (
        <button
          key={r.e}
          onClick={() => react.mutate({ commentId: msg.id, emoji: r.e, mine: r.me, caseId })}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
            r.me
              ? 'border-gold/50 bg-gold/15 text-gold-700 dark:text-gold-300'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:border-gold/40'
          )}
        >
          <span>{r.e}</span>
          <span className="font-medium">{fmtNumber(r.n)}</span>
        </button>
      ))}
    </div>
  )
}

/* ===================== لوحة الخيط ===================== */

function ThreadPane({
  root,
  caseId,
  onClose,
}: {
  root: StreamMsg
  caseId: string | null
  onClose: () => void
}) {
  const { teamMember } = useAuth()
  const { data: replies, isLoading, refetch } = useThread(root.id)
  const post = usePostMessage()
  const [draft, setDraft] = useState('')
  const [alsoToStream, setAlsoToStream] = useState(false)

  const send = () => {
    const body = draft.trim()
    if (!body || post.isPending) return
    post.mutate(
      { caseId, body, parentId: root.id, alsoToStream },
      {
        onSuccess: () => {
          setDraft('')
          setAlsoToStream(false)
          setTimeout(() => refetch(), 6000)
        },
      }
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <p className="flex-1 text-[15px] font-semibold text-foreground">خيط</p>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* السؤال الأصل */}
        <div className="rounded-xl border-r-[3px] border-gold bg-background/60 p-3">
          <p className="mb-1 text-[11px] text-muted-foreground">
            <span className="font-medium">
              {root.kind === 'ai' ? 'الذكاء' : root.author_name ?? '—'}
            </span>{' '}
            · {stamp(root.created_at)}
          </p>
          <p className="whitespace-pre-wrap text-sm font-medium text-foreground">
            {root.body ?? root.document_name ?? '—'}
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : !replies?.length ? (
          <p className="py-4 text-center text-xs text-muted-foreground">لا ردود بعد</p>
        ) : (
          <div className="space-y-2 border-r border-border/50 pr-2">
            {replies.map((r) => (
              <ThreadReply key={r.id} r={r} caseId={caseId} mine={r.author_id === teamMember?.id} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="ردّ في الخيط…"
            rows={1}
            className="min-h-[38px] resize-none text-sm"
          />
          <Button size="icon" variant="gold" disabled={!draft.trim() || post.isPending} onClick={send}>
            {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoToStream}
            onChange={(e) => setAlsoToStream(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#C9A84C]"
          />
          أرسل أيضاً إلى المجرى
        </label>
      </div>
    </div>
  )
}

function ThreadReply({
  r,
  caseId,
  mine,
}: {
  r: ThreadMsg
  caseId: string | null
  mine: boolean
}) {
  const isAI = r.kind === 'ai'
  if (r.kind === 'system') {
    return (
      <p className="mx-auto w-fit rounded-full bg-navy/5 px-3 py-1 text-center text-[10px] text-muted-foreground dark:bg-navy-100/10">
        {r.body}
      </p>
    )
  }
  return (
    <div className="group">
      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {isAI && <Sparkles className="h-3 w-3 text-gold" />}
        <span className={cn('font-medium', isAI && 'text-gold-600 dark:text-gold-300')}>
          {isAI ? 'الذكاء' : r.author_name ?? '—'}
        </span>
        <span className="opacity-80">{stamp(r.created_at)}</span>
        {r.edited_at && <span className="text-[10px] opacity-70">(معدّلة)</span>}
        <MessageActions msg={r} caseId={caseId} mine={mine} />
      </p>
      <div
        className={cn(
          'rounded-xl border p-2.5',
          mine
            ? 'border-transparent bg-gold/15'
            : isAI
              ? 'border-gold/40 bg-gold/5'
              : 'border-border/60 bg-background/60'
        )}
      >
        {r.body && <p className="whitespace-pre-wrap text-sm text-foreground">{r.body}</p>}
        {r.document_name && (
          <a
            href={r.document_url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <Paperclip className="h-3 w-3" />
            {r.document_name}
          </a>
        )}
      </div>
      <ReactionChips msg={r} caseId={caseId} />
    </div>
  )
}

/* ===================== حقل الإرسال ===================== */

function Composer({
  draft,
  setDraft,
  onSend,
  onAttach,
  sending,
  uploading,
  placeholder,
}: {
  draft: string
  setDraft: (v: string) => void
  onSend: () => void
  onAttach: () => void
  sending: boolean
  uploading: boolean
  placeholder: string
}) {
  return (
    <div className="border-t border-border/60 p-3">
      {uploading && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          جارٍ رفع المرفق…
        </p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          title="منشن الذكاء"
          onClick={() => {
            if (!draft.includes('@الذكاء')) setDraft('@الذكاء ' + draft)
          }}
          className={cn(
            'rounded-lg p-2 transition-colors hover:bg-muted',
            draft.includes('@الذكاء') ? 'text-gold' : 'text-muted-foreground'
          )}
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          title="إرفاق ملف — يُحفظ في مستندات الملف"
          onClick={onAttach}
          disabled={uploading}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Paperclip className="h-[18px] w-[18px]" />
        </button>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="min-h-[42px] flex-1 resize-none"
        />
        <Button variant="gold" size="icon" disabled={!draft.trim() || sending} onClick={onSend}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/* ===================== المحفوظات ===================== */

function BookmarksDialog({
  open,
  onOpenChange,
  onJump,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onJump: (caseId: string | null) => void
}) {
  const { data, isLoading } = useBookmarks(open)
  const bookmark = useToggleBookmark()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-gold" />
            محفوظاتي
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto py-1">
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : !data?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا محفوظات — مرّر على أي رسالة واضغط 🔖 للرجوع إليها لاحقاً
            </p>
          ) : (
            data.map((b) => (
              <div
                key={b.comment_id}
                className="group/bm flex items-start gap-2 rounded-xl border border-border/60 p-3"
              >
                <button className="min-w-0 flex-1 text-right" onClick={() => onJump(b.case_id)}>
                  <p className="text-[11px] font-medium text-gold-600 dark:text-gold-300">
                    {b.case_title ?? '—'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{b.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {b.kind === 'ai' ? 'الذكاء' : b.author_name ?? '—'} · {stamp(b.created_at)}
                  </p>
                </button>
                <button
                  title="إزالة"
                  onClick={() =>
                    bookmark.mutate({ commentId: b.comment_id, on: true, caseId: b.case_id })
                  }
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/bm:opacity-100"
                >
                  <BookmarkX className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
