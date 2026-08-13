import { Link } from 'wouter'
import { Phone, ExternalLink, UserCog } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { openExternal } from '@/lib/external'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { caseStatusLabel, caseTypeLabel } from '@/lib/caseLabels'
import type { Case } from '@/types/db'

export function OverviewTab({ caseData: c }: { caseData: Case }) {
  return (
    <div className="space-y-4">
      {/* معلومات القضية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات القضية</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="النوع" value={caseTypeLabel(c.type)} />
            <Row label="الحالة" value={caseStatusLabel(c.status)} />
            <Row label="المحكمة" value={c.court} />
            <Row label="الدائرة" value={c.court_division} />
            <Row label="رقم المكتب" value={c.office_num} dir="ltr" />
            <Row label="رقم المحكمة" value={c.court_num} dir="ltr" />
            <Row label="تاريخ الفتح" value={c.open_date ? fmtDatePref(c.open_date) : null} />
            {c.status === 'muntahia' && (
              <Row
                label="تاريخ الإغلاق"
                value={c.close_date ? fmtDatePref(c.close_date) : null}
              />
            )}
          </dl>

          {/* نسبة الإنجاز */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>نسبة الإنجاز</span>
              <span>{fmtNumber(c.progress ?? 0)}٪</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${Math.min(100, Math.max(0, c.progress ?? 0))}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الموضوع */}
      {c.subject && c.subject.trim() !== '' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الموضوع / التفاصيل</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {c.subject}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* الموكّل */}
        {c.contact && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الموكّل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-foreground">{c.contact.name}</p>
              {c.contact.phone && (
                <button
                  dir="ltr"
                  className="flex items-center justify-end gap-1 rounded-sm text-sm text-muted-foreground hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openExternal(`tel:${c.contact!.phone}`)}
                >
                  <span>{c.contact.phone}</span>
                  <Phone className="h-3.5 w-3.5" />
                </button>
              )}
              <Link
                href={`/contacts/${c.contact.id}`}
                className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                عرض ملف الموكّل
              </Link>
            </CardContent>
          </Card>
        )}

        {/* المسؤول */}
        {c.assignee && (
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <UserCog className="h-4 w-4 text-gold" />
              <CardTitle className="text-base">المحامي المسؤول</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium text-foreground">{c.assignee.name}</p>
              {c.assignee.short_name && (
                <p className="text-xs text-muted-foreground">
                  {c.assignee.short_name}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  dir,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
}) {
  if (!value || value.trim() === '') return null
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        dir={dir}
        className={'mt-0.5 text-sm text-foreground ' + (dir === 'ltr' ? 'text-right' : '')}
      >
        {value}
      </dd>
    </div>
  )
}
