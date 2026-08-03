import {
  Building2,
  Tags,
  Palette,
  Moon,
  Sun,
  CalendarDays,
  CalendarCheck,
  MessageSquareText,
  UserCircle2,
  type LucideIcon,
} from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { usePageState } from '@/hooks/usePageState'
import { IntegrationsTab } from './IntegrationsTab'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from '@/stores/theme'
import { usePrefs, type DateDisplay } from '@/stores/prefs'
import { fmtDatePref, todayISO } from '@/lib/format'
import { OfficeInfoTab } from './OfficeInfoTab'
import { LookupsTab } from './LookupsTab'
import { TemplatesTab } from './TemplatesTab'
import { AccountTab } from './AccountTab'

// المستوى الأول: مجموعتان — والثاني: تبويبات كل مجموعة
interface TabDef {
  value: string
  label: string
  icon: LucideIcon
}
const PERSONAL_TABS: TabDef[] = [
  { value: 'account', label: 'حسابي', icon: UserCircle2 },
  { value: 'appearance', label: 'المظهر', icon: Palette },
]
const OFFICE_TABS: TabDef[] = [
  { value: 'office', label: 'بيانات المكتب', icon: Building2 },
  { value: 'lookups', label: 'التصنيفات', icon: Tags },
  { value: 'templates', label: 'قوالب الرسائل', icon: MessageSquareText },
  { value: 'integrations', label: 'التكاملات', icon: CalendarCheck },
]
const GROUPS = [
  {
    key: 'personal' as const,
    label: 'إعداداتي',
    icon: UserCircle2,
    hint: 'تخصّك وحدك ولا تؤثر على بقية الموظفين',
    tabs: PERSONAL_TABS,
  },
  {
    key: 'office' as const,
    label: 'إعدادات المكتب',
    icon: Building2,
    hint: 'مشتركة — تظهر لجميع الموظفين',
    tabs: OFFICE_TABS,
  },
]

export function SettingsPage() {
  // التبويب المفتوح يدوم للرجوع/التحديث — والمجموعة تُشتق منه (مصدر واحد للحقيقة)
  const [tab, setTab] = usePageState('settings:tab', 'account')
  const group =
    OFFICE_TABS.some((t) => t.value === tab) ? GROUPS[1] : GROUPS[0]

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الإعدادات</h2>
        <p className="mt-1 text-sm text-muted-foreground">{group.hint}</p>
      </div>

      {/* المستوى الأول: إعداداتي / إعدادات المكتب */}
      <div className="inline-flex rounded-2xl border bg-card p-1">
        {GROUPS.map((g) => {
          const Icon = g.icon
          const active = g.key === group.key
          return (
            <button
              key={g.key}
              onClick={() => setTab(g.tabs[0].value)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-gold text-navy shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {g.label}
            </button>
          )
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        {/* المستوى الثاني: تبويبات المجموعة المختارة */}
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max justify-start gap-1">
            {group.tabs.map((t) => {
              const Icon = t.icon
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {t.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
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

        <TabsContent value="account">
          <AccountTab />
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
