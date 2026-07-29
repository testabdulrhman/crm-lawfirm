import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  BookUser,
  Phone,
  Link2,
  ChevronLeft,
  MessageCircle,
  PhoneCall,
  Download,
  PenLine,
  ArrowUpDown,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtNumber } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useContacts, useContactWorkLinks } from '@/hooks/useContacts'
import { usePageState } from '@/hooks/usePageState'
import { ContactForm } from './ContactForm'
import {
  CATEGORY_OPTIONS,
  ENTITY_OPTIONS,
  SOURCE_OPTIONS,
  categoryBadge,
  categoryLabel,
  sourceLabel,
} from '@/lib/contactLabels'
import type { Contact, ContactWorkLinks } from '@/types/db'

type LinkFilter = 'all' | 'linked' | 'unlinked'
const PAGE = 50

// خيارات الفرز
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'الأحدث إضافة' },
  { value: 'oldest', label: 'الأقدم إضافة' },
  { value: 'name', label: 'الاسم (أبجدي)' },
  { value: 'links', label: 'الأكثر ارتباطاً بعمل' },
]

function linkSummary(l: ContactWorkLinks): string {
  const parts: string[] = []
  if (l.cases_count) parts.push(`${fmtNumber(l.cases_count)} قضايا`)
  if (l.services_count) parts.push(`${fmtNumber(l.services_count)} خدمات`)
  if (l.appointments_count) parts.push(`${fmtNumber(l.appointments_count)} مواعيد`)
  if (l.requests_count) parts.push(`${fmtNumber(l.requests_count)} طلبات`)
  if (l.property_count) parts.push(`${fmtNumber(l.property_count)} إفراغات`)
  return parts.join(' · ')
}

function sourceIcon(source: string | null) {
  switch (source) {
    case 'whatsapp':
      return MessageCircle
    case 'hatif':
      return PhoneCall
    case 'imported':
      return Download
    default:
      return PenLine
  }
}

export function ContactsPage() {
  const { data, isLoading } = useContacts()
  const { data: workLinks } = useContactWorkLinks()
  const [, navigate] = useLocation()

  const [search, setSearch] = usePageState('contacts:q', '')
  const [category, setCategory] = usePageState<string>('contacts:category', 'all')
  const [entity, setEntity] = usePageState<string>('contacts:entity', 'all')
  const [linkFilter, setLinkFilter] = usePageState<LinkFilter>('contacts:link', 'all')
  const [source, setSource] = usePageState<string>('contacts:source', 'all')
  const [sort, setSort] = usePageState<string>('contacts:sort', 'newest')
  const [visible, setVisible] = usePageState('contacts:visible', PAGE)
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((c) => {
      if (q) {
        const hay = [c.name, c.phone, c.phone2, c.id_number]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (category !== 'all' && (c.category ?? '') !== category) return false
      if (entity !== 'all' && (c.entity_type ?? '') !== entity) return false
      if (source !== 'all' && (c.source ?? 'manual') !== source) return false
      if (linkFilter !== 'all') {
        const total = workLinks?.get(c.id)?.total_links ?? 0
        if (linkFilter === 'linked' && total === 0) return false
        if (linkFilter === 'unlinked' && total > 0) return false
      }
      return true
    })
  }, [data, search, category, entity, source, linkFilter, workLinks])

  // الفرز حسب اختيار المستخدم (القائمة أصلاً من الأحدث للأقدم)
  const sorted = useMemo(() => {
    if (sort === 'newest') return filtered
    const list = filtered.map((c, i) => ({ c, i }))
    switch (sort) {
      case 'oldest':
        list.sort((a, b) => b.i - a.i)
        break
      case 'name':
        list.sort((a, b) => (a.c.name ?? '').localeCompare(b.c.name ?? '', 'ar'))
        break
      case 'links':
        list.sort((a, b) => {
          const la = workLinks?.get(a.c.id)?.total_links ?? 0
          const lb = workLinks?.get(b.c.id)?.total_links ?? 0
          return lb - la || a.i - b.i
        })
        break
    }
    return list.map((x) => x.c)
  }, [filtered, sort, workLinks])

  const shown = sorted.slice(0, visible)

  // أعد ضبط الصفحات عند تغيير أي فلتر
  const resetPage = () => setVisible(PAGE)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          جهات الاتصال{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          جهة اتصال
        </Button>
      </div>

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            resetPage()
          }}
          placeholder="بحث بالاسم أو الجوال أو الهوية…"
          className="pr-9"
        />
      </div>

      {/* الفلاتر */}
      <div className="space-y-2">
        <FilterRow label="التصنيف">
          <Chip active={category === 'all'} onClick={() => { setCategory('all'); resetPage() }}>الكل</Chip>
          {CATEGORY_OPTIONS.map((o) => (
            <Chip key={o.value} active={category === o.value} onClick={() => { setCategory(o.value); resetPage() }}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="الارتباط">
          <Chip active={linkFilter === 'all'} onClick={() => { setLinkFilter('all'); resetPage() }}>الكل</Chip>
          <Chip active={linkFilter === 'linked'} onClick={() => { setLinkFilter('linked'); resetPage() }}>مرتبطة بعمل</Chip>
          <Chip active={linkFilter === 'unlinked'} onClick={() => { setLinkFilter('unlinked'); resetPage() }}>غير مرتبطة</Chip>
        </FilterRow>
        <FilterRow label="النوع">
          <Chip active={entity === 'all'} onClick={() => { setEntity('all'); resetPage() }}>الكل</Chip>
          {ENTITY_OPTIONS.map((e) => (
            <Chip key={e} active={entity === e} onClick={() => { setEntity(e); resetPage() }}>{e}</Chip>
          ))}
        </FilterRow>
        <FilterRow label="المصدر">
          <Chip active={source === 'all'} onClick={() => { setSource('all'); resetPage() }}>الكل</Chip>
          {SOURCE_OPTIONS.map((o) => (
            <Chip key={o.value} active={source === o.value} onClick={() => { setSource(o.value); resetPage() }}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {/* عدّاد النتائج + الفرز */}
      {!isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            النتائج: {fmtNumber(filtered.length)}
          </p>
          <Select value={sort} onValueChange={(v) => { setSort(v); resetPage() }}>
            <SelectTrigger className="h-9 w-48">
              <ArrowUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="الفرز" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* المحتوى */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                links={workLinks?.get(c.id)}
                onOpen={() => navigate(`/contacts/${c.id}`)}
              />
            ))}
          </div>
          {visible < filtered.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
                تحميل المزيد ({fmtNumber(filtered.length - visible)})
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <ContactForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {children}
    </Button>
  )
}

function ContactCard({
  contact: c,
  links,
  onOpen,
}: {
  contact: Contact
  links?: ContactWorkLinks
  onOpen: () => void
}) {
  const total = links?.total_links ?? 0
  const SourceIcon = sourceIcon(c.source)
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {c.name ?? '—'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={categoryBadge(c.category)}>
                {categoryLabel(c.category)}
              </Badge>
              {c.entity_type && (
                <Badge variant="outline">{c.entity_type}</Badge>
              )}
            </div>
          </div>
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title={`المصدر: ${sourceLabel(c.source)}`}
          >
            <SourceIcon className="h-3.5 w-3.5" />
          </span>
        </div>

        {c.phone && (
          <button
            dir="ltr"
            className="flex items-center justify-end gap-1 text-xs text-muted-foreground hover:text-gold"
            onClick={() => openExternal(`tel:${c.phone}`)}
          >
            <span>{c.phone}</span>
            <Phone className="h-3 w-3" />
          </button>
        )}

        {total > 0 && (
          <div className="flex items-start gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              مرتبطة بعمل{links ? ` — ${linkSummary(links)}` : ''}
            </span>
          </div>
        )}

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
        <BookUser className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد نتائج</p>
      <p className="text-sm text-muted-foreground">
        جرّب تعديل الفلاتر أو البحث، أو أضِف جهة اتصال جديدة.
      </p>
    </div>
  )
}
