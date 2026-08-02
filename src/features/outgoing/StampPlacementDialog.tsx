// اختيار موضع الختم/التوقيع: عرض صفحة الـPDF الحقيقية (pdf.js) والسحب عليها.
// يدعم أي عدد من التواقيع الإضافية بمواضع مستقلة (وفي صفحات مختلفة).
// كل عنصر يتحرك بالسحب المباشر عليه فقط — الضغط على الفراغ لا ينقل شيئاً
// (حتى لا «يهرب» الختم من صفحته عند التنقل بين الصفحات).
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
  initialSigs = [],
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
  initialSigs?: StampPosition[]
  onConfirm: (
    pos: StampPosition,
    mode: ApplyMode,
    sigs: StampPosition[]
  ) => void
  confirmLabel?: string
  confirming?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  // ما الذي يُسحب: الكتلة الأساسية أو رقم توقيع إضافي — null = لا شيء
  const dragTarget = useRef<'primary' | number | null>(null)

  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<ApplyMode>(initialMode)
  const [pos, setPos] = useState({ x: DEFAULT_STAMP_POS.x, y: DEFAULT_STAMP_POS.y })
  // صفحة الكتلة الأساسية (قد يتنقل المستخدم لصفحات أخرى لوضع بقية التواقيع)
  const [primaryPage, setPrimaryPage] = useState(1)
  const [sigs, setSigs] = useState<StampPosition[]>([])
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
    setSigs(initialSigs ?? [])
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

  // إحداثيات النقطة بكسور الصفحة
  const toFrac = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
  }

  // السحب: تحديث مركز العنصر الممسوك فقط
  const moveTo = (clientX: number, clientY: number) => {
    if (cssSize.w === 0 || dragTarget.current === null) return
    const p = toFrac(clientX, clientY)
    if (!p) return
    const x = Math.min(0.97, Math.max(0.03, p.x))
    const y = Math.min(0.97, Math.max(0.03, p.y))
    if (dragTarget.current === 'primary') {
      setPos({ x, y })
    } else {
      const i = dragTarget.current
      setSigs((arr) => arr.map((s, j) => (j === i ? { page, x, y } : s)))
    }
  }

  // تحديد العنصر الممسوك عند بدء الضغط (الأحدث أولاً) — لا شيء = لا سحب
  const findTarget = (clientX: number, clientY: number): 'primary' | number | null => {
    const p = toFrac(clientX, clientY)
    if (!p || cssSize.w === 0) return null
    const halfW = sigCssW / cssSize.w / 2
    const halfH = Math.max((sigCssW * 0.4) / cssSize.h / 2, 0.045)
    if (mode !== 'stamp') {
      for (let i = sigs.length - 1; i >= 0; i--) {
        const s = sigs[i]
        if (s.page !== page) continue
        if (Math.abs(p.x - s.x) <= halfW && Math.abs(p.y - s.y) <= halfH) return i
      }
    }
    // الكتلة الأساسية (في صفحتها فقط) — صندوق يغطي الختم/التوقيع
    if (page === primaryPage) {
      const halfPW = Math.max(stampCssW, mode === 'signature' ? sigCssW : 0) / cssSize.w / 2
      const halfPH = Math.max((stampCssW * 1.2) / cssSize.h / 2, 0.06)
      if (Math.abs(p.x - pos.x) <= halfPW && Math.abs(p.y - pos.y) <= halfPH)
        return 'primary'
    }
    return null
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
                  if (m === 'stamp') setSigs([])
                }}
              >
                {APPLY_MODE_LABELS[m]}
              </Button>
            ))}

          {/* تواقيع إضافية بلا حد (لخطابات تتطلب عدة تواقيع) */}
          {signatureUrl && mode !== 'stamp' && (
            <div className="mr-auto flex items-center gap-1.5">
              {sigs.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setSigs((arr) => arr.slice(0, -1))}
                >
                  <X className="h-4 w-4" />
                  إزالة آخر توقيع
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSigs((arr) => [
                    ...arr,
                    {
                      page: page || pageCount,
                      // إزاحة بسيطة لكل توقيع جديد حتى لا تتكدس فوق بعضها
                      x: Math.min(0.85, 0.6 + (arr.length % 3) * 0.12),
                      y: Math.min(0.85, 0.45 + Math.floor(arr.length / 3) * 0.12),
                    },
                  ])
                }
              >
                <PenLine className="h-4 w-4" />
                إضافة توقيع ({fmtNumber(sigs.length + 1)})
              </Button>
            </div>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          {sigs.length > 0
            ? `أمسك أي عنصر واسحبه لمكانه — كل توقيع مستقل وبإمكانه أن يكون في صفحة أخرى (تنقّل بالأسهم). كل عنصر يبقى في صفحته.`
            : 'أمسك الختم/التوقيع واسحبه إلى الموضع المطلوب.'}
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
                const target = findTarget(e.clientX, e.clientY)
                dragTarget.current = target
                dragging.current = target !== null
                if (target !== null) {
                  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                  moveTo(e.clientX, e.clientY)
                }
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

              {/* التواقيع الإضافية — كلٌّ في صفحته، ويُسحب مستقلاً، مع رقمه */}
              {!loading &&
                signatureUrl &&
                mode !== 'stamp' &&
                sigs.map((s, i) =>
                  s.page === page ? (
                    <div
                      key={i}
                      className="pointer-events-none absolute"
                      style={{
                        width: sigCssW,
                        left: s.x * cssSize.w - sigCssW / 2,
                        top: s.y * cssSize.h - (sigCssW * 0.35) / 2,
                      }}
                    >
                      <img
                        src={signatureUrl}
                        alt={`توقيع ${i + 2}`}
                        draggable={false}
                        className="w-full opacity-90 outline-dashed outline-1 outline-gold/60"
                      />
                      <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-navy shadow">
                        {fmtNumber(i + 2)}
                      </span>
                    </div>
                  ) : null
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
              {/* الكتلة الأساسية تنتقل بين الصفحات بهذا الزر فقط (لا بالضغط على الفراغ) */}
              {page !== primaryPage && !loading && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setPrimaryPage(page)}
                >
                  <Move className="h-3.5 w-3.5" />
                  {mode === 'signature' ? 'نقل التوقيع لهذه الصفحة' : 'نقل الختم لهذه الصفحة'}
                </Button>
              )}
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
                  mode === 'stamp' ? [] : sigs
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
