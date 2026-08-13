// قيمة لاتينية/رقمية داخل سطر عربي RTL — يعزل الاتجاه دون بعثرة الجملة.
// القاعدة: التسمية العربية خارج المكوّن دائماً، والقيمة وحدها داخله.
//   صحيح:  هوية: <Ltr>{idNum}</Ltr>
//   خطأ:   <span dir="ltr">هوية: {idNum}</span>  ← يقلب موضع الكلمة العربية
export function Ltr({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span dir="ltr" className={className} style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  )
}
