// سياسة الخصوصية — صفحة عامة يتطلبها نشر تطبيق iOS في App Store.
// المحتوى صادق مع الواقع: نظام داخلي لموظفي الشركة، لا تتبع ولا إعلانات.

const FIRM = 'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس'

export default function Privacy() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F6F2] px-6 py-12 text-[#111D3A]">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2 border-b border-[#E7E2D6] pb-6">
          <h1 className="text-2xl font-bold">سياسة الخصوصية — تطبيق Redwan</h1>
          <p className="text-sm text-[#5F6B84]">{FIRM}</p>
          <p className="text-xs text-[#5F6B84]">آخر تحديث: أغسطس 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">ما هو التطبيق</h2>
          <p className="text-sm leading-7">
            تطبيق Redwan نظام عمل داخلي مخصص لموظفي {FIRM} حصراً. لا يُتاح
            التسجيل للعموم، ولا يستخدمه إلا أعضاء فريق الشركة بحسابات تنشئها
            إدارة المكتب.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">البيانات التي نجمعها</h2>
          <ul className="list-disc space-y-1 pr-5 text-sm leading-7">
            <li>
              <strong>بيانات حساب الموظف:</strong> الاسم، البريد الإلكتروني،
              رقم الجوال — لأغراض تسجيل الدخول والتواصل الداخلي.
            </li>
            <li>
              <strong>محتوى العمل:</strong> الملفات والقضايا والمهام والنقاشات
              والمستندات التي يدخلها الموظفون أثناء عملهم.
            </li>
            <li>
              <strong>رمز الإشعارات (Device Token):</strong> لإيصال إشعارات
              العمل إلى جهاز الموظف.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">ما لا نفعله</h2>
          <ul className="list-disc space-y-1 pr-5 text-sm leading-7">
            <li>لا نبيع أي بيانات ولا نشاركها مع أطراف تسويقية.</li>
            <li>لا إعلانات ولا أدوات تتبع (Tracking) في التطبيق.</li>
            <li>لا نجمع بيانات من غير موظفي الشركة.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">التخزين والأمان</h2>
          <p className="text-sm leading-7">
            تُخزَّن البيانات لدى مزود سحابي آمن (Supabase) مع تشفير النقل،
            وتقييد الوصول بسياسات صلاحيات على مستوى الصفوف، وسرية المستندات
            القانونية جزء من التزام الشركة المهني تجاه موكّليها.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">حذف البيانات</h2>
          <p className="text-sm leading-7">
            يستطيع الموظف طلب حذف حسابه وبياناته الشخصية بمراسلة إدارة المكتب،
            وتُحذف عند انتهاء العلاقة الوظيفية وفق سياسات الاحتفاظ النظامية.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">التواصل</h2>
          <p className="text-sm leading-7">
            لأي استفسار عن هذه السياسة:{' '}
            <a href="https://redwan.sa" className="text-[#8C7129] underline">
              redwan.sa
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
