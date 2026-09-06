import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { FileSignature, Link2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCasePOAs, useLinkPOAToCase, usePOAs } from '@/hooks/usePOAs'
import { fmtDatePref } from '@/lib/format'
import { expirySoonText, isExpiringSoon, poaStatusLabel } from '@/lib/poaLabels'
import { CASE_STATUS_LABELS } from '@/lib/caseLabels'
import type { Case, CaseStatus } from '@/types/db'

/**
 * وكالات المشروع — الربط من جهة الملف.
 *
 * كان الربط متاحاً في نموذج الوكالة وحده، فلا يُفتح إلا بقصد. وهنا يُربط وأنت
 * في الملف نفسه، وهو موضع التذكّر الطبيعي.
 *
 * ⚠️ الوكالة على ملف **منتهٍ** لا يُنبَّه على انتهائها — تُطبّقه القاعدة
 *    (`matter_is_closed`) وتشرحه هذه البطاقة كي لا يبدو التنبيه ضائعاً.
 */
export function CasePOAsCard({ caseData: c }: { caseData: Case }) {
  const { data: linked } = useCasePOAs(c.id)
  const { data: all } = usePOAs()
  const linkM = useLinkPOAToCase()
  const [picking, setPicking] = useState(false)

  const closed =
    c.status === 'muntahia' || c.status === 'delivered' || c.status === 'مكتملة'

  // المرشّحات: السارية غير المربوطة، والأقرب انتهاءً أولاً
  const candidates = useMemo(
    () =>
      (all ?? [])
        .filter((p) => !p.case_id && p.status === 'active')
        .slice(0, 100),
    [all]
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-gold" />
          <CardTitle className="text-base">الوكالات</CardTitle>
        </div>
        {!picking && candidates.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-gold"
            onClick={() => setPicking(true)}
          >
            <Link2 className="h-4 w-4" />
            ربط وكالة
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {picking && (
          <Select
            onValueChange={(id) => {
              linkM.mutate({ poaId: id, caseId: c.id })
              setPicking(false)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر وكالة سارية غير مربوطة" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {[p.poa_number, p.client_name].filter(Boolean).join(' — ') ||
                    'وكالة'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(linked ?? []).length === 0 && !picking && (
          <p className="text-xs text-muted-foreground">
            لا وكالة مربوطة بهذا الملف.
          </p>
        )}

        {(linked ?? []).map((p) => (
          <div key={p.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/poa/${p.id}`}
                className="block truncate text-sm font-medium text-foreground hover:text-gold hover:underline"
              >
                <span dir="ltr">{p.poa_number || 'وكالة'}</span>
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {p.client_name || '—'}
                {p.expiry_date && ` · تنتهي ${fmtDatePref(p.expiry_date)}`}
              </p>
              {isExpiringSoon(p) &&
                (closed ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    لا تنبيه — الملف{' '}
                    {CASE_STATUS_LABELS[c.status as CaseStatus] ?? 'منتهٍ'}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {expirySoonText(p.expiry_date)}
                  </p>
                ))}
            </div>
            <Badge variant="secondary" className="shrink-0">
              {poaStatusLabel(p.status)}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="فكّ الربط"
              onClick={() => linkM.mutate({ poaId: p.id, caseId: null })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
