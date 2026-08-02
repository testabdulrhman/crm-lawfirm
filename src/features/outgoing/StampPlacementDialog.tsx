// اختيار موضع الختم/التوقيع: عرض صفحة الـPDF الحقيقية (pdf.js) والسحب عليها.
// يدعم توقيعاً ثانياً بموضع مستقل (وقد يكون في صفحة أخرى) — كل عنصر يُسحب وحده.
// يُخرج المواضع كمراكز بكسور 0..1 من أعلى يسار الصفحة + رقم الصفحة.
import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Move,
  PenLine,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fmtNumber } from '@/lib/format'
import {
  STAMP_WIDTH_PT,
  SIGNATURE_WIDTH_PT,
  DEFAULT_STAMP_POS,
  APPLY_MODE_LABELS,
  type StampPosition,
  type ApplyMode,
} from '@/lib/pdfStamp'
import { errMessage } from '@/lib/errors'

export function StampPlacementDialog({
  open,
  onClose,
  fileUrl,
  stampUrl,
  signatureUrl,
  initial,
  initialMode = 'both',
  initialSig2 = null,
  onConfirm,
  confirmLabel = 'تأكيد الموضع',
  confirming = false,
}: {
  open: boolean
  onClose: () => void
  fileUrl: string
  stampUrl: string | null
  signatureUrl: string | null
  initial?: StampPosition | null
  initialMode?: ApplyMode
  initialSig2?: StampPosition | null
  onConfirm: (
    pos: StampPosition,
    mode: ApplyMode,
    sig2: StampPosition | null
  ) => void
  confirmLabel?: string
  confirming?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const dragTarget = useRef<'primary' | 'sig2'>('primary')

  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<ApplyMode>(initialMode)
  const [pos, setPos] = useState({ x: DEFAULT_STAMP_POS.x, y: DEFAULT_STAMP_POS.y })
  // صفحة الكتلة الأساسية (قد يتنقل المستخدم لصفحات أخرى لوضع التوقيع الثاني)
  const [primaryPage, setPrimaryPage] = useState(1)
  const [sig2, setSig2] = useState<StampPosition | null>(null)
  const [pageSizePt, setPageSizePt] = useState({ w: 595, h: 842 })
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // عند الفتح: ابدأ من الموضع المحفوظ أو الافتراضي، والصفحة الأخيرة افتراضاً
  useEffect(() => {
    if (!open) return
    setError(null)
    setLoading(true)
    setMode(initialMode)
    setSig2(initialSig2 ?? null)
    if (initial) {
      setPage(initial.page)
      setPrimaryPage(initial.page)
      setPos({ x: initial.x, y: initial.y })
    } else {
      setPage(0) // 0 = «آخر صفحة» تُحسم بعد معرفة العدد
      setPrimaryPage(0)
      setPos({ x: DEFAULT_STAMP_POS.x, y: DEFAULT_STAMP_POS.y })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // تحميل ورسم الصفحة (pdf.js يُحمَّل ديناميكياً)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const doc = await pdfjs.getDocument({ url: fileUrl }).promise
        if (cancelled) return
        setPageCount(doc.numPages)
        const target = page === 0 ? doc.numPages : Math.min(page, doc.numPages)
        if (page === 0) setPage(target)
        setPrimaryPage((p) => (p === 0 ? target : p))
        const p = await doc.getPage(target)

        const baseViewport = p.getViewport({ scale: 1 })
        setPageSizePt({ w: baseViewport.width, h: baseViewport.height })

        // مقاس العرض: حسب عرض الحاوية (مع سقف للكثافة)
        const containerW = containerRef.current?.clientWidth ?? 640
        const scale = containerW / baseViewport.width
        const viewport = p.getViewport({ scale: scale * (window.devicePixelRatio || 1) })

        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${containerW}px`
        canvas.style.height = `${(baseViewport.height * scale).toFixed(0)}px`
        setCssSize({ w: containerW, h: baseViewport.height * scale })

        const ctx = canvas.getContext('2d')!
        await p.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(errMessage(e) ?? 'تعذّر عرض الملف')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, fileUrl, page])

  // السحب: تحديث مركز العنصر المسحوب (الكتلة الأساسية أو التوقيع الثاني)
  const moveTo = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el || cssSize.w === 0) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(0.97, Math.max(0.03, (clientX - rect.left) / rect.width))
    const y = Math.min(0.97, Math.max(0.03, (clientY - rect.top) / rect.height))
    if (dragTarget.current === 'sig2') {
      setSig2({ page, x, y })
    } else {
      setPos({ x, y })
      setPrimaryPage(page)
    }
  }

  // هل نقطة البدء فوق التوقيع الثاني؟ (فيُسحب هو بدل الكتلة الأساسية)
  const hitSig2 = (clientX: number, clientY: number): boolean => {
    const el = containerRef.current
    if (!el || !sig2 || sig2.page !== page || mode === 'stamp') return false
    const rect = el.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    const halfW = sigCssW / cssSize.w / 2
    const halfH = Math.max((sigCssW * 0.4) / cssSize.h / 2, 0.04)
    return Math.abs(x - sig2.x) <= halfW && Math.abs(y - sig2.y) <= halfH
  }

  // مقاس الختم على الشاشة بنفس نسبته الحقيقية في الـPDF
  const k = cssSize.w / pageSizePt.w
  const stampCssW = STAMP_WIDTH_PT * k
  const sigCssW = SIGNATURE_WIDTH_PT * k

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>ماذا يُطبَّق على الخطاب؟ وأين؟</DialogTitle>
        </DialogHeader>

        {/* اختيار ما يُطبَّق: ختم وتوقيع / ختم فقط / توقيع فقط */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(APPLY_MODE_LABELS) as ApplyMode[])
            .filter((m) =>
              m === 'both'
                ? !!stampUrl && !!signatureUrl
                : m === 'stamp'
                  ? !!stampUrl
                  : !!signatureUrl
            )
            .map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? 'default' : 'outline'}
                onClick={() => {
                  setMode(m)
                  if (m === 'stamp') setSig2(null)
                }}
              >
                {APPLY_MODE_LABELS[m]}
              </Button>
            ))}

          {/* توقيع ثانٍ بموضع مستقل (لخطابات تتطلب توقيعين) */}
          {signatureUrl && mode !== 'stamp' && (
            <Button
              size="sm"
              variant="outline"
              className="mr-auto"
              onClick={() =>
                sig2
                  ? setSig2(null)
                  : setSig2({ page: page || pageCount, x: 0.7, y: 0.5 })
              }
            >
              {sig2 ? (
                <X className="h-4 w-4" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
              {sig2 ? 'إزالة التوقيع الثاني' : 'إضافة توقيع ثانٍ'}
            </Button>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          {sig2
            ? 'اسحب كل عنصر لمكانه — التوقيع الثاني مستقل، ويمكن وضعه في صفحة أخرى بالتنقل بين الصفحات.'
            : 'اسحب إلى الموضع المطلوب — أو اضغط على المكان مباشرة.'}
        </p>

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-y-auto rounded-xl border bg-muted/30 p-2">
            <div
              ref={containerRef}
              className="relative mx-auto w-full cursor-crosshair touch-none select-none"
              style={{ maxWidth: 680 }}
              onPointerDown={(e) => {
                dragging.current = true
                dragTarget.current = hitSig2(e.clientX, e.clientY)
                  ? 'sig2'
                  : 'primary'
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                moveTo(e.clientX, e.clientY)
              }}
              onPointerMove={(e) => dragging.current && moveTo(e.clientX, e.clientY)}
              onPointerUp={() => (dragging.current = false)}
            >
              <canvas ref={canvasRef} className="block w-full rounded-lg bg-white shadow-sm" />

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* الختم و/أو التوقيع حسب الاختيار — الكتلة الأساسية تظهر في صفحتها فقط */}
              {!loading && page === primaryPage && stampUrl && mode !== 'signature' && (
                <img
                  src={stampUrl}
                  alt="الختم"
                  draggable={false}
                  className="pointer-events-none absolute opacity-90 drop-shadow-sm"
                  style={{
                    width: stampCssW,
                    left: pos.x * cssSize.w - stampCssW / 2,
                    top: pos.y * cssSize.h - stampCssW / 2,
                  }}
                />
              )}
              {!loading && page === primaryPage && signatureUrl && mode !== 'stamp' && (
                <img
                  src={signatureUrl}
                  alt="التوقيع"
                  draggable={false}
                  className="pointer-events-none absolute opacity-90"
                  style={
                    mode === 'signature'
                      ? {
                          // توقيع فقط: يتمركز على الموضع المختار (مطابق للدمج النهائي)
                          width: sigCssW,
                          left: pos.x * cssSize.w - sigCssW / 2,
                          top: pos.y * cssSize.h - (sigCssW * 0.35) / 2,
                        }
                      : {
                          width: sigCssW,
                          left: pos.x * cssSize.w - sigCssW / 2 - 20 * k,
                          top:
                            pos.y * cssSize.h -
                            stampCssW / 2 -
                            Math.max(stampCssW * 0.55, 30 * k),
                        }
                  }
                />
              )}

              {/* التوقيع الثاني — في صفحته فقط، ويُسحب مستقلاً */}
              {!loading && sig2 && sig2.page === page && signatureUrl && mode !== 'stamp' && (
                <img
                  src={signatureUrl}
                  alt="التوقيع الثاني"
                  draggable={false}
                  className="pointer-events-none absolute opacity-90 outline-dashed outline-1 outline-gold/60"
                  style={{
                    width: sigCssW,
                    left: sig2.x * cssSize.w - sigCssW / 2,
                    top: sig2.y * cssSize.h - (sigCssW * 0.35) / 2,
                  }}
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {/* تنقّل الصفحات (عند تعددها) */}
          {pageCount > 1 ? (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              صفحة {fmtNumber(page)} من {fmtNumber(pageCount)}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button
              variant="gold"
              disabled={loading || !!error || confirming}
              onClick={() =>
                onConfirm(
                  { page: primaryPage || pageCount, x: pos.x, y: pos.y },
                  mode,
                  mode === 'stamp' ? null : sig2
                )
              }
            >
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
