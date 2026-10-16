// لوحة «المصادر» في الباحث: ما يقرؤه الذكاء في هذه المحادثة. يضيف الموظف ملفاً أو رابطاً أو نصاً، أو يختار من
// مكتبته ومن «مكتبة المكتب» (ما شاركه الزملاء)، ويشارك مصدره مع المكتب إن أراد.
import { useState } from 'react'
import {
  AlertCircle, BookOpen, Check, FileText, Globe, Image as ImageIcon, Library, Link2, Loader2, Plus, Type, Upload, Users, X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { pickFiles } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import {
  useAddSource, useChatSources, useSourceLibrary, useToggleChatSource, useUpdateSource,
  type NewSource, type ResearchSource,
} from '@/hooks/useResearch'

export function sourceIcon(s: Pick<ResearchSource, 'kind' | 'mime'>) {
  if (s.kind === 'url') return Globe
  if (s.kind === 'text') return Type
  if ((s.mime ?? '').startsWith('image/')) return ImageIcon
  return FileText
}

export function SourcesPanel({
  chatId,
  ensureChat,
}: {
  chatId: string | null
  /** يُنشئ المحادثة عند أول مصدر قبل أي سؤال */
  ensureChat: () => Promise<string>
}) {
  const myId = useAuth((s) => s.teamMember?.id)
  const { data: sources = [] } = useChatSources(chatId)
  const addM = useAddSource()
  const toggleM = useToggleChatSource()
  const updateM = useUpdateSource()
  const [linkOpen, setLinkOpen] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const [busy, setBusy] = useState(0)

  const add = async (source: NewSource) => {
    setBusy((n) => n + 1)
    try {
      const id = chatId ?? (await ensureChat())
      await addM.mutateAsync({ source, chatId: id })
    } catch (e) {
      toast({ variant: 'destructive', title: 'لم يُضف المصدر', description: errMessage(e) })
    } finally {
      setBusy((n) => n - 1)
    }
  }

  const addFiles = async () => {
    const files = await pickFiles({ accept: '.pdf,.docx,.txt,.md,.csv,image/*' })
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) {
        toast({ variant: 'destructive', title: `«${f.name}» أكبر من ٢٠ ميغابايت` })
        continue
      }
      void add({ kind: 'file', file: f })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">المصادر</p>
          <p className="text-[11px] text-muted-foreground">يقرؤها الباحث في هذه المحادثة ويُحيل إليها</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1">
              {busy > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              إضافة
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={addFiles}><Upload className="h-4 w-4" /> ملف (PDF، Word، صورة)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLinkOpen(true)}><Link2 className="h-4 w-4" /> رابط صفحة</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTextOpen(true)}><Type className="h-4 w-4" /> نص منسوخ</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLibOpen(true)}><Library className="h-4 w-4" /> من المكتبة</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sources.length === 0 ? (
          <div className="rounded-xl border border-dashed px-3 py-6 text-center text-xs leading-6 text-muted-foreground">
            <BookOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
            أضف نظاماً أو حكماً أو مذكرة أو رابطاً، فيجيب الباحث منه ويُحيل إلى موضعه.
            <br />
            وبلا مصادر يبحث في الإنترنت وفي بيانات المكتب.
          </div>
        ) : (
          sources.map((s) => (
            <SourceRow
              key={s.id}
              s={s}
              mine={s.owner_id === myId}
              onRemove={() => chatId && toggleM.mutate({ chatId, sourceId: s.id, on: false })}
              onShare={(shared) => updateM.mutate({ id: s.id, patch: { shared } })}
            />
          ))
        )}
      </div>

      <LinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} onAdd={(url) => void add({ kind: 'url', url })} />
      <TextDialog open={textOpen} onClose={() => setTextOpen(false)} onAdd={(title, text) => void add({ kind: 'text', title, text })} />
      <LibraryDialog
        open={libOpen}
        onClose={() => setLibOpen(false)}
        inChat={new Set(sources.map((s) => s.id))}
        onPick={async (id) => {
          const cid = chatId ?? (await ensureChat())
          toggleM.mutate({ chatId: cid, sourceId: id, on: true })
        }}
      />
    </div>
  )
}

function SourceRow({ s, mine, onRemove, onShare }: {
  s: ResearchSource; mine: boolean; onRemove: () => void; onShare: (v: boolean) => void
}) {
  const Icon = sourceIcon(s)
  return (
    <div className={cn('group rounded-xl border bg-card px-3 py-2', s.status === 'failed' && 'border-destructive/40')}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-600 dark:text-gold-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={s.title}>{s.title}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {s.status === 'pending' && (<><Loader2 className="h-3 w-3 animate-spin" /> يُجهَّز…</>)}
            {s.status === 'failed' && (<span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {s.error ?? 'تعذّرت القراءة'}</span>)}
            {s.status === 'ready' && (s.kind === 'url' ? 'رابط' : s.kind === 'text' ? 'نص' : 'ملف')}
            {s.status === 'ready' && !mine && ' · من مكتبة المكتب'}
          </p>
        </div>
        <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="إزالة من المحادثة" title="إزالة من المحادثة">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {mine && s.status === 'ready' && (
        <button
          type="button"
          onClick={() => onShare(!s.shared)}
          className={cn('mt-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
            s.shared ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground hover:text-foreground')}
        >
          {s.shared ? <Check className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {s.shared ? 'في مكتبة المكتب' : 'شارك مع المكتب'}
        </button>
      )}
    </div>
  )
}

function LinkDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const ok = /^https?:\/\/\S+\.\S+/i.test(url.trim())
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>رابط صفحة</DialogTitle></DialogHeader>
        <Input dir="ltr" placeholder="https://laws.boe.gov.sa/…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        <p className="text-xs text-muted-foreground">تُقرأ الصفحة ويُحفظ نصها (ورابط PDF يُحفظ ملفاً). الصفحات التي تتطلب دخولاً لا تُقرأ.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="gold" disabled={!ok} onClick={() => { onAdd(url.trim()); setUrl(''); onClose() }}>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TextDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (title: string, text: string) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>نص منسوخ</DialogTitle></DialogHeader>
        <Input placeholder="عنوان المصدر (مثل: نظام المرافعات الشرعية — الباب الثاني)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea rows={12} placeholder="الصق النص هنا…" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="gold" disabled={!text.trim()} onClick={() => { onAdd(title, text); setTitle(''); setText(''); onClose() }}>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LibraryDialog({ open, onClose, inChat, onPick }: {
  open: boolean; onClose: () => void; inChat: Set<string>; onPick: (id: string) => void
}) {
  const { data } = useSourceLibrary()
  const [tab, setTab] = useState<'mine' | 'office'>('mine')
  const [q, setQ] = useState('')
  const list = (tab === 'mine' ? data?.mine : data?.office) ?? []
  const shown = list.filter((s) => s.status === 'ready' && (!q.trim() || s.title.includes(q.trim())))
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>من المكتبة</DialogTitle></DialogHeader>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {([['mine', `مكتبتي (${data?.mine.length ?? 0})`], ['office', `مكتبة المكتب (${data?.office.length ?? 0})`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={cn('flex-1 rounded-md py-1.5', tab === k ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        <Input placeholder="بحث بالعنوان…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tab === 'office' ? 'لم يشارك أحد مصدراً بعد' : 'لا مصادر بعد'}
            </p>
          ) : shown.map((s) => {
            const Icon = sourceIcon(s)
            const added = inChat.has(s.id)
            return (
              <button key={s.id} type="button" disabled={added} onClick={() => onPick(s.id)}
                className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right text-sm hover:bg-muted/60 disabled:opacity-60">
                <Icon className="h-4 w-4 shrink-0 text-gold-600" />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {added ? <Check className="h-4 w-4 text-emerald-600" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
