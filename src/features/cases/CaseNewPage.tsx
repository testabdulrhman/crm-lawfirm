import { useLocation } from 'wouter'

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
  const kind =
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('kind') ===
    'bankruptcy'
      ? ('bankruptcy' as const)
      : ('case' as const)
  return (
    <div className="pb-8">
      <CaseForm
        variant="page"
        kind={kind}
        onDone={() => navigate(kind === 'bankruptcy' ? '/matters' : '/cases')}
      />
    </div>
  )
}
