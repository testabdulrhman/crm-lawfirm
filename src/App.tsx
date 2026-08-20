import { useEffect } from 'react'
import { Route, Switch, Redirect, Router, useLocation, Link } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Booking from '@/pages/Booking'
import Dashboard from '@/pages/Dashboard'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TeamPage } from '@/features/team/TeamPage'
import { IncomingMessagesPage } from '@/features/inbox/IncomingMessagesPage'
import { MailPage } from '@/features/mail/MailPage'
import { TeamMemberDetail } from '@/features/team/TeamMemberDetail'
import { RequestsPage } from '@/features/requests/RequestsPage'
import { RequestDetail } from '@/features/requests/RequestDetail'
import { StaffApplicationsPage } from '@/features/staff-applications/StaffApplicationsPage'
import { ApplicationDetail } from '@/features/staff-applications/ApplicationDetail'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { ContactDetail } from '@/features/contacts/ContactDetail'
import { CasesPage } from '@/features/cases/CasesPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TaskRoomPage } from '@/features/tasks/TaskRoomPage'
import { EngagementsPage } from '@/features/engagements/EngagementsPage'
import { EngagementDetail } from '@/features/engagements/EngagementDetail'
import { CaseDetail } from '@/features/cases/CaseDetail'
import CaseNewPage from '@/features/cases/CaseNewPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { MattersPage } from '@/features/matters/MattersPage'
import { FeedPage } from '@/features/feed/FeedPage'
import { DiscussionsPage } from '@/features/discussions/DiscussionsPage'
import { SessionsPage } from '@/features/sessions/SessionsPage'
import { POAsPage } from '@/features/poa/POAsPage'
import { POADetail } from '@/features/poa/POADetail'
import { LegalServicesPage } from '@/features/legal-services/LegalServicesPage'
import { LegalServiceDetail } from '@/features/legal-services/LegalServiceDetail'
import { PropertyTransfersPage } from '@/features/property/PropertyTransfersPage'
import { PropertyTransferDetail } from '@/features/property/PropertyTransferDetail'
import { AppointmentsPage } from '@/features/appointments/AppointmentsPage'
import { AppointmentDetail } from '@/features/appointments/AppointmentDetail'
import { OutgoingLettersPage } from '@/features/outgoing/OutgoingLettersPage'
import { OutgoingLetterDetail } from '@/features/outgoing/OutgoingLetterDetail'
import { ReportsPage } from '@/features/reports/ReportsPage'

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-gold" />
    </div>
  )
}

// المسارات المحمية داخل الإطار
function ProtectedRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        {/* قبل /cases/:id ضرورةً — وإلا فُهمت «new» معرّف قضية */}
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/matters" component={MattersPage} />
        <Route path="/feed" component={FeedPage} />
        <Route path="/discussions" component={DiscussionsPage} />
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
    </AppLayout>
  )
}

// المنطق الداخلي — يقرأ الموقع من Router ذي الـ hash routing
function AppRoutes() {
  const { user, loading } = useAuth()
  const [location] = useLocation()

  if (loading) return <FullScreenLoader />

  // صفحة حجز المواعيد عامة تماماً (للعملاء بلا حساب)
  if (location === '/book') return <Booking />

  // مسار الدخول عام: المسجّل يُحوّل إلى الرئيسية
  if (location === '/login') {
    return user ? <Redirect to="/" /> : <Login />
  }

  // باقي المسارات محمية
  if (!user) return <Redirect to="/login" />

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
