// الملاحظة الصوتية داخل فقاعة النقاش — تُسجَّل من تطبيق الآيفون وتُسمع هنا (طلب المدير 2026-09-14).
// تُميَّز بامتدادها، ومدتها في اسمها («ملاحظة صوتية 0:42.m4a») فتظهر قبل التشغيل — بلا تعديل في القاعدة.
import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Pause, Play } from 'lucide-react'

import { Ltr } from '@/components/Ltr'
import { cn } from '@/lib/utils'

const AUDIO_EXT = ['m4a', 'mp3', 'aac', 'wav']

export function isAudioName(name: string | null | undefined): boolean {
  const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXT.includes(ext)
}

function durationFromName(name: string): number {
  const m = name.replace(/\.[^.]+$/, '').match(/(\d+):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ملاحظة واحدة تُسمع في كل مرة — تشغيل غيرها يوقف السابقة
let current: HTMLAudioElement | null = null

type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export function VoiceNotePlayer({
  name,
  url,
  compact = false,
}: {
  name: string
  url: string | null
  compact?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<PlayState>('idle')
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(() => durationFromName(name))

  // مغادرة النقاش توقف ما يُسمع منه
  useEffect(
    () => () => {
      const a = audioRef.current
      if (a && current === a) {
        a.pause()
        current = null
      }
    },
    []
  )

  const toggle = async () => {
    const a = audioRef.current
    if (!a || !url) return
    if (!a.paused) {
      a.pause()
      return
    }
    if (current && current !== a) current.pause()
    current = a
    try {
      setState('loading')
      await a.play()
    } catch {
      setState('error')
    }
  }

  // الشريط يمتلئ من اليمين في الواجهة العربية، فالنسبة تُحسب من الحافة اليمنى
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (r.right - e.clientX) / r.width))
    a.currentTime = f * dur
    setPos(a.currentTime)
  }

  const fraction = dur > 0 ? Math.min(1, pos / dur) : 0
  const Icon = state === 'playing' ? Pause : Play

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-card px-2.5 py-2',
        compact ? 'mt-1 max-w-[260px]' : 'mt-1.5 max-w-sm'
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={state === 'playing' ? 'إيقاف الملاحظة الصوتية مؤقتاً' : 'تشغيل الملاحظة الصوتية'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold text-navy transition-transform hover:scale-105 disabled:opacity-50"
      >
        {state === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4 fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="موضع التشغيل"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(pos)}
          onClick={seek}
          className="relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-muted"
        >
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-gold"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Mic className="h-3 w-3 shrink-0 text-gold" />
          <Ltr className="tabular-nums">{clock(state === 'idle' ? dur : pos)}</Ltr>
          {state === 'error' && <span className="text-destructive">· تعذّر التشغيل</span>}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDur(d)
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onPlaying={() => setState('playing')}
        onPause={() => setState((s) => (s === 'error' ? s : 'paused'))}
        onEnded={(e) => {
          e.currentTarget.currentTime = 0
          setPos(0)
          setState('idle')
          if (current === e.currentTarget) current = null
        }}
        onError={() => setState('error')}
      />
    </div>
  )
}
