import {
  Building2,
  Tags,
  Palette,
  Moon,
  Sun,
  CalendarDays,
  CalendarCheck,
  MessageSquareText,
} from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/stores/theme'
import { usePrefs, type DateDisplay } from '@/stores/prefs'
import { fmtDatePref, todayISO } from '@/lib/format'
import { OfficeInfoTab } from './OfficeInfoTab'
import { LookupsTab } from './LookupsTab'
import { TemplatesTab } from './TemplatesTab'

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground">الإعدادات</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة بيانات المكتب والتصنيفات ومظهر النظام
        </p>
      </div>

      <Tabs defaultValue="office" dir="rtl">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="office" className="gap-2">
            <Building2 className="h-4 w-4" />
            بيانات المكتب
          </TabsTrigger>
          <TabsTrigger value="lookups" className="gap-2">
            <Tags className="h-4 w-4" />
            التصنيفات
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <MessageSquareText className="h-4 w-4" />
            قوالب الرسائل
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            المظهر
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <CalendarCheck className="h-4 w-4" />
            التكاملات
          </TabsTrigger>
          {/* تبويبات قادمة: قوالب الرسائل، SMS، مستندات المكتب... */}
        </TabsList>

        <TabsContent value="office">
          <OfficeInfoTab />
        </TabsContent>

        <TabsContent value="lookups">
          <LookupsTab />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function IntegrationsTab() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <CalendarCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">Google Calendar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              مزامنة تلقائية مفعّلة: عند إضافة جلسة أو موعد يُنشأ حدث في تقويم
              المكتب (الجلسات بلون أزرق، المواعيد بلون أخضر، تذكير منبثق قبل ١٠
              دقائق). يُحذف الحدث عند حذف الجلسة/الموعد. تظهر علامة «في التقويم»
              على العناصر المزامَنة.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              تتم المزامنة عبر خدمة آمنة في الخادم؛ لا حاجة لإعداد أي مفاتيح هنا.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const DATE_DISPLAY_OPTIONS: { value: DateDisplay; label: string }[] = [
  { value: 'dual', label: 'ميلادي + هجري' },
  { value: 'hijri', label: 'هجري فقط' },
  { value: 'gregorian', label: 'ميلادي فقط' },
]

function AppearanceTab() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  const dateDisplay = usePrefs((s) => s.dateDisplay)
  const setDateDisplay = usePrefs((s) => s.setDateDisplay)

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {isDark ? (
                <Moon className="h-5 w-5 text-gold" />
              ) : (
                <Sun className="h-5 w-5 text-gold" />
              )}
            </div>
            <div>
              <p className="font-medium text-foreground">الوضع الليلي</p>
              <p className="text-sm text-muted-foreground">
                التبديل بين الوضع النهاري والليلي (يُحفظ تلقائياً)
              </p>
            </div>
          </div>
          <Switch checked={isDark} onCheckedChange={toggle} />
        </div>

        {/* عرض التاريخ */}
        <div className="border-t pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <CalendarDays className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="font-medium text-foreground">عرض التاريخ</p>
              <p className="text-sm text-muted-foreground">
                التخزين ميلادي دائماً؛ هذا للعرض فقط (يُحفظ تلقائياً)
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DATE_DISPLAY_OPTIONS.map((o) => (
              <Button
                key={o.value}
                size="sm"
                variant={dateDisplay === o.value ? 'default' : 'outline'}
                onClick={() => setDateDisplay(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            مثال: {fmtDatePref(todayISO())}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
