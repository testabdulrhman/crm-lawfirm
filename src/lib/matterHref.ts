// وجهة «فتح الملف» حسب نوعه — القاعدة موحّدة (cases بعمود kind) والصفحات
// متخصّصة. تُستعمل في النقاشات وسرد قصة الملف وكل رابط لملفٍ نوعه متغيّر.
export function matterHref(kind: string | null | undefined, id: string): string {
  switch (kind) {
    case 'legal_service':
      return `/legal-services/${id}`
    case 'property':
      return `/property/${id}`
    default:
      return `/cases/${id}`
  }
}
