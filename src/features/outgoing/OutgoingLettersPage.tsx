import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, Search, Send, FileText, Scale, CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { useOutgoingLetters } from '@/hooks/useOutgoingLetters'
import { usePageState } from '@/hooks/usePageState'
import { OutgoingLetterForm } from './OutgoingLetterForm'
import type { OutgoingLetter } from '@/types/db'

export function OutgoingLettersPage() {
  const { data, isLoading } = useOutgoingLetters()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('out:q', '')
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter((l) =>
      [l.letter_number, l.subject, l.recipient]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [data, search])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          الصادر{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          خطاب جديد
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم الخطاب أو الموضوع أو المستلِم…"
          className="pr-9"
        />
      </div>

      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          النتائج: {fmtNumber(filtered.length)}
        </p>
      )}

      {isLoading ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtered.map((l) => (
            <LetterRow
              key={l.id}
              letter={l}
              onOpen={() => navigate(`/outgoing/${l.id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <OutgoingLetterForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LetterRow({
  letter: l,
  onOpen,
}: {
  letter: OutgoingLetter
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="block w-full px-4 py-3 text-right transition-colors hover:bg-accent/10"
    >
      {/* السطر العلوي: الموضوع + رقم الخطاب */}
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold leading-snug text-foreground">
          {l.subject || 'خطاب'}
        </h3>
        {l.approval?.status === 'approved' && (
          <Badge variant="success" className="shrink-0">
            معتمد
          </Badge>
        )}
        {l.approval?.status === 'pending' && (
          <Badge variant="warning" className="shrink-0">
            بانتظار الاعتماد
          </Badge>
        )}
        {l.approval?.status === 'rejected' && (
          <Badge variant="destructive" className="shrink-0">
            مرفوض
          </Badge>
        )}
        {l.file_url && (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {l.letter_number && (
          <span
            dir="ltr"
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {l.letter_number}
          </span>
        )}
      </div>

      {/* السطر السفلي: التاريخ/المستلم/القضية */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {l.letter_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {fmtDatePref(l.letter_date)}
          </span>
        )}
        {l.recipient && (
          <span className="flex min-w-0 items-center gap-1">
            <Send className="h-3 w-3 shrink-0" />
            <span className="truncate">إلى: {l.recipient}</span>
          </span>
        )}
        {l.case_id && (
          <span className="flex items-center gap-1">
            <Scale className="h-3 w-3 shrink-0" />
            {l.case?.title || 'قضية مرتبطة'}
          </span>
        )}
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Send className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد خطابات</p>
      <p className="text-sm text-muted-foreground">أضِف أول خطاب عبر «خطاب جديد».</p>
    </div>
  )
}
