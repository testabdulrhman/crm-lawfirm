// «الملفات والروابط» — كل ما أُرفق في النقاش وكل رابط ورد في رسائله، في مكان واحد
// (طلب المدير 2026-09-16: «ودي اشوف وش الملفات المرفوعة في النقاشات أو الروابط الموجودة»).
// تشمل ردود الخيوط لا المجرى وحده؛ الملف يُعاين داخل النظام، والرابط يُفتح، وكلاهما ينقل إلى رسالته.
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Link2,
  MessageSquareText,
  Mic,
  Paperclip,
  Search,
  type LucideIcon,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useTeamMembers } from '@/hooks/useTeam'
import { useDiscussionMedia, useDiscussions, type MediaMsg } from '@/hooks/useDiscussions'
import { requestDiscussionJump } from '@/lib/discussionJump'
import { openExternal } from '@/lib/external'
import { arNorm } from '@/lib/arabic'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { stamp, fullStamp } from './stamps'
import { VoiceNotePlayer, isAudioName } from './VoiceNote'
import { URL_RE, extractLinks, hostOf, hrefOf } from './links'

type Scope = 'here' | 'all'
type Tab = 'files' | 'links'
type Kind = 'image' | 'audio' | 'pdf' | 'sheet' | 'doc' | 'other'

interface FileItem {
  key: string
  msg: MediaMsg
  name: string
  url: string
  type: string | null
  size: number | null
}

interface LinkItem {
  key: string
  msg: MediaMsg
  url: string
}

const KIND_ICON: Record<Kind, LucideIcon> = {
  image: FileImage,
  audio: Mic,
  pdf: FileText,
  sheet: FileSpreadsheet,
  doc: FileText,
  other: File,
}

const KIND_TONE: Record<Kind, string> = {
  image: 'bg-gold/15 text-gold-700 dark:text-gold',
  audio: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  pdf: 'bg-red-500/10 text-red-600 dark:text-red-400',
  sheet: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  doc: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  other: 'bg-muted text-muted-foreground',
}

function fileKind(name: string, type: string | null): Kind {
  const n = name.toLowerCase()
  if (isAudioName(name) || type?.startsWith('audio/')) return 'audio'
  if (type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/.test(n)) return 'image'
  if (type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (/\.(xlsx?|csv|numbers)$/.test(n)) return 'sheet'
  if (/\.(docx?|rtf|txt|pages)$/.test(n)) return 'doc'
  return 'other'
}

function sizeLabel(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024 * 1024) return `${fmtNumber(Math.max(1, Math.round(bytes / 1024)))} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}

export function DiscussionMediaDialog({
  open,
  onOpenChange,
  caseId,
  title,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** النقاش المفتوح — null = «عام — المكتب»، وundefined = لا نقاش مختار (كل النقاشات وحدها) */
  caseId: string | null | undefined
  title?: string
}) {
  const hasHere = caseId !== undefined
  // تُفتح دائماً على النقاش المعروض، والمبدّل يوسّعها لكل النقاشات
  // (طلب المدير 2026-09-20: «ودي يطلع مرفقات النقاش اللي ظاهر أمامنا»)
  const [scope, setScope] = useState<Scope>(hasHere ? 'here' : 'all')
  const [tab, setTab] = useState<Tab>('files')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [, navigate] = useLocation()

  const all = scope === 'all' || !hasHere
  const { data, isLoading, error, refetch } = useDiscussionMedia(caseId ?? null, all, open)
  const { data: team } = useTeamMembers()
  const { data: channels } = useDiscussions()

  const authorOf = useMemo(() => {
    const names = new Map<string, string>()
    for (const m of team ?? []) names.set(m.id, (m.short_name ?? m.name ?? '').trim())
    return (msg: MediaMsg) =>
      msg.kind === 'ai' ? 'الذكاء' : (msg.author_id && names.get(msg.author_id)) || '—'
  }, [team])

  const titleOf = useMemo(() => {
    const titles = new Map<string, string>()
    for (const c of channels ?? []) titles.set(c.case_id ?? '', c.case_title ?? 'نقاش')
    return (id: string | null) => titles.get(id ?? '') ?? (id ? 'نقاش' : 'عام — المكتب')
  }, [channels])

  // المرفق نفسه قد يظهر في رسالتين (ردّ أُرسل أيضاً إلى المجرى) — يُعرض مرة
  const files = useMemo<FileItem[]>(() => {
    const seen = new Set<string>()
    const out: FileItem[] = []
    for (const msg of data ?? []) {
      const d = msg.document
      if (!d?.file_url || seen.has(d.id)) continue
      seen.add(d.id)
      out.push({ key: d.id, msg, name: d.name || 'ملف', url: d.file_url, type: d.file_type, size: d.file_size })
    }
    return out
  }, [data])

  const links = useMemo<LinkItem[]>(() => {
    const out: LinkItem[] = []
    for (const msg of data ?? []) {
      for (const url of extractLinks(msg.body)) out.push({ key: `${msg.id}|${url}`, msg, url })
    }
    return out
  }, [data])

  const needle = arNorm(q.trim())
  const matches = (...parts: (string | null | undefined)[]) =>
    !needle || parts.some((p) => !!p && arNorm(p).includes(needle))
  const where = (msg: MediaMsg) => (all ? titleOf(msg.case_id) : null)
  const shownFiles = files.filter((f) => matches(f.name, f.msg.body, authorOf(f.msg), where(f.msg)))
  const shownLinks = links.filter((l) => matches(l.url, l.msg.body, authorOf(l.msg), where(l.msg)))

  // إلى الرسالة نفسها: النقاش، وخيطها إن كانت رداً، مع إبرازها (جسر النقاشات)
  const jump = (msg: MediaMsg) => {
    requestDiscussionJump({ caseId: msg.case_id, at: msg.created_at })
    onOpenChange(false)
    navigate('/discussions')
  }

  const emptyText =
    tab === 'files'
      ? needle
        ? 'لا ملف يطابق البحث'
        : all
          ? 'لم يُرفع ملف في نقاشاتك بعد'
          : 'لم يُرفع ملف في هذا النقاش بعد'
      : needle
        ? 'لا رابط يطابق البحث'
        : all
          ? 'لا روابط في نقاشاتك بعد'
          : 'لا روابط في هذا النقاش بعد'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-gold" />
              الملفات والروابط
            </DialogTitle>
            <DialogDescription>
              {all
                ? 'من كل النقاشات التي تشارك فيها، مع ردود الخيوط'
                : `في «${title ?? 'هذا النقاش'}»، مع ردود الخيوط`}
            </DialogDescription>
          </DialogHeader>

          {hasHere && (
            <div className="flex w-full rounded-lg bg-muted p-0.5 text-sm">
              {(
                [
                  ['here', 'هذا النقاش'],
                  ['all', 'كل النقاشات'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  className={cn(
                    'flex-1 rounded-md py-1.5 transition-colors',
                    scope === k
                      ? 'bg-card font-semibold text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'files' ? 'ابحث باسم الملف أو المرسل…' : 'ابحث في الروابط أو المرسل…'}
              className="h-9 pr-8 text-sm"
            />
          </div>

          <div className="flex gap-1 border-b border-border/60">
            <TabBtn
              active={tab === 'files'}
              onClick={() => setTab('files')}
              icon={Paperclip}
              label="الملفات"
              count={isLoading ? null : files.length}
            />
            <TabBtn
              active={tab === 'links'}
              onClick={() => setTab('links')}
              icon={Link2}
              label="الروابط"
              count={isLoading ? null : links.length}
            />
          </div>

          <div className="-mx-1 max-h-[55vh] min-h-[240px] space-y-2 overflow-y-auto px-1 py-1">
            {error ? (
              <QueryErrorState error={error} onRetry={() => refetch()} />
            ) : isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))
            ) : (tab === 'files' ? shownFiles.length : shownLinks.length) === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                {tab === 'files' ? (
                  <Paperclip className="h-6 w-6 text-muted-foreground/50" />
                ) : (
                  <Link2 className="h-6 w-6 text-muted-foreground/50" />
                )}
                <p className="text-sm text-muted-foreground">{emptyText}</p>
              </div>
            ) : tab === 'files' ? (
              shownFiles.map((f) => (
                <FileRow
                  key={f.key}
                  f={f}
                  meta={[authorOf(f.msg), stamp(f.msg.created_at), sizeLabel(f.size), where(f.msg)]}
                  onPreview={() => setPreview({ url: f.url, name: f.name })}
                  onJump={() => jump(f.msg)}
                />
              ))
            ) : (
              shownLinks.map((l) => (
                <LinkRow
                  key={l.key}
                  l={l}
                  meta={[authorOf(l.msg), stamp(l.msg.created_at), where(l.msg)]}
                  onJump={() => jump(l.msg)}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v) setPreview(null)
        }}
        fileUrl={preview?.url ?? null}
        fileName={preview?.name ?? ''}
      />
    </>
  )
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
  count: number | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
        active
          ? 'border-gold font-semibold text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count != null && (
        <span className="rounded-md bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
          {fmtNumber(count)}
        </span>
      )}
    </button>
  )
}

function JumpBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="عرض الرسالة في النقاش"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
    >
      <MessageSquareText className="h-4 w-4" />
      <span className="hidden sm:inline">في النقاش</span>
    </button>
  )
}

function Meta({ parts, title }: { parts: (string | null | undefined)[]; title?: string }) {
  return (
    <span className="block truncate text-xs text-muted-foreground" title={title}>
      {parts.filter(Boolean).join(' · ')}
    </span>
  )
}

function FileRow({
  f,
  meta,
  onPreview,
  onJump,
}: {
  f: FileItem
  meta: (string | null | undefined)[]
  onPreview: () => void
  onJump: () => void
}) {
  const kind = fileKind(f.name, f.type)
  const Icon = KIND_ICON[kind]
  const full = fullStamp(f.msg.created_at)

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-gold/50">
      {kind === 'audio' ? (
        // الملاحظة الصوتية تُشغَّل هنا مباشرة بدل نافذة معاينة
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-lg', KIND_TONE[kind])}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <VoiceNotePlayer name={f.name} url={f.url} compact />
            <Meta parts={meta} title={full} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          className="flex min-w-0 flex-1 items-center gap-3 text-right"
          title="معاينة"
        >
          {kind === 'image' ? (
            <img
              src={f.url}
              alt=""
              loading="lazy"
              className="h-11 w-11 shrink-0 rounded-lg border border-border/60 bg-muted object-cover"
            />
          ) : (
            <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-lg', KIND_TONE[kind])}>
              <Icon className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground" dir="auto" title={f.name}>
              {f.name}
            </span>
            <Meta parts={meta} title={full} />
          </span>
        </button>
      )}
      <JumpBtn onClick={onJump} />
    </div>
  )
}

function LinkRow({
  l,
  meta,
  onJump,
}: {
  l: LinkItem
  meta: (string | null | undefined)[]
  onJump: () => void
}) {
  // سياق الرابط: نص الرسالة بلا أي رابط فيه، وبلا علامات ترقيم بقيت معلّقة بعد حذفها
  const context = (l.msg.body ?? '')
    .replace(URL_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,،؛:!?؟])/g, '$1')
    .replace(/[\s.,،؛:!?؟-]+$/u, '')
    .trim()

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-gold/50">
      <button
        type="button"
        onClick={() => openExternal(hrefOf(l.url))}
        className="flex min-w-0 flex-1 items-center gap-3 text-right"
        title={hrefOf(l.url)}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Link2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground">
            <span className="truncate" dir="ltr">
              {hostOf(l.url)}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </span>
          <span className="block truncate text-xs text-blue-600/80 dark:text-blue-400/80" dir="ltr">
            {l.url}
          </span>
          {context && <span className="block truncate text-xs text-foreground/70">{context}</span>}
          <Meta parts={meta} title={fullStamp(l.msg.created_at)} />
        </span>
      </button>
      <JumpBtn onClick={onJump} />
    </div>
  )
}
