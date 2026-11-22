import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { Loader } from './components/ui'
import Logo from './components/Logo'

const Login = lazy(() => import('./pages/auth/Login'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Account = lazy(() => import('./pages/shared/Account'))
const VehiclesList = lazy(() => import('./pages/shared/VehiclesList'))
const VehicleForm = lazy(() => import('./pages/shared/VehicleForm'))
const VehicleDetail = lazy(() => import('./pages/shared/VehicleDetail'))
const Users = lazy(() => import('./pages/shared/Users'))
const Payments = lazy(() => import('./pages/shared/Payments'))
const Transactions = lazy(() => import('./pages/shared/Transactions'))
const Reports = lazy(() => import('./pages/shared/Reports'))
const AuditLogs = lazy(() => import('./pages/shared/AuditLogs'))
const Contacts = lazy(() => import('./pages/shared/Contacts'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const Companies = lazy(() => import('./pages/admin/Companies'))
const CompanyDetail = lazy(() => import('./pages/admin/CompanyDetail'))
const Catalog = lazy(() => import('./pages/admin/Catalog'))
const PaymentMethods = lazy(() => import('./pages/admin/PaymentMethods'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const Backups = lazy(() => import('./pages/admin/Backups'))
const CompanyDashboard = lazy(() => import('./pages/company/Dashboard'))
const CompanyProfile = lazy(() => import('./pages/company/Profile'))
const Wallet = lazy(() => import('./pages/company/Wallet'))

function FullLoader() {
  return (
    <div className="fullscreen-loader">
      <Logo size={56} className="brand-logo pulse-logo" />
    </div>
  )
}

/** Garde de route : authentification + rôle + permission. */
function Guard({ children, admin, company, perm }) {
  const { user, ready, isSuperAdmin, can, home } = useAuth()
  const loc = useLocation()
  if (!ready) return <FullLoader />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (admin && !isSuperAdmin) return <Navigate to={home} replace />
  if (company && isSuperAdmin) return <Navigate to="/admin" replace />
  if (perm && !can(perm)) return <Navigate to={home} replace />
  return children
}

function PublicOnly({ children }) {
  const { user, ready, home } = useAuth()
  if (!ready) return <FullLoader />
  return user ? <Navigate to={home} replace /> : children
}

/** Première page accessible pour un membre d'entreprise selon ses permissions. */
function CompanyHome() {
  const { can } = useAuth()
  if (can('stats:view')) return <CompanyDashboard />
  return <Navigate to="/company/vehicles" replace />
}

export default function App() {
  const { home } = useAuth()
  return (
    <Suspense fallback={<FullLoader />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<Guard><Layout /></Guard>}>
          <Route path="/account" element={<Suspense fallback={<Loader />}><Account /></Suspense>} />
        </Route>

        {/* ---------------- Super Administrateur ---------------- */}
        <Route path="/admin" element={<Guard admin><Layout /></Guard>}>
          <Route index element={<AdminDashboard />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="users" element={<Users />} />
          <Route path="vehicles" element={<VehiclesList base="/admin" />} />
          <Route path="vehicles/new" element={<VehicleForm base="/admin" />} />
          <Route path="vehicles/:id" element={<VehicleDetail base="/admin" />} />
          <Route path="vehicles/:id/edit" element={<VehicleForm base="/admin" />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="payments" element={<Payments />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="payment-methods" element={<PaymentMethods />} />
          <Route path="reports" element={<Reports />} />
          <Route path="logs" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="backups" element={<Backups />} />
        </Route>

        {/* ---------------- Espace entreprise ---------------- */}
        <Route path="/company" element={<Guard company><Layout /></Guard>}>
          <Route index element={<CompanyHome />} />
          <Route path="vehicles" element={<Guard perm="vehicles:view"><VehiclesList base="/company" /></Guard>} />
          <Route path="vehicles/new" element={<Guard perm="vehicles:manage"><VehicleForm base="/company" /></Guard>} />
          <Route path="vehicles/:id" element={<Guard perm="vehicles:view"><VehicleDetail base="/company" /></Guard>} />
          <Route path="vehicles/:id/edit" element={<Guard perm="vehicles:manage"><VehicleForm base="/company" /></Guard>} />
          <Route path="contacts" element={<Guard perm="contacts:view"><Contacts /></Guard>} />
          <Route path="wallet" element={<Guard perm="wallet:view"><Wallet /></Guard>} />
          <Route path="reports" element={<Guard perm="reports:view"><Reports /></Guard>} />
          <Route path="team" element={<Guard perm="team:view"><Users team /></Guard>} />
          <Route path="profile" element={<Guard perm="company:view"><CompanyProfile /></Guard>} />
          <Route path="logs" element={<AuditLogs />} />
        </Route>

        <Route path="*" element={<Navigate to={home || '/login'} replace />} />
      </Routes>
    </Suspense>
  )
}
