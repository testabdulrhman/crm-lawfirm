// ملخص طقس بريدة بجانب التحية في لوحة التحكم — الحرارة وحالة الجو والعظمى والصغرى.
// يُعرض داخل لوحة البطل الكحلية، فألوانه بيضاء شفافة على نمط أزرار النطاق بجانبه.
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'

import { Ltr } from '@/components/Ltr'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useBuraydahWeather, weatherCondition } from '@/hooks/useBuraydahWeather'

function iconFor(code: number, isDay: boolean): LucideIcon {
  if (code <= 1) return isDay ? Sun : Moon
  if (code === 2) return isDay ? CloudSun : CloudMoon
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

export function WeatherBadge({ className }: { className?: string }) {
  const { data: w } = useBuraydahWeather()
  if (!w) return null

  const t = Math.round(w.temp)
  const mx = Math.round(w.max)
  const mn = Math.round(w.min)
  const cond = weatherCondition(w.code, w.isDay)
  const Icon = iconFor(w.code, w.isDay)

  return (
    <div
      role="group"
      aria-label={`طقس بريدة: ${t} درجة، ${cond}، العظمى ${mx} والصغرى ${mn}`}
      className={cn(
        'flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-2 ring-1 ring-inset ring-white/10 backdrop-blur-sm',
        className
      )}
    >
      <Icon className="h-7 w-7 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />
      <div className="leading-tight">
        <p className="text-[22px] font-bold">
          <Ltr>{fmtNumber(t)}°</Ltr>
        </p>
        <p className="whitespace-nowrap text-xs text-white/60">بريدة · {cond}</p>
      </div>
      <div className="space-y-0.5 border-s border-white/15 ps-3 text-xs leading-5 text-white/55">
        <p className="whitespace-nowrap">
          العظمى <Ltr className="font-semibold text-white">{fmtNumber(mx)}°</Ltr>
        </p>
        <p className="whitespace-nowrap">
          الصغرى <Ltr className="font-semibold text-white">{fmtNumber(mn)}°</Ltr>
        </p>
      </div>
    </div>
  )
}
