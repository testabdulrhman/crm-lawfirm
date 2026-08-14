import type { CapacitorConfig } from '@capacitor/cli'

// تطبيق iOS «رضوان» — الواجهة **مدموجة داخل التطبيق** (لا تُحمَّل من الشبكة):
// يفتح فوراً بلا انتظار، ويعمل في المحاكم ضعيفة التغطية بدل الشاشة البيضاء.
// المقابل: التحديث يحتاج بناءً ورفعاً جديداً (توزيع داخلي عبر TestFlight).
// (للعودة لوضع المراية: أعِد server.url ثم npx cap sync ios)
const config: CapacitorConfig = {
  appId: 'sa.redwan.crm',
  appName: 'رضوان',
  webDir: 'dist',
  server: {
    // نطاقات مسموح التنقل إليها من داخل التطبيق (التخزين والدوال)
    allowNavigation: ['app.redwan.sa', '*.supabase.co'],
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#111D3A', // كحلي الهوية — يظهر خلف المناطق الآمنة
  },
}

export default config
