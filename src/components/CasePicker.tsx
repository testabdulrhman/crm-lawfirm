import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import type { Case } from '@/types/db'

// منتقي قضية بحثي خفيف (بحث بالعنوان/رقم المكتب/رقم المحكمة).
export function CasePicker({
  cases,
  value,
  onChange,
  placeholder = 'ابحث عن قضية…',
}: {
  cases: Case[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

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
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
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
        </div>
      )}
    </div>
  )
}
