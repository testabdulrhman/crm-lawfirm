import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { Search, X, Scale, User, FileSignature, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  useGlobalSearch,
  type GlobalSearchResult,
  type SearchKind,
} from '@/hooks/useGlobalSearch'
import { caseStatusLabel, caseStatusBadge } from '@/lib/caseLabels'
import { poaStatusLabel, poaStatusBadge } from '@/lib/poaLabels'

const GROUPS: { kind: SearchKind; label: string; icon: typeof Scale }[] = [
  { kind: 'case', label: 'القضايا', icon: Scale },
  { kind: 'contact', label: 'جهات الاتصال', icon: User },
  { kind: 'poa', label: 'الوكالات', icon: FileSignature },
]

function hrefFor(r: GlobalSearchResult): string {
  if (r.kind === 'case') return `/cases/${r.id}`
  if (r.kind === 'contact') return `/contacts/${r.id}`
  return `/poa/${r.id}`
}

function StatusBadge({ r }: { r: GlobalSearchResult }) {
  if (!r.status) return null
  if (r.kind === 'case')
    return <Badge variant={caseStatusBadge(r.status)}>{caseStatusLabel(r.status)}</Badge>
  if (r.kind === 'poa')
    return <Badge variant={poaStatusBadge(r.status)}>{poaStatusLabel(r.status)}</Badge>
  return null
}

export function GlobalSearch() {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isFetching, enabled, debouncedQuery } = useGlobalSearch(query)

  const grouped = useMemo(() => {
    const map: Record<SearchKind, GlobalSearchResult[]> = {
      case: [],
      contact: [],
      poa: [],
    }
    for (const r of data ?? []) {
      if (r.kind in map) map[r.kind].push(r)
    }
    return map
  }, [data])

  const hasResults = (data?.length ?? 0) > 0

  // إغلاق عند النقر خارج اللوحة
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // اختصار: / أو Cmd/Ctrl+K يركّز الحقل
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (r: GlobalSearchResult) => {
    navigate(hrefFor(r))
    setOpen(false)
    setQuery('')
  }

  const clear = () => {
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
        placeholder="بحث عام…"
        className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          aria-label="مسح البحث"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* لوحة النتائج */}
      {open && enabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {isFetching && !hasResults ? (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ البحث…
            </div>
          ) : !hasResults ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              لا نتائج لـ «{debouncedQuery}»
            </p>
          ) : (
            <div className="py-1">
              {GROUPS.map((g) => {
                const rows = grouped[g.kind]
                if (rows.length === 0) return null
                const Icon = g.icon
                return (
                  <div key={g.kind}>
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {g.label}
                      <span className="text-[10px]">
                        ({fmtNumber(rows.length)})
                      </span>
                    </div>
                    {rows.map((r) => (
                      <button
                        key={`${r.kind}-${r.id}`}
                        type="button"
                        onClick={() => go(r)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent/20'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-gold" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">
                            {r.title}
                          </span>
                          {r.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                        <StatusBadge r={r} />
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
