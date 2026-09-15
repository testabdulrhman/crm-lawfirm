import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { FileSignature, Link2, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { POAPicker } from '@/components/POAPicker'
import { POAForm } from '@/features/poa/POAForm'
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
 * ومن هنا أيضاً تُسجَّل وكالة جديدة مربوطة بالملف مباشرة، بموكّله معبّأً — بلا ذهاب
 * لقسم الوكالات (طلب المدير 2026-09-15). وزرّها ظاهر دائماً: زرّ الربط يختفي حين لا
 * توجد وكالة سارية غير مربوطة، فكان الملف بلا أي طريق لوكالته.
 *
 * ⚠️ الوكالة على ملف **منتهٍ** لا يُنبَّه على انتهائها — تُطبّقه القاعدة
 *    (`matter_is_closed`) وتشرحه هذه البطاقة كي لا يبدو التنبيه ضائعاً.
 */
export function CasePOAsCard({ caseData: c }: { caseData: Case }) {
  const { data: linked } = useCasePOAs(c.id)
  const { data: all } = usePOAs()
  const linkM = useLinkPOAToCase()
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)

  const closed =
    c.status === 'muntahia' || c.status === 'delivered' || c.status === 'مكتملة'

  // المرشّحات: السارية غير المربوطة، والأقرب انتهاءً أولاً
  const candidates = useMemo(
    () => (all ?? []).filter((p) => !p.case_id && p.status === 'active'),
    [all]
  )

  const openCreate = () => {
    setPicking(false)
    setCreating(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-gold" />
          <CardTitle className="text-base">الوكالات</CardTitle>
        </div>
        {!picking && (
          <div className="flex items-center gap-1">
            {candidates.length > 0 && (
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
            <Button size="sm" variant="ghost" className="gap-1 text-gold" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              وكالة جديدة
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {picking && (
          <div className="space-y-2">
            {/* فوق حقل البحث لا تحته: القائمة المنسدلة تغطي ما تحتها لحظة فتحها */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                اختر من الوكالات المسجّلة، أو{' '}
                <button
                  type="button"
                  onClick={openCreate}
                  className="font-medium text-gold hover:underline"
                >
                  سجّل وكالة جديدة لهذا الملف
                </button>
              </span>
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </button>
            </div>
            <POAPicker
              poas={candidates}
              autoFocus
              onPick={(id) => {
                linkM.mutate({ poaId: id, caseId: c.id })
                setPicking(false)
              }}
            />
          </div>
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

      {/* وكالة جديدة للملف: نموذج الوكالة نفسه، والملف وموكّله معبّآن — تُحفظ مربوطة */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
          {creating && (
            <POAForm
              defaults={{
                caseId: c.id,
                clientId: c.contact_id,
                clientName: c.contact?.name ?? null,
              }}
              onDone={() => setCreating(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
