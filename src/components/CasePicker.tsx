import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import type { Case } from '@/types/db'

// منتقي قضية بحثي خفيف (بحث بالعنوان/رقم المكتب/رقم المحكمة).
export function CasePicker({
  cases,
  value,
  onChange,
  placeholder = 'ابحث عن قضية…',
  inputId,
}: {
  cases: Case[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  /** لربط <Label htmlFor> الخارجي بحقل البحث الداخلي */
  inputId?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // إغلاق القائمة عند النقر/اللمس خارجها (كانت تبقى مفتوحة فوق أزرار الحوار)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const selected = useMemo(
    () => cases.find((c) => c.id === value) ?? null,
    [cases, value]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cases.slice(0, 20)
    return cases
      .filter((c) =>
        [c.title, c.office_num, c.court_num]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20)
  }, [cases, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="truncate text-sm">{selected.title || 'قضية'}</span>
        <button
          type="button"
          title="مسح الاختيار"
          className="-m-2 shrink-0 p-2 text-muted-foreground hover:text-destructive"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={inputId}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">لا نتائج</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full truncate px-3 py-2 text-right text-sm hover:bg-accent/20"
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                {c.title || 'قضية'}
                {c.office_num ? (
                  <span dir="ltr" className="mr-2 text-xs text-muted-foreground">
                    {c.office_num}
                  </span>
                ) : null}
              </button>
            ))
          )}
          <button
            type="button"
            className="flex w-full items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent/20"
            onClick={() => setOpen(false)}
          >
            <X className="h-3 w-3" />
            إغلاق
          </button>
        </div>
      )}
    </div>
  )
}
