/* eslint-disable react-refresh/only-export-components */
/**
 * Bibliothèque de composants d'interface ZwaCar.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiChevronLeft, FiChevronRight, FiInbox, FiLoader, FiSearch, FiX } from 'react-icons/fi'

export const Spinner = ({ size }) => <FiLoader className="spin" style={size ? { fontSize: size } : undefined} />

export function Button({ variant, size, loading, icon: Icon, children, className = '', block, ...rest }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ')
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : Icon ? <Icon /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, title, size, variant = 'ghost', ...rest }) {
  return (
    <button className={`btn btn-${variant} icon-btn ${size || ''}`} title={title} aria-label={title} {...rest}>
      <Icon />
    </button>
  )
}

export const PageHeader = ({ title, subtitle, crumbs, children }) => (
  <motion.div className="page-head" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
    <div>
      {crumbs && (
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <FiChevronRight />}
            </span>
          ))}
        </div>
      )}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {children && <div className="actions">{children}</div>}
  </motion.div>
)

export const Card = ({ title, subtitle, actions, children, className = '', pad, ...rest }) => (
  <div className={`card ${className}`} {...rest}>
    {(title || actions) && (
      <div className="card-head">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    )}
    {pad ? <div className="card-body">{children}</div> : children}
  </div>
)

export function StatCard({ icon: Icon, label, value, sub, tone, dark, delay = 0 }) {
  return (
    <motion.div
      className={`card stat ${tone ? `tone-${tone}` : ''} ${dark ? 'dark' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="stat-icon">{Icon && <Icon />}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </motion.div>
  )
}

export const Badge = ({ tone = '', children, plain }) => <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>

/** Badge à partir d'une table de correspondance { valeur: { label, tone } }. */
export const StatusBadge = ({ map, value }) => {
  const s = map[value] || { label: value, tone: '' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function Field({ label, required, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export const Input = ({ invalid, className = '', ...p }) => <input className={`input ${invalid ? 'invalid' : ''} ${className}`} {...p} />
export const Textarea = ({ invalid, ...p }) => <textarea className={`textarea ${invalid ? 'invalid' : ''}`} {...p} />
export const Select = ({ invalid, options = [], placeholder, ...p }) => (
  <select className={`select ${invalid ? 'invalid' : ''}`} {...p}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
)

export const Toggle = ({ checked, onChange, label, disabled }) => (
  <label className="toggle">
    <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="track" />
    {label && <span>{label}</span>}
  </label>
)

export const SearchInput = ({ value, onChange, placeholder = 'Rechercher…' }) => (
  <div className="input-icon">
    <FiSearch />
    <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    {value && (
      <button className="btn btn-ghost icon-btn sm suffix" onClick={() => onChange('')} aria-label="Effacer">
        <FiX />
      </button>
    )}
  </div>
)

export function Modal({ open, onClose, title, subtitle, children, footer, size = '' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div
            className={`modal ${size}`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <div>
                <h3>{title}</h3>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <IconButton icon={FiX} title="Fermer" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * Boîte de confirmation. `confirmText` : texte à saisir pour les actions irréversibles.
 * `withReason` : champ motif facultatif.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmer', danger, confirmText, withReason, reasonLabel = 'Motif' }) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (open) {
      setTyped('')
      setReason('')
    }
  }, [open])
  const blocked = confirmText && typed !== confirmText
  const go = async () => {
    setLoading(true)
    try {
      await onConfirm(withReason ? reason : typed)
      onClose()
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={blocked} onClick={go}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        {danger && (
          <div className="list-icon" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
            <FiAlertTriangle />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div className="muted">{message}</div>
          {withReason && (
            <Field label={reasonLabel} className="mt-2">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 80 }} />
            </Field>
          )}
          {confirmText && (
            <Field label={`Saisissez « ${confirmText} » pour confirmer`} className="mt-2">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  )
}

export const Empty = ({ icon: Icon = FiInbox, title = 'Aucun élément', text, children }) => (
  <div className="empty">
    <div className="empty-icon">
      <Icon />
    </div>
    <h4>{title}</h4>
    {text && <p style={{ margin: 0 }}>{text}</p>}
    {children && <div className="mt-2">{children}</div>}
  </div>
)

export const Loader = () => (
  <div className="loader">
    <Spinner />
  </div>
)

export const ErrorBox = ({ error, onRetry }) => (
  <div className="callout red" style={{ margin: 20 }}>
    <FiAlertTriangle />
    <div style={{ flex: 1 }}>{error}</div>
    {onRetry && (
      <Button size="sm" onClick={onRetry}>
        Réessayer
      </Button>
    )}
  </div>
)

/**
 * Tableau de données.
 * columns: [{ key, label, render?(row), align?, className? }]
 */
export function DataTable({ columns, rows, loading, error, onRetry, onRowClick, empty, rowKey = 'id' }) {
  if (error) return <ErrorBox error={error} onRetry={onRetry} />
  if (loading && !rows) return <Loader />
  if (!rows?.length) return empty || <Empty />
  return (
    <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'right' : ''} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr
              key={r[rowKey] ?? i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className={onRowClick ? 'clickable' : ''}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return meta ? <div className="pagination small muted">{meta.total} résultat(s)</div> : null
  const { page, pages, total } = meta
  const nums = []
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p)
  return (
    <div className="pagination">
      <span className="small muted">
        {total} résultat(s) — page {page}/{pages}
      </span>
      <div className="pages">
        <IconButton icon={FiChevronLeft} title="Précédent" size="sm" variant="" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        {nums.map((n) => (
          <button key={n} className={`btn btn-sm ${n === page ? 'btn-dark' : 'btn-ghost'}`} onClick={() => onPage(n)}>
            {n}
          </button>
        ))}
        <IconButton icon={FiChevronRight} title="Suivant" size="sm" variant="" disabled={page >= pages} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {value === t.value && <motion.div layoutId="tab-bg" className="tab-bg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
          <span>
            {t.icon && <t.icon />}
            {t.label}
            {t.count !== undefined && <span className="badge plain gold" style={{ padding: '0 7px' }}>{t.count}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Puces de filtre avec compteur facultatif. */
export const FilterChips = ({ options, value, onChange }) => (
  <div className="chips">
    {options.map((o) => (
      <button key={o.value} className={`chip ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
        {o.label}
        {o.count !== undefined && <span className="n">{o.count}</span>}
      </button>
    ))}
  </div>
)

export const Avatar = ({ user, src, size }) => (
  <div className={`avatar ${size || ''}`}>{src ? <img src={src} alt="" /> : `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || user?.name?.[0]}</div>
)
