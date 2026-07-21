import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, Search, Send, ChevronLeft, FileText, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((l) => (
            <LetterCard
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

function LetterCard({
  letter: l,
  onOpen,
}: {
  letter: OutgoingLetter
  onOpen: () => void
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Send className="h-4 w-4 shrink-0 text-gold" />
            <p className="truncate font-semibold text-foreground">
              {l.subject || 'خطاب'}
            </p>
          </div>
          {l.file_url && <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {l.letter_number && <p dir="ltr" className="text-right">رقم: {l.letter_number}</p>}
          {l.recipient && <p>إلى: {l.recipient}</p>}
          {l.letter_date && <p>التاريخ: {fmtDatePref(l.letter_date)}</p>}
          {l.case_id && (
            <p className="flex items-center gap-1">
              <Scale className="h-3 w-3" />
              {l.case?.title || 'قضية مرتبطة'}
            </p>
          )}
        </div>

        <div className="mt-auto flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onOpen}>
            عرض
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
