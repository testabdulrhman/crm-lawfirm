// الهوية والثوابت العامة
export const COMPANY_NAME =
  'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس'
export const BRAND_TITLE = `CRM — ${COMPANY_NAME}`

// عناوين الصفحات حسب المسار (تُستخدم في TopBar)
export const ROUTE_TITLES: Record<string, string> = {
  '/change-requests': 'اقتراحات التعديل',
  '/': 'لوحة التحكم',
  '/cases': 'القضايا',
  '/tasks': 'المهام',
  '/engagements': 'العقود',
  '/sessions': 'الجلسات',
  '/poa': 'الوكالات',
  '/legal-services': 'الاستشارات واللوائح',
  '/property': 'التوثيق العقاري',
  '/appointments': 'المواعيد',
  '/outgoing': 'الصادر',
  '/reports': 'التقارير والإحصاءات',
  '/team': 'الموظفون',
  '/inbox': 'الرسائل الواردة',
  '/mail': 'البريد',
  '/contacts': 'جهات الاتصال',
  '/requests': 'الطلبات الواردة',
  '/staff-applications': 'طلبات التوظيف',
  '/settings': 'الإعدادات',
}
