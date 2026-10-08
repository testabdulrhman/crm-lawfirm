import {
  Building2,
  Tags,
  Trash2,
  Palette,
  Moon,
  Sun,
  CalendarDays,
  CalendarCheck,
  MessageSquareText,
  FileType2,
  UserCircle2,
  BellRing,
  type LucideIcon,
} from 'lucide-react'

import { Tabs, TabsContent } from '@/components/ui/tabs'
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
import { AccountTab } from './AccountTab'
import { BookingTab } from './BookingTab'
import { ContractTemplatesTab } from './ContractTemplatesTab'
import { TrashTab } from './TrashTab'
import { NotificationRulesTab } from './NotificationRulesTab'
import { useIsDirector } from '@/hooks/useIsDirector'
import { SideTabsLayout } from '@/components/layout/SideTabs'

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
  { value: 'contract-templates', label: 'قوالب العقود', icon: FileType2 },
  { value: 'booking', label: 'حجز المواعيد', icon: CalendarDays },
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
  const isDirector = useIsDirector()
  // سلة الاسترجاع للمدير وحده — الدوال الخادمية تفرض ذلك أيضاً
  // قواعد الإشعارات وسلة الاسترجاع للمدير وحده — والقاعدة تفرض ذلك أيضاً
  const officeTabs = isDirector
    ? [
        ...OFFICE_TABS,
        { value: 'notification-rules', label: 'قواعد الإشعارات', icon: BellRing },
        { value: 'trash', label: 'سلة الاسترجاع', icon: Trash2 },
      ]
    : OFFICE_TABS
  const group =
    officeTabs.some((t) => t.value === tab)
      ? { ...GROUPS[1], tabs: officeTabs }
      : GROUPS[0]

  const groups = [GROUPS[0], { ...GROUPS[1], tabs: officeTabs }]
  const current = group.tabs.find((t) => t.value === tab) ?? group.tabs[0]

  return (
    // التقسيمات على اليمين مثل «مركز المتابعة» (طلب المدير 2026-10-08: «والإعدادات نفس الطريقة خل التقسيم سلايد
    // على اليمين»)
    <SideTabsLayout groups={groups} value={current.value} onChange={setTab}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{current.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {group.label} · {group.hint}
        </p>
      </div>

      <Tabs value={current.value} onValueChange={setTab} dir="rtl">
        {/* forceMount: التبويبان يحملان نماذج — التفكيك يُفقد التعديلات غير المحفوظة */}
        <TabsContent value="office" forceMount className="data-[state=inactive]:hidden">
          <OfficeInfoTab />
        </TabsContent>

        <TabsContent value="lookups">
          <LookupsTab />
        </TabsContent>

        <TabsContent value="templates" forceMount className="data-[state=inactive]:hidden">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="contract-templates">
          <ContractTemplatesTab />
        </TabsContent>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="booking">
          <BookingTab />
        </TabsContent>

        <TabsContent value="notification-rules">
          <NotificationRulesTab />
        </TabsContent>

        <TabsContent value="trash">
          <TrashTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </SideTabsLayout>
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
          <Switch
            checked={isDark}
            onCheckedChange={toggle}
            aria-label="الوضع الليلي"
          />
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
