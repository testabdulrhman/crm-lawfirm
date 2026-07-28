import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Briefcase,
  FolderCheck,
  FolderClock,
  BookUser,
  FileSignature,
  ListTodo,
  CalendarDays,
  CalendarClock,
  Inbox,
  AlertTriangle,
  Flame,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { categoryLabel } from '@/lib/contactLabels'
import { caseTypeLabel } from '@/lib/caseLabels'
import { useReportsOverview, useReportsByAssignee } from '@/hooks/useReports'
import type { NameValue } from '@/types/db'

const COLORS = [
  '#C9A84C',
  '#111D3A',
  '#2A9D8F',
  '#3B82F6',
  '#E76F51',
  '#8B5CF6',
  '#F4A261',
  '#06B6D4',
  '#EF4444',
  '#10B981',
]

export function ReportsPage() {
  const { data, isLoading, refetch, isFetching } = useReportsOverview()
  const { data: byAssignee, isLoading: loadingAssignee } = useReportsByAssignee()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          التقارير والإحصاءات
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          تحديث
        </Button>
      </div>

      {/* تنبيهات */}
      {!isLoading && data && (data.expiring_poas > 0 || data.urgent_tasks > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.expiring_poas > 0 && (
            <AlertCard
              icon={AlertTriangle}
              tone="amber"
              text={`${fmtNumber(data.expiring_poas)} وكالة تنتهي خلال 30 يوماً`}
            />
          )}
          {data.urgent_tasks > 0 && (
            <AlertCard
              icon={Flame}
              tone="red"
              text={`${fmtNumber(data.urgent_tasks)} مهمة عاجلة مفتوحة`}
            />
          )}
        </div>
      )}

      {/* بطاقات KPI */}
      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard label="إجمالي القضايا" value={data.cases_total} icon={Briefcase} tone="navy" />
          <StatCard label="القضايا الجارية" value={data.cases_active} icon={FolderClock} tone="green" />
          <StatCard label="القضايا المنتهية" value={data.cases_closed} icon={FolderCheck} tone="gray" />
          <StatCard label="جهات الاتصال" value={data.contacts_total} icon={BookUser} tone="gold" />
          <StatCard label="الوكالات السارية" value={data.active_poas} icon={FileSignature} tone="navy" />
          <StatCard label="المهام المفتوحة" value={data.open_tasks} icon={ListTodo} tone="blue" />
          <StatCard label="الجلسات القادمة" value={data.upcoming_sessions} icon={CalendarDays} tone="gold" />
          <StatCard label="المواعيد القادمة" value={data.upcoming_appointments} icon={CalendarClock} tone="green" />
          <StatCard label="طلبات قيد الدراسة" value={data.pending_requests} icon={Inbox} tone="amber" />
        </div>
      )}

      {/* الرسوم */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="القضايا حسب النوع">
          {data ? (
            <DonutChart
              data={(data.cases_by_type ?? []).map((d) => ({
                name: caseTypeLabel(d.name === 'null' ? '' : d.name),
                value: d.value,
              }))}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </ChartCard>

        <ChartCard title="حالة القضايا">
          {data ? (
            <DonutChart
              data={[
                { name: 'جارية', value: data.cases_active },
                { name: 'معلّقة', value: data.cases_suspended },
                { name: 'منتهية', value: data.cases_closed },
              ]}
              colors={['#10B981', '#F4A261', '#94A3B8']}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </ChartCard>

        <ChartCard title="القضايا حسب الشهر (آخر 12 شهراً)">
          {data ? (
            <MonthBarChart data={data.cases_by_month ?? []} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </ChartCard>

        <ChartCard title="جهات الاتصال حسب التصنيف">
          {data ? (
            <DonutChart
              data={(data.contacts_by_category ?? []).map((d) => ({
                name: categoryLabel(d.name),
                value: d.value,
              }))}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </ChartCard>
      </div>

      {/* جدول أداء المسؤولين */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أداء المحامين المسؤولين</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAssignee ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المحامي</TableHead>
                  <TableHead className="text-center">عدد القضايا</TableHead>
                  <TableHead className="text-center">المهام المفتوحة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(byAssignee ?? []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground">
                      {r.assignee_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {fmtNumber(r.cases_count)}
                    </TableCell>
                    <TableCell className="text-center">
                      {fmtNumber(r.open_tasks)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ===================== مكوّنات ===================== */

const TONES: Record<string, string> = {
  navy: 'text-navy bg-navy/10 dark:text-navy-100 dark:bg-navy-100/10',
  gold: 'text-gold-600 bg-gold/15 dark:text-gold-300',
  green: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300',
  gray: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
  blue: 'text-blue-600 bg-blue-500/10 dark:text-blue-300',
  amber: 'text-amber-600 bg-amber-500/10 dark:text-amber-300',
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: keyof typeof TONES | string
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {fmtNumber(value)}
          </p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            TONES[tone] ?? TONES.gold
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function AlertCard({
  icon: Icon,
  text,
  tone,
}: {
  icon: LucideIcon
  text: string
  tone: 'amber' | 'red'
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border p-3 text-sm font-medium',
        tone === 'amber'
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {text}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function DonutChart({
  data,
  colors = COLORS,
}: {
  data: NameValue[]
  colors?: string[]
}) {
  const filtered = data.filter((d) => d.value > 0)
  if (filtered.length === 0) {
    return <EmptyChart />
  }
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip            contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 8 }}
          />
          <Legend
            wrapperStyle={{ direction: 'rtl', fontSize: 12 }}
            formatter={(value) => <span className="text-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function MonthBarChart({
  data,
}: {
  data: { month: string; value: number }[]
}) {
  // الأقدم → الأحدث (الـ RPC يُرجع تنازلياً)
  const ordered = [...data].reverse()
  if (ordered.length === 0) return <EmptyChart />
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={ordered} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip            contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 8 }}
            labelStyle={{ direction: 'ltr' }}
          />
          <Bar dataKey="value" fill="#C9A84C" radius={[4, 4, 0, 0]} name="قضايا" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      لا توجد بيانات كافية
    </div>
  )
}
