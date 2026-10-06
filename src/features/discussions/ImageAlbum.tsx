// الصور في النقاش — الويب (اقتراح المدير 2026-10-06 للآيفون: «إذا أرسلت صور جميع تحت بعض تكون مثل
// طريقة الواتس أب تجون مجمّعه»، ثم «وفي الويب، ما راح يتغيّر طريقة عرض الصور؟»).
// الصورة تُعرض صورةً لا شريحة ملف، والمتتالية من الكاتب نفسه ألبوم ٢×٢ و«+N»، وتُفتح بملء الشاشة
// مع التقليب بالأسهم والسهمين في لوحة المفاتيح.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export const isImageName = (name: string | null | undefined) =>
  /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(name ?? '')

export interface AlbumImage {
  id: string
  name: string
  url: string | null
}

/** صورة بلا تعليق ولا ردود من موظف — هي وحدها تدخل الألبوم */
export function isLoneImage(m: {
  kind?: string | null
  document_name?: string | null
  body?: string | null
  reply_count?: number | null
}): boolean {
  return (
    (m.kind ?? 'user') === 'user' &&
    isImageName(m.document_name) &&
    !(m.body ?? '').trim() &&
    (m.reply_count ?? 0) === 0
  )
}

/** الصور المتتالية من الكاتب نفسه بفارق ٣ دقائق فأقل تُجمع في صف واحد */
export function groupImageRows<
  T extends { id: string; author_id: string | null; created_at: string | null } & Parameters<typeof isLoneImage>[0],
>(msgs: T[]): { head: T; extras: T[] }[] {
  const out: { head: T; extras: T[] }[] = []
  for (const m of msgs) {
    const last = out[out.length - 1]
    const prev = last ? (last.extras[last.extras.length - 1] ?? last.head) : null
    if (
      last &&
      prev &&
      isLoneImage(last.head) &&
      isLoneImage(m) &&
      m.author_id === last.head.author_id &&
      Math.abs(Date.parse(m.created_at ?? '') - Date.parse(prev.created_at ?? '')) <= 180_000
    ) {
      last.extras.push(m)
    } else {
      out.push({ head: m, extras: [] })
    }
  }
  return out
}

export function ImageAlbum({ images, compact = false }: { images: AlbumImage[]; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const shown = images.slice(0, 4)
  const single = images.length === 1

  return (
    <>
      <div
        className={cn(
          'mt-1.5 overflow-hidden rounded-xl',
          single ? (compact ? 'max-w-[220px]' : 'max-w-[360px]') : 'grid max-w-[360px] grid-cols-2 gap-0.5'
        )}
      >
        {shown.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i)}
            className={cn(
              'relative block overflow-hidden bg-muted',
              single ? (compact ? 'h-36 w-full' : 'h-56 w-full') : images.length === 2 ? 'h-40' : 'h-32'
            )}
            title={img.name}
          >
            {img.url && (
              <img src={img.url} alt={img.name} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-[1.02]" />
            )}
            {i === 3 && images.length > 4 && (
              <span className="absolute inset-0 grid place-items-center bg-black/45 text-2xl font-bold text-white">
                <bdi dir="ltr">+{images.length - 4}</bdi>
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && <Viewer images={images} start={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function Viewer({ images, start, onClose }: { images: AlbumImage[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const go = useCallback((d: number) => setI((x) => (x + d + images.length) % images.length), [images.length])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // الواجهة من اليمين لليسار: السهم الأيسر = التالي
      if (e.key === 'ArrowLeft') go(1)
      if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])
  const img = images[i]

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl border-0 bg-black/95 p-0 text-white [&>button]:hidden">
        <DialogTitle className="sr-only">{img.name}</DialogTitle>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
          <span className="truncate text-white/80">
            {images.length > 1 ? `${i + 1} من ${images.length} · ` : ''}
            {img.name}
          </span>
          {img.url ? (
            <a href={img.url} target="_blank" rel="noreferrer" download className="rounded-full p-1.5 hover:bg-white/10" aria-label="تنزيل">
              <Download className="h-5 w-5" />
            </a>
          ) : (
            <span className="w-8" />
          )}
        </div>
        <div className="relative flex h-[75vh] items-center justify-center px-12 pb-6">
          {img.url && <img src={img.url} alt={img.name} className="max-h-full max-w-full object-contain" />}
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} className="absolute right-3 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="السابقة">
                <ChevronRight className="h-6 w-6" />
              </button>
              <button type="button" onClick={() => go(1)} className="absolute left-3 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="التالية">
                <ChevronLeft className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
