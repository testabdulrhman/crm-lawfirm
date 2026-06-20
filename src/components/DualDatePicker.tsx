import { useMemo, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtDual } from '@/lib/format'
import { usePrefs } from '@/stores/prefs'
import {
  HIJRI_MONTHS,
  HIJRI_YEAR_MIN,
  HIJRI_YEAR_MAX,
  gregorianToHijri,
  hijriToGregorian,
  hijriMonthLength,
  dateToISO,
} from '@/lib/hijri'

type Mode = 'gregorian' | 'hijri'

export interface DualDatePickerProps {
  value: string | null // ISO ميلادي YYYY-MM-DD
  onChange: (iso: string | null) => void
  label?: string
  required?: boolean
  id?: string
}

const YEARS = Array.from(
  { length: HIJRI_YEAR_MAX - HIJRI_YEAR_MIN + 1 },
  (_, i) => HIJRI_YEAR_MIN + i
)

export function DualDatePicker({
  value,
  onChange,
  label,
  required,
  id,
}: DualDatePickerProps) {
  // الوضع الافتراضي حسب تفضيل المستخدم (هجري إن اختار هجري، وإلا ميلادي)
  const pref = usePrefs((s) => s.dateDisplay)
  const [mode, setMode] = useState<Mode>(
    pref === 'hijri' ? 'hijri' : 'gregorian'
  )

  // الأجزاء الهجرية الحالية المشتقّة من القيمة الميلادية
  const hijri = useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    return gregorianToHijri(d)
  }, [value])

  const [hy, setHy] = useState<number>(hijri?.y ?? 1447)
  const [hm, setHm] = useState<number>(hijri?.m ?? 1)
  const [hd, setHd] = useState<number>(hijri?.d ?? 1)

  // مزامنة القوائم الهجرية عند تغيّر القيمة من الخارج
  const syncedKey = `${value ?? ''}`
  const [lastSync, setLastSync] = useState(syncedKey)
  if (lastSync !== syncedKey) {
    setLastSync(syncedKey)
    if (hijri) {
      setHy(hijri.y)
      setHm(hijri.m)
      setHd(hijri.d)
    }
  }

  const commitHijri = (y: number, m: number, d: number) => {
    const len = hijriMonthLength(y, m)
    const day = Math.min(d, len)
    setHy(y)
    setHm(m)
    setHd(day)
    onChange(dateToISO(hijriToGregorian(y, m, day)))
  }

  return (
    <div className="space-y-1.5">
      {/* صف العنوان + مبدّل الوضع (يظهر دائماً) */}
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <Label htmlFor={id}>
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
        ) : (
          <span />
        )}
        <div className="flex overflow-hidden rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setMode('gregorian')}
            className={cn(
              'px-2 py-0.5 transition-colors',
              mode === 'gregorian'
                ? 'bg-gold text-navy'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            ميلادي
          </button>
          <button
            type="button"
            onClick={() => setMode('hijri')}
            className={cn(
              'px-2 py-0.5 transition-colors',
              mode === 'hijri'
                ? 'bg-gold text-navy'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            هجري
          </button>
        </div>
      </div>

      {mode === 'gregorian' ? (
        <Input
          id={id}
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {/* اليوم */}
          <select
            aria-label="اليوم"
            value={hd}
            onChange={(e) => commitHijri(hy, hm, Number(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {Array.from({ length: hijriMonthLength(hy, hm) }, (_, i) => i + 1).map(
              (d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              )
            )}
          </select>
          {/* الشهر */}
          <select
            aria-label="الشهر"
            value={hm}
            onChange={(e) => commitHijri(hy, Number(e.target.value), hd)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {HIJRI_MONTHS.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          {/* السنة */}
          <select
            aria-label="السنة"
            value={hy}
            onChange={(e) => commitHijri(Number(e.target.value), hm, hd)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* عرض مزدوج للتأكيد */}
      {value && (
        <p className="text-xs text-muted-foreground">{fmtDual(value)}</p>
      )}
    </div>
  )
}
