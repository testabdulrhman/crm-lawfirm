// طقس بريدة بجانب التحية (طلب المدير 2026-09-14: «ملخص طقس بريدة بجانب التحية: الحرارة، حالة
// الجو، والعظمى والصغرى»). المصدر Open-Meteo: مجاني بلا مفتاح — فلا سرّ في الكود — ويُطلب
// بإحداثيات بريدة وحدها بلا أي بيانات عن المكتب أو المستخدم. ثانوي: إن تعذّر لا يظهر شيء.
import { useQuery } from '@tanstack/react-query'

export interface BuraydahWeather {
  temp: number
  code: number
  isDay: boolean
  max: number
  min: number
}

const ENDPOINT =
  'https://api.open-meteo.com/v1/forecast?latitude=26.326&longitude=43.975' +
  '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min' +
  '&timezone=Asia%2FRiyadh&forecast_days=1'

export function useBuraydahWeather() {
  return useQuery({
    queryKey: ['weather', 'buraydah'],
    staleTime: 30 * 60_000, // الطقس لا يتغيّر كل دقيقة
    refetchInterval: 30 * 60_000,
    retry: 1,
    queryFn: async (): Promise<BuraydahWeather> => {
      const res = await fetch(ENDPOINT)
      if (!res.ok) throw new Error(`تعذّر جلب الطقس (${res.status})`)
      const j = await res.json()
      return {
        temp: j.current.temperature_2m,
        code: j.current.weather_code,
        isDay: j.current.is_day === 1,
        max: j.daily.temperature_2m_max[0],
        min: j.daily.temperature_2m_min[0],
      }
    },
  })
}

/** رموز WMO إلى وصف عربي */
export function weatherCondition(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'مشمس' : 'صافٍ'
  if (code === 1) return 'صحو غالباً'
  if (code === 2) return 'غائم جزئياً'
  if (code === 3) return 'غائم'
  if (code === 45 || code === 48) return 'ضباب'
  if (code >= 51 && code <= 55) return 'رذاذ'
  if (code === 56 || code === 57) return 'رذاذ متجمّد'
  if (code === 61) return 'مطر خفيف'
  if (code === 63) return 'مطر'
  if (code === 65) return 'مطر غزير'
  if (code === 66 || code === 67) return 'مطر متجمّد'
  if (code >= 71 && code <= 77) return 'ثلج'
  if (code === 80 || code === 81) return 'زخات مطر'
  if (code === 82) return 'زخات غزيرة'
  if (code === 85 || code === 86) return 'زخات ثلج'
  if (code === 95) return 'عاصفة رعدية'
  if (code === 96 || code === 99) return 'عاصفة رعدية مع برد'
  return 'غير معروف'
}
