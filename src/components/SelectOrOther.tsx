import { useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const OTHER = '__other__'

// Select بقيم شائعة + خيار «أخرى» يفتح حقل نص حر. قيمة محكومة (string).
export function SelectOrOther({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  placeholder?: string
}) {
  const [mode, setMode] = useState<'select' | 'other'>(
    value && !options.includes(value) ? 'other' : 'select'
  )
  return (
    <div className="space-y-2">
      <Select
        value={mode === 'other' ? OTHER : value || undefined}
        onValueChange={(v) => {
          if (v === OTHER) {
            setMode('other')
            onChange('')
          } else {
            setMode('select')
            onChange(v)
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>أخرى…</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'other' && (
        <Input
          placeholder="اكتب القيمة"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
