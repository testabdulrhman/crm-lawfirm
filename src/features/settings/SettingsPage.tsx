import { Building2, Tags, Palette, Moon, Sun } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/stores/theme'
import { OfficeInfoTab } from './OfficeInfoTab'
import { LookupsTab } from './LookupsTab'

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
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            المظهر
          </TabsTrigger>
          {/* تبويبات قادمة: قوالب الرسائل، SMS، مزامنة التقويم، مستندات المكتب... */}
        </TabsList>

        <TabsContent value="office">
          <OfficeInfoTab />
        </TabsContent>

        <TabsContent value="lookups">
          <LookupsTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AppearanceTab() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Card>
      <CardContent className="pt-6">
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
        {/* placeholder للمزيد لاحقاً: حجم الخط، كثافة الجداول، لون التمييز... */}
      </CardContent>
    </Card>
  )
}
