// العمود الثابت في صفحة القضية: الحقائق والأشخاص والأرقام.
// يبقى ظاهراً مهما تنقّل الموظف بين التبويبات — كان كل هذا مبعثراً في الرأس
// وفي تبويب «الأطراف» فيختفي عند التنقّل.
import { Link } from 'wouter'
import { Handshake, Pencil, Scale } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Ltr } from '@/components/Ltr'
import { cn } from '@/lib/utils'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { caseTypeLabel } from '@/lib/caseLabels'
import type { Case } from '@/types/db'

function Row({
  label,
  value,
  ltr,
}: {
  label: string
  value: string | null | undefined
  ltr?: boolean
}) {
  if (!value || value.trim() === '') return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-left text-sm font-medium text-foreground">
        {ltr ? <Ltr>{value}</Ltr> : value}
      </span>
    </div>
  )
}

function Person({
  name,
  role,
  color,
  href,
}: {
  name: string | null | undefined
  role: string
  color: string
  href?: string
}) {
  if (!name) return null
  const initial = name.trim().slice(0, 1)
  const inner = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        <span className="block text-xs text-muted-foreground">{role}</span>
      </span>
    </>
  )
  return href ? (
    <Link
      href={href}
      className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/60"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-2.5 py-1.5">{inner}</div>
  )
}

export function CaseFactsPanel({
  caseData: c,
  counts,
  onEdit,
}: {
  caseData: Case
  counts: { sessions: number; documents: number; tasks: number }
  onEdit: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">بيانات القضية</p>
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-7 gap-1 px-2 text-xs text-gold"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              تعديل
            </Button>
          </div>
          <Row label="رقم المكتب" value={c.office_num} ltr />
          <Row label="رقم المحكمة" value={c.court_num} ltr />
          <Row label="النوع" value={caseTypeLabel(c.type)} />
          <Row label="المحكمة" value={c.court} />
          <Row label="الدائرة" value={c.court_division} />
          <Row
            label="تاريخ القيد"
            value={c.open_date ? fmtDatePref(c.open_date) : null}
          />
          <Row
            label="تاريخ الإغلاق"
            value={c.close_date ? fmtDatePref(c.close_date) : null}
          />
          {c.engagement && (
            <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2">
              <span className="shrink-0 text-xs text-muted-foreground">العقد</span>
              <Link
                href={`/engagements/${c.engagement.id}`}
                className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground hover:text-gold"
              >
                <Handshake className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span className="truncate">
                  {c.engagement.title || c.engagement.engagement_number || 'عقد'}
                </span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-1 text-sm font-bold text-foreground">الأشخاص</p>
          <Person
            name={c.contact?.name}
            role="الموكّل"
            color="#111D3A"
            href={c.contact ? `/contacts/${c.contact.id}` : undefined}
          />
          <Person
            name={c.assignee?.name}
            role="المحامي المسؤول"
            color="#8a7434"
          />
          {!c.contact && !c.assignee && (
            <p className="py-2 text-xs text-muted-foreground">
              لم يُسجَّل موكّل ولا مسؤول بعد.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-bold text-foreground">أرقام سريعة</p>
          <Row label="الجلسات" value={fmtNumber(counts.sessions)} />
          <Row label="المستندات" value={fmtNumber(counts.documents)} />
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-xs text-muted-foreground">مهام مفتوحة</span>
            <span
              className={cn(
                'text-sm font-medium',
                counts.tasks > 0 ? 'text-destructive' : 'text-foreground'
              )}
            >
              {fmtNumber(counts.tasks)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export { Scale }
