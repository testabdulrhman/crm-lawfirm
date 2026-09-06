import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { arNorm } from '@/lib/arabic'
import { fmtDatePref } from '@/lib/format'
import type { PowerOfAttorney } from '@/types/db'

/**
 * أرقام الوكالات مخزّنة بالأرقام اللاتينية، والمستخدم قد يكتبها بالعربية
 * (٤٧٢٠٧١) من لوحة مفاتيح عربية. نطوي الأرقام قبل المطابقة كي لا يخيب بحثه.
 *
 * ⚠️ محلّي عمداً: `arNorm` مشتركة مع `ar_norm()` في القاعدة و`String.arNorm`
 *    في iOS، ولا تُعدَّل إلا في الثلاثة معاً.
 */
const foldDigits = (s: string): string =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))

const norm = (s: string): string => arNorm(foldDigits(s))

/** منتقي وكالة بحثي — برقم الوكالة أو باسم الموكّل أو الوكيل */
export function POAPicker({
  poas,
  onPick,
  placeholder = 'ابحث برقم الوكالة أو باسم الموكّل…',
  autoFocus,
}: {
  poas: PowerOfAttorney[]
  onPick: (id: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(!!autoFocus)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const matches = useMemo(() => {
    const q = norm(query.trim())
    const pool = q
      ? poas.filter((p) =>
          norm(
            [p.poa_number, p.client_name, p.agent_name].filter(Boolean).join(' ')
          ).includes(q)
        )
      : poas
    return pool.slice(0, 20)
  }, [poas, query])

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              لا وكالة سارية غير مربوطة بهذا الوصف
            </p>
          ) : (
            matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-right hover:bg-accent/20"
                onClick={() => {
                  onPick(p.id)
                  setQuery('')
                  setOpen(false)
                }}
              >
                <span dir="ltr" className="block text-sm font-medium">
                  {p.poa_number || 'وكالة'}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.client_name || '—'}
                  {p.expiry_date && ` · تنتهي ${fmtDatePref(p.expiry_date)}`}
                </span>
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
