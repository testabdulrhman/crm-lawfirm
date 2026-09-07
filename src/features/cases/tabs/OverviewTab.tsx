
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { caseStatusLabel, caseTypeLabel } from '@/lib/caseLabels'
import type { Case } from '@/types/db'
import { CasePeopleCard } from '../CasePeopleCard'
import { CasePOAsCard } from '../CasePOAsCard'

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

      {/* نطاق العمل المتفق عليه — يأتي من عرض السعر عند فتح الملف
          (حلّ محل تبويب «بطاقة المشروع» الذي بقي فارغاً لأنه طلب إعادة كتابة
          ما التزم به المكتب مسبقاً) */}
      {c.agreed_scope && c.agreed_scope.trim() !== '' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">نطاق العمل المتفق عليه</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {c.agreed_scope}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              من عرض السعر المعتمد عند فتح الملف — ما خرج عنه يحتاج اتفاقاً جديداً.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* الأشخاص: الموكّل + المسؤول + الفريق في بطاقة واحدة */}
        <CasePeopleCard caseData={c} />

        {/* الوكالات المربوطة بهذا الملف */}
        <CasePOAsCard caseData={c} />
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
