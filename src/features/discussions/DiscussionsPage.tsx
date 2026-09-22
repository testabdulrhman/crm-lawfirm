import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  BookmarkX,
  Check,
  CheckCheck,
  FolderOpen,
  Landmark,
  Loader2,
  Megaphone,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
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
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/stores/auth'
import { useTeamMembers } from '@/hooks/useTeam'
import { pickFile } from '@/lib/files'
import { arNorm } from '@/lib/arabic'
import { matterHref, matterKindEmoji } from '@/lib/matterHref'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { stamp, msgStamp, fullStamp } from './stamps'
import { VoiceNotePlayer, VoiceTranscript, isAudioName } from './VoiceNote'
import { DiscussionMediaDialog } from './DiscussionMediaDialog'
import { URL_RE, cleanUrl, hrefOf } from './links'
import { openExternal } from '@/lib/external'
import { errMessage } from '@/lib/errors'
import {
  findMessageAt,
  newMessageId,
  useBookmarks,
  useChannelMembers,
  useDeleteMessage,
  useDiscussions,
  useEditMessage,
  useMarkRead,
  usePostAttachment,
  usePostMessage,
  useStream,
  useThread,
  useToggleBookmark,
  useToggleChannelMember,
  useStreamReadCounts,
  useReadReceipts,
  type ReadCount,
  type ReadPerson,
  useCreateChannel,
  useRenameChannel,
  useToggleReaction,
  type DiscussionRow,
  type Reaction,
  type StreamMsg,
  type ThreadMsg,
} from '@/hooks/useDiscussions'
import { useIsDirector } from '@/hooks/useIsDirector'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  DISCUSSION_JUMP_EVENT,
  takeDiscussionJump,
  type DiscussionJump,
} from '@/lib/discussionJump'

// «النقاشات» في الويب — نفس بنية التطبيق (مجرى بخيوط + ذكاء + قناة عامة)
// بأسلوب سلاك المكتبي: ثلاث لوحات — القنوات، المجرى، والخيط المفتوح.
// تخدم الأنواع الثلاثة (قضية/استشارة/توثيق) بحكم توحيد «الملفات».

const QUICK_EMOJIS = ['👍', '❤️', '✅', '😂', '😮', '🙏']

/** طابع مختصر بأسلوب الواتساب */
/* ===================== منشن الموظفين ===================== */

interface Mentionable {
  id: string
  label: string
  initial: string | null
  color: string | null
}

/**
 * موظفو المكتب النشطون بالاسم المختصر — قائمة المنشن.
 *
 * المتعاون الخارجي يُستبعد من **القناة العامة** (لا يصلها أصلاً فمنشنه فيها
 * وعدٌ كاذب)، ويبقى قابلاً للمنشن داخل نقاش ملفٍ هو من فريقه.
 */
function useMentionables(inCaseThread = false): Mentionable[] {
  const { data } = useTeamMembers()
  return useMemo(
    () =>
      (data ?? [])
        .filter((m) => m.is_active !== false)
        .filter((m) => inCaseThread || m.member_type !== 'collaborator')
        .map((m) => ({
          id: m.id,
          label: (m.short_name ?? m.name).trim(),
          initial: m.avatar_initial,
          color: m.avatar_color,
        }))
        .filter((m) => m.label.length > 0),
    [data]
  )
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')



/**
 * من ذُكر فعلاً في النص عند الإرسال — فحص النص النهائي لا لقطات الاختيار،
 * فيصح المنشن حتى لو كُتب الاسم يدوياً دون قائمة الاقتراح.
 * ⚠️ \b لا يعمل مع العربية — نستخدم lookahead يونيكود (درس منشن الذكاء).
 */
function extractMentions(body: string, people: Mentionable[]): string[] {
  if (!body.includes('@')) return []
  return people
    .filter((p) => new RegExp('@' + escRe(p.label) + '(?![\\p{L}\\p{N}_])', 'u').test(body))
    .map((p) => p.id)
}

/** نص رسالة مع تلوين @الأسماء (الموظفون + الذكاء) */
function Body({ text, className }: { text: string; className?: string }) {
  const people = useMentionables()
  const re = useMemo(() => {
    const labels = [...people.map((p) => p.label), 'الذكاء', 'ذكاء', 'المساعد']
      .sort((a, b) => b.length - a.length)
      .map(escRe)
    return new RegExp('@\\s?(?:' + labels.join('|') + ')(?![\\p{L}\\p{N}_])', 'gu')
  }, [people])

  // الروابط أولاً (قابلة للضغط — كانت نصاً عادياً)، ثم المنشن فيما بينها
  const parts = useMemo(() => {
    const out: { t: string; kind: 'text' | 'mention' | 'link' }[] = []
    const withMentions = (s: string) => {
      let last = 0
      for (const m of s.matchAll(re)) {
        const i = m.index ?? 0
        if (i > last) out.push({ t: s.slice(last, i), kind: 'text' })
        out.push({ t: m[0], kind: 'mention' })
        last = i + m[0].length
      }
      if (last < s.length) out.push({ t: s.slice(last), kind: 'text' })
    }
    let last = 0
    for (const m of text.matchAll(URL_RE)) {
      const i = m.index ?? 0
      const url = cleanUrl(m[0])
      if (url.length <= 4) continue
      if (i > last) withMentions(text.slice(last, i))
      out.push({ t: url, kind: 'link' })
      last = i + url.length
    }
    if (last < text.length) withMentions(text.slice(last))
    return out
  }, [text, re])

  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.kind === 'mention' ? (
          <span key={i} className="rounded bg-gold/15 px-0.5 font-medium text-gold-700 dark:text-gold-300">
            {p.t}
          </span>
        ) : p.kind === 'link' ? (
          <a
            key={i}
            href={hrefOf(p.t)}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openExternal(hrefOf(p.t))
            }}
            className="text-blue-600 underline decoration-blue-600/30 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-blue-600 dark:text-blue-400"
          >
            {p.t}
          </a>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </p>
  )
}

/**
 * Textarea بقائمة اقتراح: كتابة @ تعرض الموظفين (والذكاء) للاختيار
 * بالأسهم أو بالنقر — بأسلوب سلاك.
 */
function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  className?: string
}) {
  const people = useMentionables()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [sug, setSug] = useState<{ items: { id: string | null; label: string; initial: string | null; color: string | null }[]; start: number } | null>(null)
  const [hi, setHi] = useState(0)

  const compute = (v: string, caret: number) => {
    const m = v.slice(0, caret).match(/@([\p{L}\p{N}_]{0,20})$/u)
    if (!m) return setSug(null)
    const q = m[1]
    const pool = [
      { id: null, label: 'الذكاء', initial: null, color: null },
      ...people,
    ]
    const items = pool.filter((p) => arNorm(p.label).includes(arNorm(q))).slice(0, 7)
    if (!items.length) return setSug(null)
    setSug({ items, start: caret - q.length - 1 })
    setHi(0)
  }

  const pick = (p: { label: string }) => {
    if (!sug) return
    const caret = taRef.current?.selectionStart ?? value.length
    const next = value.slice(0, sug.start) + '@' + p.label + ' ' + value.slice(caret)
    onChange(next)
    setSug(null)
    const pos = sug.start + p.label.length + 2
    requestAnimationFrame(() => {
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative min-w-0 flex-1">
      {sug && (
        <div className="absolute bottom-full right-0 z-30 mb-1.5 w-60 overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg">
          {sug.items.map((p, i) => (
            <button
              key={p.id ?? 'ai'}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault() // لا تفقد التركيز قبل الإدراج
                pick(p)
              }}
              onMouseEnter={() => setHi(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm',
                i === hi ? 'bg-gold/15 text-foreground' : 'text-foreground'
              )}
            >
              {p.id === null ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-gold">
                  <Sparkles className="h-3 w-3" />
                </span>
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: p.color ?? '#8A8F98' }}
                >
                  {p.initial ?? p.label.charAt(0)}
                </span>
              )}
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          compute(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={(e) => {
          if (sug) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => (h + 1) % sug.items.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => (h - 1 + sug.items.length) % sug.items.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(sug.items[hi])
              return
            }
            if (e.key === 'Escape') {
              setSug(null)
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
        onBlur={() => setTimeout(() => setSug(null), 150)}
        placeholder={placeholder}
        rows={1}
        className={className}
      />
    </div>
  )
}

export function DiscussionsPage() {
  // القناة المختارة: undefined = لا اختيار بعد · null = العامة · uuid = ملف
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const [openThreadRoot, setOpenThreadRoot] = useState<StreamMsg | null>(null)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showMedia, setShowMedia] = useState(false)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const isDirector = useIsDirector()
  const qc = useQueryClient()

  // وجهة إشعار المنشن: الرسالة تُبرز في المجرى — وإن كانت رداً فجذرها يُبرز في المجرى
  // ويُفتح خيطها وتُبرز فيه. كان الإشعار يختار النقاش وحده، فإن كان مفتوحاً أصلاً لم
  // يتغير شيء وبدا الضغط كأنه لا يعمل (بلاغ المدير 2026-09-15).
  const [jump, setJump] = useState<DiscussionJump | null>(null)
  const [streamFocus, setStreamFocus] = useState<string | null>(null)
  const [threadFocus, setThreadFocus] = useState<string | null>(null)
  const [rootToOpen, setRootToOpen] = useState<string | null>(null)
  const refetchedForRoot = useRef(false)
  // وجهة أول فتح تُقرأ مرة واحدة (الوضع الصارم يعيد تشغيل المؤثرات عند التركيب)
  const initialJump = useRef<DiscussionJump | null | undefined>(undefined)

  const { data: channels, isLoading, error, refetch } = useDiscussions()
  const markRead = useMarkRead()

  /** اختيار نقاش: يغلق الخيط المفتوح ويُسقط أي وجهة معلّقة */
  const choose = (id: string | null) => {
    setSelected(id)
    setOpenThreadRoot(null)
    setJump(null)
    setStreamFocus(null)
    setThreadFocus(null)
    setRootToOpen(null)
  }

  // أول فتح: وجهة الإشعار إن وُجدت (منشن ← نقاشه ورسالته)، وإلا الأحدث نشاطاً
  useEffect(() => {
    if (selected !== undefined || !channels?.length) return
    if (initialJump.current === undefined) initialJump.current = takeDiscussionJump()
    const j = initialJump.current
    if (j && channels.some((c) => c.case_id === j.caseId)) {
      setSelected(j.caseId)
      if (j.at) setJump(j)
      return
    }
    setSelected(channels[0].case_id)
  }, [channels, selected])

  // الصفحة مفتوحة والجرس ضُغط؟ الحدث الحي ينقلنا بلا إعادة تركيب — ولو كان النقاش نفسه مفتوحاً
  useEffect(() => {
    const onJump = (e: Event) => {
      const j = takeDiscussionJump() ?? (e as CustomEvent<DiscussionJump>).detail
      if (!j) return
      choose(j.caseId)
      if (j.at) setJump(j)
    }
    window.addEventListener(DISCUSSION_JUMP_EVENT, onJump)
    return () => window.removeEventListener(DISCUSSION_JUMP_EVENT, onJump)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // وقت الإشعار ← الرسالة نفسها (ومعرّف جذرها إن كانت رداً في خيط)
  useEffect(() => {
    const at = jump?.at
    if (!jump || !at) return
    const caseId = jump.caseId
    let alive = true
    qc.fetchQuery({
      queryKey: ['disc_msg_at', caseId, at],
      queryFn: () => findMessageAt(caseId, at),
      staleTime: Infinity,
      retry: false,
    })
      .then((m) => {
        if (!alive) return
        setJump(null)
        if (!m) return // حُذفت أو لم تعد مرئية — يكفي فتح نقاشها
        if (m.parent_id) {
          refetchedForRoot.current = false
          setRootToOpen(m.parent_id)
          setThreadFocus(m.id)
          setStreamFocus(m.parent_id)
        } else {
          setStreamFocus(m.id)
        }
      })
      .catch(() => {
        if (alive) setJump(null)
      })
    return () => {
      alive = false
    }
  }, [jump, qc])

  // خيط الرد يُفتح بجذره من المجرى نفسه (مخزن مشترك مع لوحة المجرى — بلا جلب زائد)
  const rootsQuery = useStream(selected ?? null, selected !== undefined && !!rootToOpen)
  useEffect(() => {
    if (!rootToOpen || !rootsQuery.data) return
    const root = rootsQuery.data.find((m) => m.id === rootToOpen)
    if (root) {
      setOpenThreadRoot(root)
      setRootToOpen(null)
      return
    }
    if (rootsQuery.isFetching) return
    // نسخة المجرى المحفوظة أقدم من الجذر؟ جلبة واحدة، ثم يكفي المجرى
    if (!refetchedForRoot.current) {
      refetchedForRoot.current = true
      rootsQuery.refetch()
      return
    }
    setRootToOpen(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootToOpen, rootsQuery.data, rootsQuery.isFetching])

  useEffect(() => {
    if (selected === undefined) return
    markRead.mutate(selected)
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
          onSelect={choose}
          onBookmarks={() => setShowBookmarks(true)}
          onMedia={() => setShowMedia(true)}
          onNewChannel={isDirector ? () => setShowNewChannel(true) : undefined}
        />

        {selected === undefined ? (
          <div className="hidden items-center justify-center rounded-2xl border border-border/70 bg-card lg:flex">
            <EmptyState
              icon={MessagesSquare}
              title="اختر نقاشاً"
              description="كل مشروع له نقاشه — وقناة «عام — المكتب» لما سواه"
            />
          </div>
        ) : (
          <StreamPane
            key={selected ?? 'general'}
            caseId={selected}
            title={current?.case_title ?? (selected === null ? 'عام — المكتب' : 'مشروع')}
            officeNum={current?.office_num ?? null}
            openThread={setOpenThreadRoot}
            kind={current?.kind ?? null}
            focusId={streamFocus}
            onFocused={() => setStreamFocus(null)}
            caseHref={
              selected && current?.kind !== 'channel'
                ? matterHref(current?.kind ?? 'case', selected)
                : null
            }
          />
        )}

        {openThreadRoot && (
          <ThreadPane
            root={openThreadRoot}
            caseId={selected ?? null}
            onClose={() => setOpenThreadRoot(null)}
            focusId={threadFocus}
            onFocused={() => setThreadFocus(null)}
          />
        )}
      </div>

      {showMedia && (
        <DiscussionMediaDialog
          open
          onOpenChange={setShowMedia}
          caseId={selected}
          title={current?.case_title ?? (selected === null ? 'عام — المكتب' : undefined)}
        />
      )}

      <BookmarksDialog
        open={showBookmarks}
        onOpenChange={setShowBookmarks}
        onJump={(caseId) => {
          setShowBookmarks(false)
          choose(caseId)
        }}
      />

      <NewChannelDialog
        open={showNewChannel}
        onOpenChange={setShowNewChannel}
        onCreated={(id) => {
          setShowNewChannel(false)
          choose(id)
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
  onMedia,
  onNewChannel,
}: {
  channels: DiscussionRow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  selected: string | null | undefined
  onSelect: (id: string | null) => void
  onBookmarks: () => void
  /** «الملفات والروابط» في كل النقاشات */
  onMedia: () => void
  /** للمدير فقط — غيابه يخفي الزرّ */
  onNewChannel?: () => void
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = arNorm(q.trim())
    const base = needle
      ? channels.filter(
          (c) =>
            arNorm(c.case_title ?? '').includes(needle) ||
            arNorm(c.last_body ?? '').includes(needle)
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
        {onNewChannel && (
          <button
            type="button"
            title="نقاش جديد باسم وأعضاء"
            onClick={onNewChannel}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          title="الملفات والروابط في كل النقاشات"
          onClick={onMedia}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
        >
          <Paperclip className="h-4 w-4" />
        </button>
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
            const isChannel = c.kind === 'channel'
            const active = selected !== undefined && (selected ?? null) === c.case_id
            // نقاش فيه ما لم يُقرأ: يُرى دون تدقيق — شريط ذهبي وخطّ أغمق
            const unread = Number(c.unread ?? 0) > 0
            return (
              <button
                key={c.case_id ?? 'general'}
                onClick={() => onSelect(c.case_id)}
                className={cn(
                  'flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-right transition-colors',
                  active
                    ? 'bg-gold/10'
                    : unread
                      ? 'border-s-2 border-s-gold bg-gold/[0.06] hover:bg-gold/10'
                      : 'hover:bg-muted/50'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    isGeneral || isChannel
                      ? 'bg-navy text-gold'
                      : 'bg-gold/15 text-gold-600 dark:text-gold-300'
                  )}
                >
                  {isGeneral ? (
                    <Megaphone className="h-4 w-4" />
                  ) : isChannel ? (
                    <Landmark className="h-4 w-4" />
                  ) : (
                    <span className="text-base leading-none" aria-hidden>
                      {matterKindEmoji(c.kind)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-[13px] text-foreground',
                        unread ? 'font-bold' : 'font-medium'
                      )}
                    >
                      {c.case_title ?? 'مشروع'}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px]',
                        unread
                          ? 'font-semibold text-gold-600 dark:text-gold-300'
                          : 'text-muted-foreground'
                      )}
                    >
                      {stamp(c.last_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {c.has_file && (
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'truncate text-xs',
                        unread
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground'
                      )}
                    >
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

/* ===================== إرسال بلا تكرار ===================== */

interface PendingSend {
  body: string
  id?: string
}

/**
 * معرّف الرسالة يُولَّد في المتصفح ويبقى معها إن فشل إرسالها: إعادة إرسال النص نفسه تحمل
 * المعرّف نفسه، فإن كانت الأولى قد حُفظت وانقطع ردّها رفضتها القاعدة نسخةً مكررة
 * (usePostMessage تعدّ ذلك نجاحاً) — لا رسالة مكررة ولا إشعار منشن مكرر.
 */
function sendId(pending: RefObject<PendingSend | null>, body: string): string | undefined {
  const id = pending.current?.body === body ? pending.current.id : newMessageId()
  pending.current = { body, id }
  return id
}

/* ===================== إبراز رسالة (وجهة إشعار) ===================== */

/**
 * يمرّر إلى الرسالة المقصودة في وسط اللوحة ويومض إطارها ذهبياً لحظات. يُنادى onFocused
 * بمجرد عرضها كي لا يتكرر التمرير مع كل تحديث دوري للمجرى.
 */
function useFocusFlash(
  listRef: RefObject<HTMLDivElement | null>,
  focusId: string | null,
  items: { id: string }[] | undefined,
  onFocused?: () => void
): string | null {
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusId || !items?.some((m) => m.id === focusId)) return
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-msg-id="${focusId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    )
    setFlashId(focusId)
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, items])

  useEffect(() => {
    if (!flashId) return
    const t = setTimeout(() => setFlashId(null), 2600)
    return () => clearTimeout(t)
  }, [flashId])

  return flashId
}

/* ===================== لوحة المجرى ===================== */

function StreamPane({
  caseId,
  title,
  officeNum,
  openThread,
  caseHref = null,
  kind = null,
  focusId = null,
  onFocused,
}: {
  caseId: string | null
  title: string
  officeNum: string | null
  openThread: (m: StreamMsg) => void
  /** وجهة زر «فتح المشروع» — يظهر في صفحة النقاشات لا داخل المشروع نفسه */
  caseHref?: string | null
  /** نوع المشروع — 'channel' = قناة خاصة بعضوية (لها زر أعضاء بدل فتح المشروع) */
  kind?: string | null
  /** رسالة يُمرَّر إليها وتُبرز (وجهة إشعار) */
  focusId?: string | null
  onFocused?: () => void
}) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const [membersOpen, setMembersOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [, navigate] = useLocation()
  const people = useMentionables(!!caseId)   // داخل ملف: المتعاون قابل للمنشن
  const { data: msgs, isLoading, error, refetch } = useStream(caseId, true)
  // إيصالات القراءة: ما يُعرض هنا رآه صاحبه — تُعلَّم القراءة مع كل رسالة جديدة والنافذة ظاهرة
  // (لا عند اختيار النقاش وحده، وإلا بدا من يقرأ مباشرةً كأنه لم يقرأ)
  const markSeen = useMarkRead()
  const lastId = msgs?.[msgs.length - 1]?.id
  useEffect(() => {
    if (lastId && document.visibilityState === 'visible') markSeen.mutate(caseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, caseId])
  const { data: readCounts } = useStreamReadCounts(caseId, true)
  const post = usePostMessage()
  const postFile = usePostAttachment()
  const [draft, setDraft] = useState('')
  const pendingSend = useRef<PendingSend | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const flashId = useFocusFlash(listRef, focusId, msgs, onFocused)

  useEffect(() => {
    // القادم من إشعار إلى رسالة بعينها لا يُقفز به إلى الأسفل
    if (focusId) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs?.length])

  const send = () => {
    const body = draft.trim()
    if (!body) return
    const id = sendId(pendingSend, body)
    // تفريغ فوري + عرض متفائل في usePostMessage = إحساس الواتساب؛
    // الفشل يرجع النص للحقل كي لا يضيع
    setDraft('')
    post.mutate(
      { id, caseId, body, mentions: extractMentions(body, people) },
      {
        onError: () => setDraft(body),
        onSuccess: () => {
          pendingSend.current = null
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
    const caption = draft.trim()
    postFile.mutate({
      caseId,
      file,
      caption: caption || undefined,
      mentions: caption ? extractMentions(caption, people) : undefined,
    })
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            caseId === null || kind === 'channel'
              ? 'bg-navy text-gold'
              : 'bg-gold/15 text-gold-600 dark:text-gold-300'
          )}
        >
          {caseId === null ? (
            <Megaphone className="h-4 w-4" />
          ) : kind === 'channel' ? (
            <Landmark className="h-4 w-4" />
          ) : (
            <MessagesSquare className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
          {kind === 'channel' ? (
            <p className="text-xs text-muted-foreground">قناة خاصة — يراها أعضاؤها فقط</p>
          ) : (
            officeNum && <p className="text-xs text-muted-foreground">{officeNum}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          title="الملفات والروابط في هذا النقاش"
          onClick={() => setMediaOpen(true)}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">الملفات والروابط</span>
        </Button>
        {kind === 'channel' && isDirector && caseId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setMembersOpen(true)}
          >
            <Users className="h-3.5 w-3.5" />
            الأعضاء
          </Button>
        )}
        {caseHref && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => navigate(caseHref)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            فتح المشروع
          </Button>
        )}
      </div>

      {mediaOpen && (
        <DiscussionMediaDialog open onOpenChange={setMediaOpen} caseId={caseId} title={title} />
      )}

      {kind === 'channel' && caseId && (
        <ChannelMembersDialog
          channelId={caseId}
          title={title}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {error ? (
          <QueryErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))
        ) : !msgs?.length ? (
          <EmptyState
            icon={MessagesSquare}
            title={caseId === null ? 'القناة العامة هادئة' : 'لا كلام في هذا المشروع بعد'}
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
              receipt={readCounts?.[m.id]}
              flash={m.id === flashId}
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
        placeholder="اكتب رسالة… @ لمنشن زميل أو الذكاء"
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
  receipt,
  flash = false,
}: {
  msg: StreamMsg
  caseId: string | null
  mine: boolean
  onOpenThread: () => void
  /** إيصال القراءة لرسالتي */
  receipt?: ReadCount
  /** وميض الوصول إليها من إشعار */
  flash?: boolean
}) {
  const [receiptsOpen, setReceiptsOpen] = useState(false)
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
    <div className="group" data-msg-id={msg.id}>
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {isAI && <Sparkles className="h-3 w-3 text-gold" />}
        <span className={cn('font-medium', isAI && 'text-gold-600 dark:text-gold-300')}>
          {isAI ? 'الذكاء' : msg.author_name ?? '—'}
        </span>
        <span className="opacity-80" title={fullStamp(msg.created_at)}>{msgStamp(msg.created_at)}</span>
        {msg.edited_at && <span className="text-[10px] opacity-70">(معدّلة)</span>}
        {mine && msg.kind === 'user' && receipt && (
          <ReadTicks count={receipt} onClick={() => setReceiptsOpen(true)} />
        )}
        <MessageActions msg={msg} caseId={caseId} mine={mine} />
      </div>

      <div
        className={cn(
          'rounded-2xl border p-3 transition-shadow duration-700',
          flash && 'ring-2 ring-gold ring-offset-2 ring-offset-card',
          mine
            ? 'border-transparent bg-gold/15'
            : isAI
              ? 'border-gold/40 bg-gold/5'
              : 'border-border/60 bg-background/60'
        )}
      >
        {msg.body && !isAudioName(msg.document_name) && (
          <Body text={msg.body} className="whitespace-pre-wrap text-sm text-foreground" />
        )}
        {msg.document_name &&
          (isAudioName(msg.document_name) ? (
            <>
              <VoiceNotePlayer name={msg.document_name} url={msg.document_url} />
              {/* نص الملاحظة تحت مشغّلها — مطويّ كالواتساب */}
              {msg.body && <VoiceTranscript text={msg.body} />}
            </>
          ) : (
            <AttachmentChip name={msg.document_name} url={msg.document_url} />
          ))}

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
      {receiptsOpen && (
        <ReadReceiptsDialog commentId={msg.id} body={msg.body} onClose={() => setReceiptsOpen(false)} />
      )}
    </div>
  )
}

/* ===================== إيصالات القراءة =====================
 * مثل مجموعات الواتساب: ✓ لم يقرأها أحد · ✓✓ وعدد: قرأها بعضهم · ✓✓ زرقاء: قرأها كل من يُنتظر
 * أن يقرأ. «قرأها» = فتح النقاش بعد إرسالها — لمُرسلها وحده. */

function ReadTicks({ count, onClick }: { count: ReadCount; onClick: () => void }) {
  const all = count.readers > 0 && count.pending === 0
  const label = all
    ? 'قرأها الجميع'
    : count.readers === 0
      ? 'لم يقرأها أحد بعد'
      : `قرأها ${fmtNumber(count.readers)}`
  const Icon = count.readers > 0 ? CheckCheck : Check
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex items-center gap-0.5 rounded px-1 transition-colors hover:bg-muted',
        all ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count.readers > 0 && !all && <span className="text-[10px] font-medium">{fmtNumber(count.readers)}</span>}
    </button>
  )
}

function ReadReceiptsDialog({
  commentId,
  body,
  onClose,
}: {
  commentId: string
  body: string | null
  onClose: () => void
}) {
  const { data, isLoading, error } = useReadReceipts(commentId)
  const row = (p: ReadPerson, time?: string | null) => (
    <div key={p.member_id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
      <span className="text-sm text-foreground">{p.name ?? p.short_name ?? '—'}</span>
      {time && <span className="text-xs text-muted-foreground" title={fullStamp(time)}>{msgStamp(time)}</span>}
    </div>
  )
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>معلومات القراءة</DialogTitle>
        </DialogHeader>
        {body && (
          <p className="line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">{body}</p>
        )}
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">{errMessage(error)}</p>
        ) : data ? (
          <div className="max-h-80 space-y-4 overflow-y-auto">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <CheckCheck className="h-3.5 w-3.5" />
                قرأها · {fmtNumber(data.readers.length)}
              </p>
              {data.readers.length ? (
                data.readers.map((p) => row(p, p.read_at))
              ) : (
                <p className="px-2 text-xs text-muted-foreground">لم يفتح أحدٌ النقاش منذ إرسالها</p>
              )}
            </div>
            {data.not_read.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  لم يقرأها بعد · {fmtNumber(data.not_read.length)}
                </p>
                {data.not_read.map((p) => row(p))}
              </div>
            )}
            {data.readers.length > 0 && (
              <p className="text-[11px] text-muted-foreground">الوقت هو آخر فتح للنقاش.</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** أزرار تظهر عند التحويم: تفاعل · حفظ · تعديل · حذف */
/** مهلة تعديل/حذف الرسالة — القاعدة تفرضها أيضاً (enforce_edit_window) */
const EDIT_WINDOW_MS = 60 * 60 * 1000

function withinEditWindow(createdAt: string | null): boolean {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  return !isNaN(t) && Date.now() - t < EDIT_WINDOW_MS
}

function MessageActions({
  msg,
  caseId,
  mine,
}: {
  msg: {
    id: string
    body: string | null
    reactions: Reaction[] | null
    bookmarked: boolean | null
    created_at: string | null
  }
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

      {mine && withinEditWindow(msg.created_at) && (
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
  focusId = null,
  onFocused,
}: {
  root: StreamMsg
  caseId: string | null
  onClose: () => void
  /** ردّ يُمرَّر إليه ويُبرز (وجهة إشعار) */
  focusId?: string | null
  onFocused?: () => void
}) {
  const { teamMember } = useAuth()
  const people = useMentionables(!!caseId)
  const { data: replies, isLoading, refetch } = useThread(root.id)
  const post = usePostMessage()
  const [draft, setDraft] = useState('')
  const [alsoToStream, setAlsoToStream] = useState(false)
  const pendingSend = useRef<PendingSend | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const flashId = useFocusFlash(listRef, focusId, replies, onFocused)

  const send = () => {
    const body = draft.trim()
    if (!body) return
    const id = sendId(pendingSend, body)
    // تفريغ فوري + عرض متفائل — نفس نمط المجرى
    setDraft('')
    setAlsoToStream(false)
    post.mutate(
      { id, caseId, body, parentId: root.id, alsoToStream, mentions: extractMentions(body, people) },
      {
        onError: () => setDraft(body),
        onSuccess: () => {
          pendingSend.current = null
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

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* السؤال الأصل */}
        <div className="rounded-xl border-r-[3px] border-gold bg-background/60 p-3">
          <p className="mb-1 text-[11px] text-muted-foreground">
            <span className="font-medium">
              {root.kind === 'ai' ? 'الذكاء' : root.author_name ?? '—'}
            </span>{' '}
            · {msgStamp(root.created_at)}
          </p>
          <Body
            text={root.body ?? root.document_name ?? '—'}
            className="whitespace-pre-wrap text-sm font-medium text-foreground"
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : !replies?.length ? (
          <p className="py-4 text-center text-xs text-muted-foreground">لا ردود بعد</p>
        ) : (
          <div className="space-y-2 border-r border-border/50 pr-2">
            {replies.map((r) => (
              <ThreadReply
                key={r.id}
                r={r}
                caseId={caseId}
                mine={r.author_id === teamMember?.id}
                flash={r.id === flashId}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-2.5">
        <div className="flex items-end gap-2">
          <MentionInput
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            placeholder="ردّ في الخيط…"
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
  flash = false,
}: {
  r: ThreadMsg
  caseId: string | null
  mine: boolean
  /** وميض الوصول إليه من إشعار */
  flash?: boolean
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
    <div className="group" data-msg-id={r.id}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {isAI && <Sparkles className="h-3 w-3 text-gold" />}
        <span className={cn('font-medium', isAI && 'text-gold-600 dark:text-gold-300')}>
          {isAI ? 'الذكاء' : r.author_name ?? '—'}
        </span>
        <span className="opacity-80" title={fullStamp(r.created_at)}>{msgStamp(r.created_at)}</span>
        {r.edited_at && <span className="text-[10px] opacity-70">(معدّلة)</span>}
        <MessageActions msg={r} caseId={caseId} mine={mine} />
      </p>
      <div
        className={cn(
          'rounded-xl border p-2.5 transition-shadow duration-700',
          flash && 'ring-2 ring-gold ring-offset-2 ring-offset-card',
          mine
            ? 'border-transparent bg-gold/15'
            : isAI
              ? 'border-gold/40 bg-gold/5'
              : 'border-border/60 bg-background/60'
        )}
      >
        {r.body && !isAudioName(r.document_name) && (
          <Body text={r.body} className="whitespace-pre-wrap text-sm text-foreground" />
        )}
        {r.document_name &&
          (isAudioName(r.document_name) ? (
            <>
              <VoiceNotePlayer name={r.document_name} url={r.document_url} compact />
              {r.body && <VoiceTranscript text={r.body} compact />}
            </>
          ) : (
            <AttachmentChip name={r.document_name} url={r.document_url} compact />
          ))}
      </div>
      <ReactionChips msg={r} caseId={caseId} />
    </div>
  )
}

/* ===================== مرفق الرسالة ===================== */

// شريحة المرفق: تفتح المعاينة داخل النظام (PDF/صور) بدل تبويب خارجي —
// طلب المستخدم 2026-08-22: «ابي استعرض داخل التطبيق وداخل المستعرض»
function AttachmentChip({
  name,
  url,
  compact = false,
}: {
  name: string
  url: string | null
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {compact ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-1 flex items-center gap-1.5 text-right text-xs text-gold hover:underline"
        >
          <Paperclip className="h-3 w-3" />
          {name}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-right transition-colors hover:border-gold/50"
        >
          <Paperclip className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {name}
            </span>
            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
              محفوظ في المستندات — اضغط للمعاينة
            </span>
          </span>
        </button>
      )}
      <FilePreviewDialog
        open={open}
        onOpenChange={setOpen}
        fileUrl={url}
        fileName={name}
      />
    </>
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
        <MentionInput
          value={draft}
          onChange={setDraft}
          onSubmit={onSend}
          placeholder={placeholder}
          className="min-h-[42px] resize-none"
        />
        <Button variant="gold" size="icon" disabled={!draft.trim() || sending} onClick={onSend}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/* ===================== المحفوظات ===================== */

/** إدارة أعضاء قناة خاصة — للمدير: مفاتيح تشغيل لكل موظف */
function ChannelMembersDialog({
  channelId,
  title,
  open,
  onOpenChange,
}: {
  channelId: string
  title: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { data: team } = useTeamMembers()
  const { data: members, isLoading } = useChannelMembers(channelId)
  const toggle = useToggleChannelMember(channelId)
  const rename = useRenameChannel(channelId)
  const [name, setName] = useState(title)
  useEffect(() => {
    if (open) setName(title)
  }, [open, title])
  const memberIds = new Set((members ?? []).map((m) => m.member_id))

  // حسابات المراجعة والموقوفون لا يُعرضون
  const eligible = (team ?? []).filter(
    (t) => !t.is_reviewer && t.is_active !== false
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>إدارة النقاش</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="channel-rename">اسم النقاش</Label>
          <div className="flex gap-2">
            <Input
              id="channel-rename"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              disabled={!name.trim() || name.trim() === title || rename.isPending}
              onClick={() => rename.mutate(name.trim())}
            >
              {rename.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              حفظ الاسم
            </Button>
          </div>
        </div>
        <Label>الأعضاء</Label>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {eligible.map((t) => {
              const inChannel = memberIds.has(t.id)
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
                >
                  <span className="text-sm text-foreground">
                    {t.name}
                    {t.is_director && (
                      <span className="mr-1.5 text-xs text-gold">مدير</span>
                    )}
                  </span>
                  <Switch
                    checked={inChannel}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) =>
                      toggle.mutate({ memberId: t.id, add: v })
                    }
                  />
                </label>
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          العضو يرى النقاش ورسائله وملفاته ويصله إشعار عند إضافته — ومن يُزال يختفي عنه فوراً.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** نقاش جديد مُسمّى بأعضاء — للمدير (القاعدة تفرض ذلك أيضاً) */
function NewChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (id: string) => void
}) {
  const { teamMember } = useAuth()
  const { data: team } = useTeamMembers()
  const create = useCreateChannel()
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) {
      setTitle('')
      setPicked(new Set())
      setQ('')
    }
  }, [open])

  // حساب المراجعة والموقوفون لا يُضافون، والمنشئ عضو دائماً فلا يُعرض
  const eligible = (team ?? []).filter(
    (t) => !t.is_reviewer && t.is_active !== false && t.id !== teamMember?.id
  )
  const needle = arNorm(q.trim())
  const shown = needle
    ? eligible.filter(
        (t) => arNorm(t.name ?? '').includes(needle) || arNorm(t.short_name ?? '').includes(needle)
      )
    : eligible
  const trimmed = title.trim()

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = () => {
    if (!trimmed || create.isPending) return
    create.mutate({ title: trimmed, memberIds: [...picked] }, { onSuccess: (id) => onCreated(id) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>نقاش جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-title">اسم النقاش</Label>
            <Input
              id="channel-title"
              autoFocus
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="مثال: قضايا الإفلاس — متابعة أسبوعية"
            />
            <p className="text-xs text-muted-foreground">يراه أعضاؤه وأنت فقط، ولا يُربط بملف.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>الأعضاء</Label>
              {picked.size > 0 && (
                <span className="text-xs font-medium text-gold-600 dark:text-gold-300">
                  {fmtNumber(picked.size)} مختار
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث عن زميل…"
                className="h-8 pr-8 text-sm"
              />
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1">
              {shown.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {eligible.length === 0 ? 'لا زملاء لإضافتهم' : 'لا أحد بهذا الاسم'}
                </p>
              ) : (
                shown.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  >
                    <span className="text-sm text-foreground">
                      {t.name}
                      {t.is_director && <span className="mr-1.5 text-xs text-gold">مدير</span>}
                    </span>
                    <Switch checked={picked.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">يصل كلَّ من تضيفه إشعارٌ بأنك أضفته.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={!trimmed || create.isPending} onClick={submit}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء النقاش
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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

/* ===================== لوحة نقاش مضمّنة (تبويب داخل الملف) ===================== */

/**
 * نقاش ملفٍ واحد للتضمين داخل صفحته (تبويب «النقاش» في القضية) —
 * نفس المجرى والخيط، دون قائمة القنوات.
 */
export function CaseDiscussionPanel({
  caseId,
  title,
}: {
  caseId: string
  title: string
}) {
  const [threadRoot, setThreadRoot] = useState<StreamMsg | null>(null)
  const markRead = useMarkRead()

  useEffect(() => {
    markRead.mutate(caseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  return (
    <div
      className={cn(
        'grid h-[calc(100vh-14rem)] min-h-[420px] gap-3',
        threadRoot ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'
      )}
    >
      <StreamPane
        caseId={caseId}
        title={title}
        officeNum={null}
        openThread={setThreadRoot}
      />
      {threadRoot && (
        <ThreadPane root={threadRoot} caseId={caseId} onClose={() => setThreadRoot(null)} />
      )}
    </div>
  )
}
