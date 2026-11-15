import { lazy, Suspense, useEffect, useRef } from 'react'
import { Route, Switch, Redirect, Router, useLocation, Link } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { hasNewBuild, reloadForNewBuild } from '@/lib/staleBuild'
import { useIsCollaborator } from '@/hooks/useIsCollaborator'
import { AppLayout } from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Booking from '@/pages/Booking'
import Privacy from '@/pages/Privacy'
import Dashboard from '@/pages/Dashboard'
import { MonitorShell } from '@/components/layout/MonitorShell'

// كل صفحة تُحمَّل حين تُفتح (المراجعة الشاملة 2026-11-15، الدفعة ٤): كانت الخمسون صفحة ومكتباتها في ملف واحد
// ٣٫٦ م.ب يُنزَّل قبل أن يظهر شيء. الرئيسية وصفحات ما قبل الدخول تبقى فورية؛ وجزء نسخة قديمة يعالجه staleBuild.
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TeamPage = lazy(() => import('@/features/team/TeamPage').then((m) => ({ default: m.TeamPage })))
const IncomingMessagesPage = lazy(() => import('@/features/inbox/IncomingMessagesPage').then((m) => ({ default: m.IncomingMessagesPage })))
const MailPage = lazy(() => import('@/features/mail/MailPage').then((m) => ({ default: m.MailPage })))
const TeamMemberDetail = lazy(() => import('@/features/team/TeamMemberDetail').then((m) => ({ default: m.TeamMemberDetail })))
const RequestsPage = lazy(() => import('@/features/requests/RequestsPage').then((m) => ({ default: m.RequestsPage })))
const RequestDetail = lazy(() => import('@/features/requests/RequestDetail').then((m) => ({ default: m.RequestDetail })))
const StaffApplicationsPage = lazy(() => import('@/features/staff-applications/StaffApplicationsPage').then((m) => ({ default: m.StaffApplicationsPage })))
const ApplicationDetail = lazy(() => import('@/features/staff-applications/ApplicationDetail').then((m) => ({ default: m.ApplicationDetail })))
const ContactsPage = lazy(() => import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })))
const ContactDetail = lazy(() => import('@/features/contacts/ContactDetail').then((m) => ({ default: m.ContactDetail })))
const CasesPage = lazy(() => import('@/features/cases/CasesPage').then((m) => ({ default: m.CasesPage })))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })))
const TaskRoomPage = lazy(() => import('@/features/tasks/TaskRoomPage').then((m) => ({ default: m.TaskRoomPage })))
const EngagementsPage = lazy(() => import('@/features/engagements/EngagementsPage').then((m) => ({ default: m.EngagementsPage })))
const EngagementDetail = lazy(() => import('@/features/engagements/EngagementDetail').then((m) => ({ default: m.EngagementDetail })))
const CaseDetail = lazy(() => import('@/features/cases/CaseDetail').then((m) => ({ default: m.CaseDetail })))
const CaseNewPage = lazy(() => import('@/features/cases/CaseNewPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const MattersPage = lazy(() => import('@/features/matters/MattersPage').then((m) => ({ default: m.MattersPage })))
const DiscussionsPage = lazy(() => import('@/features/discussions/DiscussionsPage').then((m) => ({ default: m.DiscussionsPage })))
const ClientChatsPage = lazy(() => import('@/features/clients/ClientChatsPage').then((m) => ({ default: m.ClientChatsPage })))
const SessionsPage = lazy(() => import('@/features/sessions/SessionsPage').then((m) => ({ default: m.SessionsPage })))
const POAsPage = lazy(() => import('@/features/poa/POAsPage').then((m) => ({ default: m.POAsPage })))
const POADetail = lazy(() => import('@/features/poa/POADetail').then((m) => ({ default: m.POADetail })))
const LegalServicesPage = lazy(() => import('@/features/legal-services/LegalServicesPage').then((m) => ({ default: m.LegalServicesPage })))
const LegalServiceDetail = lazy(() => import('@/features/legal-services/LegalServiceDetail').then((m) => ({ default: m.LegalServiceDetail })))
const PropertyTransfersPage = lazy(() => import('@/features/property/PropertyTransfersPage').then((m) => ({ default: m.PropertyTransfersPage })))
const PropertyTransferDetail = lazy(() => import('@/features/property/PropertyTransferDetail').then((m) => ({ default: m.PropertyTransferDetail })))
const AppointmentsPage = lazy(() => import('@/features/appointments/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })))
const AppointmentDetail = lazy(() => import('@/features/appointments/AppointmentDetail').then((m) => ({ default: m.AppointmentDetail })))
const OutgoingLettersPage = lazy(() => import('@/features/outgoing/OutgoingLettersPage').then((m) => ({ default: m.OutgoingLettersPage })))
const OutgoingLetterDetail = lazy(() => import('@/features/outgoing/OutgoingLetterDetail').then((m) => ({ default: m.OutgoingLetterDetail })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const UsagePage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.UsagePage })))
const ErrorLogPage = lazy(() => import('@/features/settings/ErrorLogPage').then((m) => ({ default: m.ErrorLogPage })))
const AssistantLogPage = lazy(() => import('@/features/settings/AssistantLogPage').then((m) => ({ default: m.AssistantLogPage })))
const ChangeRequestsPage = lazy(() => import('@/features/change-requests/ChangeRequestsPage').then((m) => ({ default: m.ChangeRequestsPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const OfficeDocumentsPage = lazy(() => import('@/features/office-docs/OfficeDocumentsPage').then((m) => ({ default: m.OfficeDocumentsPage })))
const ResearchPage = lazy(() => import('@/features/research/ResearchPage').then((m) => ({ default: m.ResearchPage })))
const CleanupPage = lazy(() => import('@/features/cleanup/CleanupPage').then((m) => ({ default: m.CleanupPage })))
const HrRequestsPage = lazy(() => import('@/features/hr/HrRequestsPage').then((m) => ({ default: m.HrRequestsPage })))
const HubMonitorPage = lazy(() => import('@/features/hub/HubMonitorPage').then((m) => ({ default: m.HubMonitorPage })))

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-gold" />
    </div>
  )
}

/**
 * المتعاون الخارجي: تحويل من صفحات المكتب إلى لوحته.
 * ⚠️ تجميلي فقط — الحاجز الحقيقي سياسات RLS؛ هذا يمنع صفحةً فارغة محيّرة.
 */
const COLLAB_BLOCKED = [
  '/contacts', '/inbox', '/mail', '/requests', '/staff-applications',
  '/engagements', '/poa', '/appointments', '/outgoing', '/team',
  '/reports', '/settings', '/hr', '/errors', '/hub', '/change-requests', '/usage',
]

function CollaboratorGuard() {
  const isCollaborator = useIsCollaborator()
  const [location, navigate] = useLocation()
  useEffect(() => {
    if (!isCollaborator) return
    if (COLLAB_BLOCKED.some((p) => location.startsWith(p))) navigate('/')
  }, [isCollaborator, location, navigate])
  return null
}

/** أثناء تحميل جزء الصفحة لأول مرة — داخل الإطار فلا يومض الشريط الجانبي */
function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

// المسارات المحمية داخل الإطار
function ProtectedRoutes() {
  return (
    <AppLayout>
      <CollaboratorGuard />
      <Suspense fallback={<PageLoading />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        {/* قبل /cases/:id ضرورةً — وإلا فُهمت «new» معرّف قضية */}
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/matters" component={MattersPage} />
        <Route path="/discussions" component={DiscussionsPage} />
        <Route path="/clients" component={ClientChatsPage} />
        <Route path="/research" component={ResearchPage} />
        <Route path="/cleanup" component={CleanupPage} />
        <Route path="/cases/new" component={CaseNewPage} />
        <Route path="/cases/:id">
          {(params) => <CaseDetail id={params.id} />}
        </Route>
        <Route path="/cases" component={CasesPage} />
        <Route path="/tasks/:id">
          {(params) => <TaskRoomPage id={params.id} />}
        </Route>
        <Route path="/tasks" component={TasksPage} />
        <Route path="/engagements/:id">
          {(params) => <EngagementDetail id={params.id} />}
        </Route>
        <Route path="/engagements" component={EngagementsPage} />
        <Route path="/sessions" component={SessionsPage} />
        <Route path="/poa/:id">
          {(params) => <POADetail id={params.id} />}
        </Route>
        <Route path="/poa" component={POAsPage} />
        <Route path="/legal-services/:id">
          {(params) => <LegalServiceDetail id={params.id} />}
        </Route>
        <Route path="/legal-services" component={LegalServicesPage} />
        <Route path="/property/:id">
          {(params) => <PropertyTransferDetail id={params.id} />}
        </Route>
        <Route path="/property" component={PropertyTransfersPage} />
        <Route path="/appointments/:id">
          {(params) => <AppointmentDetail id={params.id} />}
        </Route>
        <Route path="/appointments" component={AppointmentsPage} />
        <Route path="/outgoing/:id">
          {(params) => <OutgoingLetterDetail id={params.id} />}
        </Route>
        <Route path="/outgoing" component={OutgoingLettersPage} />
        <Route path="/reports" component={ReportsPage} />
        {/* «مركز المتابعة»: الأربع تحت تبويب واحد بتبويبات داخلية (2026-10-08) */}
        <Route path="/monitor">{() => <Redirect to="/change-requests" />}</Route>
        <Route path="/errors">{() => <MonitorShell><ErrorLogPage /></MonitorShell>}</Route>
        <Route path="/assistant-log">{() => <MonitorShell><AssistantLogPage /></MonitorShell>}</Route>
        <Route path="/usage">{() => <MonitorShell><UsagePage /></MonitorShell>}</Route>
        <Route path="/change-requests">{() => <MonitorShell><ChangeRequestsPage /></MonitorShell>}</Route>
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/office-documents" component={OfficeDocumentsPage} />
        <Route path="/hub">{() => <MonitorShell><HubMonitorPage /></MonitorShell>}</Route>
        <Route path="/hr" component={HrRequestsPage} />
        <Route path="/inbox" component={IncomingMessagesPage} />
        <Route path="/mail" component={MailPage} />
        <Route path="/team/:id">
          {(params) => <TeamMemberDetail id={params.id} />}
        </Route>
        <Route path="/team" component={TeamPage} />
        <Route path="/contacts/:id">
          {(params) => <ContactDetail id={params.id} />}
        </Route>
        <Route path="/contacts" component={ContactsPage} />
        <Route path="/requests/:id">
          {(params) => <RequestDetail id={params.id} />}
        </Route>
        <Route path="/requests" component={RequestsPage} />
        <Route path="/staff-applications/:id">
          {(params) => <ApplicationDetail id={params.id} />}
        </Route>
        <Route path="/staff-applications" component={StaffApplicationsPage} />
        <Route path="/settings" component={SettingsPage} />
        {/* مسار غير معروف: تفسير + مخرج — روابط SMS القديمة كانت تحوَّل بصمت */}
        <Route>
          <NotFoundPage />
        </Route>
      </Switch>
      </Suspense>
    </AppLayout>
  )
}

// المنطق الداخلي — يقرأ الموقع من Router ذي الـ hash routing
function AppRoutes() {
  const { user, loading } = useAuth()
  const [location] = useLocation()

  // نُشرت نسخة أحدث والصفحة مفتوحة؟ أول تنقّل يعيد التحميل على الصفحة المقصودة نفسها،
  // قبل أن تطلب شاشةٌ جزءاً حُذف (lib/staleBuild)
  const firstLocation = useRef(location)
  useEffect(() => {
    if (location !== firstLocation.current && hasNewBuild()) reloadForNewBuild()
  }, [location])

  if (loading) return <FullScreenLoader />

  // صفحة حجز المواعيد عامة تماماً (للعملاء بلا حساب)
  if (location === '/book') return <Booking />

  // سياسة الخصوصية عامة — يتطلبها نشر تطبيق iOS
  if (location === '/privacy') return <Privacy />

  // مسار الدخول عام: المسجّل يُحوّل إلى الرئيسية
  if (location === '/login') {
    return user ? <Redirect to="/" /> : <Login />
  }

  // باقي المسارات محمية — نحفظ الوجهة المقصودة كي يعود إليها بعد الدخول
  // (بلا ذلك يضيع رابط القضية المُرسل للموظف ويهبط في اللوحة — بلاغ 2026-08-25)
  if (!user) {
    try {
      if (location !== '/' && location !== '/login') {
        sessionStorage.setItem('redirect-after-login', location)
      }
    } catch {
      /* تخزين معطّل — يدخل ويهبط في الرئيسية كالسابق */
    }
    return <Redirect to="/login" />
  }

  return <ProtectedRoutes />
}

export default function App() {
  const initialize = useAuth((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  // hash routing ضروري لـ Capacitor (تقديم من file://)
  return (
    <Router hook={useHashLocation}>
      <AppRoutes />
    </Router>
  )
}

// الرابط غير صالح (غالباً رابط SMS قديم) — تفسير ومخرجان بدل تحويل صامت محيّر
function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <p className="text-5xl font-bold text-gold">404</p>
      <h1 className="mt-3 text-lg font-bold text-foreground">الصفحة غير موجودة</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        الرابط غير صالح أو قديم — ربما حُذف السجل أو تغيّر عنوانه.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-sm hover:bg-gold/90"
      >
        الرجوع للوحة التحكم
      </Link>
    </div>
  )
}
