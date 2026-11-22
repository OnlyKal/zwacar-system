import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FiActivity, FiArchive, FiBarChart2, FiBriefcase, FiChevronDown, FiCreditCard, FiFileText, FiGrid, FiLayers, FiLogOut, FiMenu,
  FiMessageCircle, FiSettings, FiUser, FiUsers, FiDollarSign, FiShield,
} from 'react-icons/fi'
import { IoCarSportOutline } from 'react-icons/io5'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import { Avatar } from './ui'
import NotificationBell from './NotificationBell'
import Logo from './Logo'
import { fmtNumber } from '../utils/format'

const ADMIN_NAV = [
  { section: null, items: [{ to: '/admin', label: 'Tableau de bord', icon: FiGrid, end: true }] },
  {
    section: 'Gestion',
    items: [
      { to: '/admin/companies', label: 'Entreprises', icon: FiBriefcase, badge: 'pendingCompanies' },
      { to: '/admin/users', label: 'Utilisateurs', icon: FiUsers },
      { to: '/admin/vehicles', label: 'Véhicules', icon: IoCarSportOutline, badge: 'pendingVehicles' },
      { to: '/admin/catalog', label: 'Catalogue', icon: FiLayers },
    ],
  },
  {
    section: 'Finances',
    items: [
      { to: '/admin/payments', label: 'Paiements', icon: FiCreditCard, badge: 'pendingPayments' },
      { to: '/admin/transactions', label: 'Historique crédits', icon: FiDollarSign },
      { to: '/admin/payment-methods', label: 'Moyens de paiement', icon: FiShield },
    ],
  },
  {
    section: 'Analyse',
    items: [
      { to: '/admin/reports', label: 'Rapports PDF', icon: FiFileText },
      { to: '/admin/logs', label: 'Journal d’activité', icon: FiActivity },
    ],
  },
  {
    section: 'Système',
    items: [
      { to: '/admin/settings', label: 'Paramètres', icon: FiSettings },
      { to: '/admin/backups', label: 'Sauvegardes', icon: FiArchive },
    ],
  },
]

const COMPANY_NAV = [
  { section: null, items: [{ to: '/company', label: 'Tableau de bord', icon: FiGrid, end: true, perm: 'stats:view' }] },
  {
    section: 'Activité',
    items: [
      { to: '/company/vehicles', label: 'Mes véhicules', icon: IoCarSportOutline, perm: 'vehicles:view' },
      { to: '/company/contacts', label: 'Contacts clients', icon: FiMessageCircle, perm: 'contacts:view', badge: 'newContacts' },
      { to: '/company/wallet', label: 'Wallet & crédits', icon: FiCreditCard, perm: 'wallet:view' },
      { to: '/company/reports', label: 'Rapports', icon: FiBarChart2, perm: 'reports:view' },
    ],
  },
  {
    section: 'Entreprise',
    items: [
      { to: '/company/team', label: 'Équipe', icon: FiUsers, perm: 'team:view' },
      { to: '/company/profile', label: 'Mon entreprise', icon: FiBriefcase, perm: 'company:view' },
      { to: '/company/logs', label: 'Journal d’activité', icon: FiActivity, role: 'company_admin' },
    ],
  },
]

export default function Layout() {
  const { user, logout, isSuperAdmin, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [badges, setBadges] = useState({})
  const loc = useLocation()
  const nav = useNavigate()
  const menuRef = useRef()

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll)
    const onClick = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  // Compteurs d'éléments à traiter
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (isSuperAdmin) {
          const [p, v, c] = await Promise.all([
            api.get('/payments', { params: { status: 'pending', limit: 1 } }),
            api.get('/vehicles', { params: { status: 'pending', limit: 1 } }),
            api.get('/companies', { params: { status: 'pending', limit: 1 } }),
          ])
          if (alive) setBadges({ pendingPayments: p.data.meta.total, pendingVehicles: v.data.meta.total, pendingCompanies: c.data.meta.total })
        } else if (can('contacts:view')) {
          const c = await api.get('/contacts', { params: { status: 'new', limit: 1 } })
          if (alive) setBadges({ newContacts: c.data.meta.total })
        }
      } catch {
        /* non bloquant */
      }
    }
    load()
    return () => (alive = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, isSuperAdmin])

  const sections = (isSuperAdmin ? ADMIN_NAV : COMPANY_NAV)
    .map((s) => ({ ...s, items: s.items.filter((i) => (!i.perm || can(i.perm)) && (!i.role || i.role === user.role)) }))
    .filter((s) => s.items.length)

  const doLogout = async () => {
    await logout()
    nav('/login')
  }

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to={isSuperAdmin ? '/admin' : '/company'} className="brand">
          <Logo />
          <div>
            <div className="brand-name">ZwaCar</div>
            <div className="brand-sub">{isSuperAdmin ? 'Super Administration' : user.company?.name}</div>
          </div>
        </Link>
        <nav className="nav">
          {sections.map((s, i) => (
            <div key={i}>
              {s.section && <div className="nav-section">{s.section}</div>}
              {s.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <it.icon />
                  {it.label}
                  {it.badge && badges[it.badge] > 0 && <span className="count">{badges[it.badge]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {!isSuperAdmin && can('wallet:view') && (
          <div className="sidebar-foot">
            <Link to="/company/wallet" className="wallet-chip">
              <small>Solde du wallet</small>
              <strong>{fmtNumber(user.company?.walletBalance)}</strong> <small style={{ display: 'inline' }}>crédits</small>
            </Link>
          </div>
        )}
      </aside>
      {open && <div className="overlay" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <button className="btn btn-ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
            <FiMenu />
          </button>
          <div className="spacer" />
          <NotificationBell />
          <div className="user-menu" ref={menuRef}>
            <button className="user-btn" onClick={() => setMenu((m) => !m)}>
              <Avatar user={user} />
              <div className="hide-sm" style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <div className="strong" style={{ fontSize: 13 }}>
                  {user.firstName} {user.lastName}
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>{user.roleLabel}</div>
              </div>
              <FiChevronDown className="muted" />
            </button>
            <AnimatePresence>
              {menu && (
                <motion.div className="dropdown" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <div style={{ padding: '10px 12px' }}>
                    <div className="strong">{user.email}</div>
                    <div className="small muted">{user.company?.name || 'Plateforme ZwaCar'}</div>
                  </div>
                  <hr />
                  <Link to="/account" onClick={() => setMenu(false)}>
                    <FiUser /> Mon compte
                  </Link>
                  {!isSuperAdmin && can('company:view') && (
                    <Link to="/company/profile" onClick={() => setMenu(false)}>
                      <FiBriefcase /> Mon entreprise
                    </Link>
                  )}
                  <hr />
                  <button onClick={doLogout} style={{ color: 'var(--red)' }}>
                    <FiLogOut /> Déconnexion
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>
        <main className="content">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
