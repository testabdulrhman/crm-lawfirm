// رابط <a> لملف من مخزن documents — يحمل الرابط الموقّع مؤقتاً (المخزن الخاص، المرحلة ١)
import type React from 'react'
import { forwardRef, type AnchorHTMLAttributes } from 'react'

import { useStoredUrl } from '@/lib/storedUrl'
import { openExternal } from '@/lib/external'

export const StoredLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string | null | undefined }>(
  function StoredLink({ href, onClick, ...rest }, ref) {
    const resolved = useStoredUrl(href)
    return (
      <a
        ref={ref}
        {...rest}
        href={resolved ?? href ?? undefined}
        onClick={(e) => {
          onClick?.(e)
          // لم يُوقَّع بعد (أول ضغطة سريعة): نفتحه بالمسار الموقّع بدل الأصلي
          if (!e.defaultPrevented && href && !resolved) {
            e.preventDefault()
            openExternal(href)
          }
        }}
      />
    )
  }
)

/** صورة من مخزن documents — تُعرض بالرابط الموقّع (ولا تُطلب قبل التوقيع) */
export function StoredImg({ src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string | null | undefined }) {
  const resolved = useStoredUrl(src)
  if (!resolved) return <span aria-hidden className={`${rest.className ?? ''} block animate-pulse bg-muted`} />
  return <img {...rest} src={resolved} />
}
