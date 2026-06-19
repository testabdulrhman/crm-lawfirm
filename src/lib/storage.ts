// طبقة تجريد للتخزين (جاهزية Capacitor — القسم 1.1 بند 5).
// تستخدم localStorage الآن. عند التغليف بـ Capacitor نستبدل التنفيذ الداخلي
// بـ @capacitor/preferences بتغيير هذا الملف فقط، دون لمس بقية التطبيق.
//
// ملاحظة: واجهة Capacitor Preferences غير متزامنة (async)، لذا نُبقي التوقيع
// هنا متزامناً للاستخدام الحالي، ونوفّر أيضاً نسخاً async للتحضير المستقبلي.

export const storage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* تجاهل (وضع الخصوصية / امتلاء التخزين) */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* تجاهل */
    }
  },
}

export type Storage = typeof storage
