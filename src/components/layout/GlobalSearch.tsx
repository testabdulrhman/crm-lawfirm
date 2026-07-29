import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Search,
  X,
  Scale,
  User,
  FileSignature,
  Loader2,
  Handshake,
  CalendarDays,
  BookOpen,
  Send,
  Users,
  BarChart3,
  Settings,
  LayoutDashboard,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react'

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

// انتقال سريع للصفحات (نمط لوحة الأوامر)
const NAV_ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'لوحة التحكم', href: '/', icon: LayoutDashboard },
  { label: 'العقود', href: '/engagements', icon: Handshake },
  { label: 'القضايا', href: '/cases', icon: Scale },
  { label: 'الجلسات', href: '/sessions', icon: CalendarDays },
  { label: 'الوكالات', href: '/poa', icon: FileSignature },
  { label: 'الاستشارات واللوائح', href: '/legal-services', icon: BookOpen },
  { label: 'الصادر', href: '/outgoing', icon: Send },
  { label: 'جهات الاتصال', href: '/contacts', icon: User },
  { label: 'الموظفون', href: '/team', icon: Users },
  { label: 'التقارير', href: '/reports', icon: BarChart3 },
  { label: 'الإعدادات', href: '/settings', icon: Settings },
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

// عنصر موحّد للتنقل بالأسهم: صفحة أو نتيجة بحث
type Item =
  | { type: 'nav'; label: string; href: string; icon: LucideIcon }
  | { type: 'result'; r: GlobalSearchResult }

export function GlobalSearch() {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  // صفحات مطابقة لما كُتب (أو كلها عند حقل فارغ)
  const navMatches = useMemo(() => {
    const q = query.trim()
    if (!q) return NAV_ACTIONS
    return NAV_ACTIONS.filter((a) => a.label.includes(q))
  }, [query])

  // القائمة المسطّحة بترتيب العرض: الصفحات ثم النتائج بترتيب المجموعات
  const items = useMemo<Item[]>(() => {
    const list: Item[] = navMatches.map((a) => ({ type: 'nav', ...a }))
    for (const g of GROUPS) {
      for (const r of grouped[g.kind]) list.push({ type: 'result', r })
    }
    return list
  }, [navMatches, grouped])

  const hasResults = (data?.length ?? 0) > 0
  const showPanel = open && (enabled || navMatches.length > 0)

  // أعد الإبراز لأول عنصر كلما تغيّرت القائمة
  useEffect(() => setHighlight(0), [query, data])

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

  // اختصار: / أو Cmd/Ctrl+K يفتح اللوحة ويركّز الحقل
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
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // أبقِ العنصر المُبرز ظاهراً أثناء التنقل بالأسهم
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const goItem = (it: Item) => {
    navigate(it.type === 'nav' ? it.href : hrefFor(it.r))
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const clear = () => {
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

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
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
            return
          }
          if (!showPanel || items.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => (h + 1) % items.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => (h - 1 + items.length) % items.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            goItem(items[Math.min(highlight, items.length - 1)])
          }
        }}
        placeholder="بحث أو انتقال…"
        className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {query ? (
        <button
          type="button"
          onClick={clear}
          aria-label="مسح البحث"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <kbd
          dir="ltr"
          className="pointer-events-none absolute left-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:block"
        >
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      )}

      {/* اللوحة: انتقال سريع + نتائج البحث */}
      {showPanel && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border bg-popover shadow-lg"
        >
          <div className="py-1">
            {navMatches.length > 0 && (
              <div>
                <div className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                  انتقال سريع
                </div>
                {navMatches.map((a, i) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.href}
                      type="button"
                      data-idx={i}
                      onClick={() => goItem({ type: 'nav', ...a })}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-right text-sm',
                        highlight === i ? 'bg-accent/20' : 'hover:bg-accent/20'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {a.label}
                      </span>
                      {highlight === i && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {enabled &&
              (isFetching && !hasResults ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ البحث…
                </div>
              ) : !hasResults ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  لا نتائج لـ «{debouncedQuery}»
                </p>
              ) : (
                GROUPS.map((g) => {
                  const rows = grouped[g.kind]
                  if (rows.length === 0) return null
                  const Icon = g.icon
                  // فهرس بداية هذه المجموعة داخل القائمة المسطّحة
                  const base =
                    navMatches.length +
                    GROUPS.slice(0, GROUPS.indexOf(g)).reduce(
                      (s, gg) => s + grouped[gg.kind].length,
                      0
                    )
                  return (
                    <div key={g.kind}>
                      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {g.label}
                        <span className="text-xs font-normal">
                          ({fmtNumber(rows.length)})
                        </span>
                      </div>
                      {rows.map((r, ri) => {
                        const idx = base + ri
                        return (
                          <button
                            key={`${r.kind}-${r.id}`}
                            type="button"
                            data-idx={idx}
                            onClick={() => goItem({ type: 'result', r })}
                            onMouseEnter={() => setHighlight(idx)}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-right text-sm',
                              highlight === idx ? 'bg-accent/20' : 'hover:bg-accent/20'
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
                            {highlight === idx && (
                              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
