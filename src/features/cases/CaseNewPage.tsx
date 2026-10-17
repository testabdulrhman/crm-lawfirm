import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'

import { clearQueryParam, queryParam } from '@/lib/queryParam'

import { CaseForm } from './CaseForm'

/**
 * «قضية جديدة» صفحةً كاملة لا نافذة.
 *
 * السبب ليس الجمال: منطقة إسقاط المستند تحتاج مساحة، والنافذة كانت تحصر
 * النموذج في `max-h-[62vh]` — تمرير داخل صندوق داخل صفحة. أما التعديل من
 * ملف القضية فيبقى نافذة، فهو تصحيح حقل لا إدخال قضية.
 */
export default function CaseNewPage() {
  const [, navigate] = useLocation()
  // ‎?kind=bankruptcy‎ يفتح النموذج نفسه بمفردات إجراء الإفلاس — الجدول واحد
  const [kind] = useState(() =>
    queryParam('kind') === 'bankruptcy' ? ('bankruptcy' as const) : ('case' as const)
  )
  // يُزال بعد قراءته وإلا علق قبل «#» ففتح «قضية جديدة» لاحقاً نموذجَ الإفلاس
  useEffect(() => clearQueryParam('kind'), [])
  return (
    <div className="pb-8">
      <CaseForm
        variant="page"
        kind={kind}
        onDone={(created) => navigate((created ?? kind) === 'bankruptcy' ? '/matters' : '/cases')}
      />
    </div>
  )
}
