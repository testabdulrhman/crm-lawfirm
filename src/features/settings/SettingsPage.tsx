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
import { usePageState } from '@/hooks/usePageState'
import { IntegrationsTab } from './IntegrationsTab'
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
  // التبويب المفتوح يدوم للرجوع/التحديث
  const [tab, setTab] = usePageState('settings:tab', 'office')
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الإعدادات</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          إعداداتك الشخصية، وإعدادات المكتب المشتركة
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        {/* مجموعتان: ما يخص المستخدم وحده، وما يخص المكتب كله */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
              إعدادات خاصة بك
            </p>
            <TabsList className="flex w-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="appearance" className="gap-2">
                <Palette className="h-4 w-4" />
                المظهر
              </TabsTrigger>
            </TabsList>
          </div>
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
              إعدادات المكتب (مشتركة للجميع)
            </p>
            <TabsList className="flex w-auto flex-wrap justify-start gap-1">
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
              <TabsTrigger value="integrations" className="gap-2">
                <CalendarCheck className="h-4 w-4" />
                التكاملات
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

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
