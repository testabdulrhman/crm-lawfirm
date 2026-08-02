import type { CapacitorConfig } from '@capacitor/cli'

// تطبيق iOS «رضوان» — يعرض النظام المنشور مباشرة:
// أي تحديث يُنشر على app.redwan.sa يظهر في الجوالات فوراً بدون إصدار جديد.
// (للتحول لنسخة مدموجة داخل التطبيق: احذف server.url وأعد cap sync)
const config: CapacitorConfig = {
  appId: 'sa.redwan.crm',
  appName: 'رضوان',
  webDir: 'dist',
  server: {
    url: 'https://app.redwan.sa',
    allowNavigation: ['app.redwan.sa', '*.supabase.co'],
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#111D3A', // كحلي الهوية — يظهر خلف المناطق الآمنة
  },
}

export default config
