/**
 * Cloche de notifications (barre supérieure) : compteur, liste, lecture.
 * Vérifie les nouveautés toutes les 30 secondes et affiche un toast à l'arrivée d'une notification.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { FiBell, FiCheck, FiCheckCircle, FiInbox, FiSmartphone } from 'react-icons/fi'
import { api } from '../api/client'
import { fmtDateTime } from '../utils/format'

const ICON = { 'topup.completed': FiCheckCircle, 'topup.requested': FiInbox }
const TONE = { 'topup.completed': 'green', 'topup.requested': 'gold' }
const POLL_MS = 30000

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const lastId = useRef(null)
  const ref = useRef(null)
  const nav = useNavigate()
  const loc = useLocation()

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications', { params: { limit: 12 } })
      const list = r.data.data
      // Toast pour les notifications arrivées depuis la dernière vérification (pas au premier chargement).
      if (lastId.current !== null) {
        list
          .filter((n) => n.id > lastId.current && !n.readAt)
          .reverse()
          .forEach((n) => toast(n.title, { icon: n.type === 'topup.completed' ? '✅' : '📥', duration: 6000 }))
      }
      lastId.current = list.reduce((m, n) => Math.max(m, n.id), lastId.current ?? 0)
      setItems(list)
      setUnread(r.data.unread)
    } catch {
      /* non bloquant */
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  // Rafraîchit à chaque changement de page.
  useEffect(() => {
    load()
  }, [loc.pathname, load])

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const openItem = async (n) => {
    setOpen(false)
    if (!n.readAt) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
      api.post(`/notifications/${n.id}/read`).catch(() => {})
    }
    if (n.link) nav(n.link)
  }

  const readAll = async () => {
    await api.post('/notifications/read-all').catch(() => {})
    setItems((l) => l.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })))
    setUnread(0)
  }

  return (
    <div className="notif" ref={ref}>
      <button className="btn btn-ghost icon-btn notif-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${unread} non lues)`}>
        <FiBell />
        {unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="dropdown notif-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="notif-head">
              <strong>Notifications</strong>
              {unread > 0 && (
                <button className="notif-readall" onClick={readAll}>
                  <FiCheck /> Tout marquer comme lu
                </button>
              )}
            </div>
            <div className="notif-list">
              {items.length === 0 && <div className="notif-empty">Aucune notification</div>}
              {items.map((n) => {
                const Icon = ICON[n.type] || FiSmartphone
                return (
                  <button key={n.id} className={`notif-item ${n.readAt ? '' : 'unread'}`} onClick={() => openItem(n)}>
                    <span className={`notif-icon ${TONE[n.type] || 'gold'}`}><Icon /></span>
                    <span className="notif-body">
                      <span className="notif-title">{n.title}</span>
                      {n.message && <span className="notif-msg">{n.message}</span>}
                      <span className="notif-date">{fmtDateTime(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="notif-dot" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
