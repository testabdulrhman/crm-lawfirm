import { useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { QuickContactDialog } from '@/components/QuickContactDialog'
import type { Contact } from '@/types/db'

// منتقي جهة اتصال بحثي خفيف (يصلح لـ 777 جهة). يُرجع الجهة كاملة عند الاختيار.
export function ContactPicker({
  contacts,
  value,
  onSelect,
  placeholder = 'ابحث عن جهة اتصال بالاسم أو الجوال…',
  allowCreate = true,
  createCategory = 'client',
}: {
  contacts: Contact[]
  value: string | null
  onSelect: (contact: Contact | null) => void
  placeholder?: string
  /** إتاحة إنشاء جهة جديدة من داخل القائمة دون مغادرة النموذج */
  allowCreate?: boolean
  /** تصنيف الجهة المُنشأة: 'client' لموكّل، 'caller' لمتصل */
  createCategory?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // الجهة المُنشأة للتوّ: قائمة `contacts` تأتي من الأب وتُحدَّث بعد إبطال
  // الاستعلام — فبين الإنشاء ووصول القائمة الجديدة لا يجدها البحث أدناه
  // فيظهر المنتقي كأن شيئاً لم يُختر. نحتفظ بها محلياً حتى تلحق القائمة.
  const [justCreated, setJustCreated] = useState<Contact | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // إغلاق القائمة عند النقر/اللمس خارجها — نفس علاج CasePicker الموثّق
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const selected = useMemo(
    () =>
      contacts.find((c) => c.id === value) ??
      (justCreated?.id === value ? justCreated : null),
    [contacts, value, justCreated]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts.slice(0, 20)
    return contacts
      .filter((c) =>
        [c.name, c.phone, c.phone2, c.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20)
  }, [contacts, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="truncate text-sm">
          {selected.name}
          {selected.phone ? (
            <span dir="ltr" className="mr-2 text-xs text-muted-foreground">
              {selected.phone}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          title="مسح الاختيار"
          onClick={() => {
            onSelect(null)
            setQuery('')
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              {query.trim() ? `لا نتائج لـ «${query.trim()}»` : 'لا نتائج'}
            </p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent/20"
                onClick={() => {
                  onSelect(c)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <span className="truncate">{c.name}</span>
                {c.phone && (
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    {c.phone}
                  </span>
                )}
              </button>
            ))
          )}
          {/* الإنشاء الفوري: لا يقف البحث عند «لا نتائج» — يتابع العمل */}
          {allowCreate && (
            <button
              type="button"
              className="flex w-full items-center gap-1.5 border-t bg-gold/5 px-3 py-2.5 text-right text-xs font-medium text-gold-600 hover:bg-gold/10 dark:text-gold-300"
              onClick={() => {
                setOpen(false)
                setCreating(true)
              }}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {query.trim()
                  ? `إضافة «${query.trim()}» جهة اتصال جديدة`
                  : 'إضافة جهة اتصال جديدة'}
              </span>
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent/20"
            onClick={() => setOpen(false)}
          >
            <X className="h-3 w-3" />
            إغلاق
          </button>
        </div>
      )}

      {allowCreate && (
        <QuickContactDialog
          open={creating}
          onOpenChange={setCreating}
          initialName={query.trim()}
          category={createCategory}
          onCreated={(c) => {
            setJustCreated(c)
            onSelect(c) // يُختار فوراً — لا خطوة بحث إضافية
            setQuery('')
          }}
        />
      )}
    </div>
  )
}
