// الهوية والثوابت العامة
export const COMPANY_NAME =
  'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس'
export const COMPANY_NAME_SHORT = 'المشيقح للمحاماة'
export const BRAND_TITLE = `CRM — ${COMPANY_NAME}`

// عناوين الصفحات حسب المسار (تُستخدم في TopBar)
export const ROUTE_TITLES: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/cases': 'القضايا',
  '/poa': 'الوكالات',
  '/legal-services': 'الاستشارات واللوائح',
  '/property': 'التوثيق العقاري',
  '/appointments': 'المواعيد',
  '/team': 'الموظفون',
  '/contacts': 'جهات الاتصال',
  '/requests': 'الطلبات الواردة',
  '/staff-applications': 'طلبات التوظيف',
  '/settings': 'الإعدادات',
}
