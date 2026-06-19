import { useEffect } from 'react'
import { Route, Switch, Redirect, useLocation } from 'wouter'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TeamPage } from '@/features/team/TeamPage'

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
        <Route path="/team" component={TeamPage} />
        <Route path="/settings" component={SettingsPage} />
        {/* أي مسار غير معروف → لوحة التحكم */}
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </AppLayout>
  )
}

export default function App() {
  const { user, loading, initialize } = useAuth()
  const [location] = useLocation()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (loading) return <FullScreenLoader />

  // مسار الدخول عام: المسجّل يُحوّل إلى الرئيسية
  if (location === '/login') {
    return user ? <Redirect to="/" /> : <Login />
  }

  // باقي المسارات محمية
  if (!user) return <Redirect to="/login" />

  return <ProtectedRoutes />
}
