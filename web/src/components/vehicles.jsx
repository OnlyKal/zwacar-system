/* eslint-disable react-refresh/only-export-components */
/**
 * Composants liés aux véhicules : carte, boîte de publication, statut de validité.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiCalendar, FiCamera, FiCheckCircle, FiEye, FiMapPin, FiMessageCircle, FiRefreshCw, FiUsers, FiZap } from 'react-icons/fi'
import { TbManualGearbox, TbGasStation } from 'react-icons/tb'
import { IoCarSportOutline } from 'react-icons/io5'
import { Badge, Button, Modal, StatusBadge } from './ui'
import { api, errorMessage } from '../api/client'
import { AVAILABILITY, daysUntil, fmtDate, fmtMoney, fmtNumber, FUEL, TRANSMISSION, VEHICLE_STATUS } from '../utils/format'

export function VehicleCard({ v, onClick, showCompany, index = 0 }) {
  const days = daysUntil(v.expiresAt)
  return (
    <motion.div
      className="card v-card"
      onClick={onClick}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="v-media">
        {v.coverThumbUrl ? <img src={v.coverThumbUrl} alt={v.title} loading="lazy" /> : <div className="v-placeholder"><IoCarSportOutline /></div>}
        <div className="v-top">
          <StatusBadge map={VEHICLE_STATUS} value={v.status} />
          {v.status === 'active' && <StatusBadge map={AVAILABILITY} value={v.availability} />}
        </div>
        <div className="v-count">
          <FiCamera /> {v.photos.length}
          {v.video && ' · vidéo'}
        </div>
        {v.priceDaily != null && (
          <div className="v-price">
            {fmtMoney(v.priceDaily, v.currency)} <small>/ jour</small>
          </div>
        )}
      </div>
      <div className="v-body">
        <div>
          <div className="v-title">
            {v.title} {v.year && <span className="muted" style={{ fontWeight: 600 }}>{v.year}</span>}
          </div>
          <div className="v-sub">
            <FiMapPin /> {v.city || '—'} {showCompany && v.company && <>· {v.company.name}</>}
          </div>
        </div>
        <div className="v-specs">
          {v.seats && <span><FiUsers /> {v.seats} places</span>}
          {v.transmission && <span><TbManualGearbox /> {TRANSMISSION[v.transmission]}</span>}
          {v.fuelType && <span><TbGasStation /> {FUEL[v.fuelType]}</span>}
        </div>
        {v.status === 'draft' && v.completeness && (
          <div>
            <div className="row between small muted"><span>Complétude</span><span>{v.completeness.percent}%</span></div>
            <div className={`progress mt-1 ${v.completeness.ready ? 'green' : ''}`}><div style={{ width: `${v.completeness.percent}%` }} /></div>
          </div>
        )}
        <div className="v-foot">
          <span className="row" style={{ gap: 10 }}>
            <span><FiEye style={{ verticalAlign: -2 }} /> {fmtNumber(v.viewsCount)}</span>
            <span><FiMessageCircle style={{ verticalAlign: -2 }} /> {fmtNumber(v.contactsCount)}</span>
          </span>
          {v.status === 'active' && v.expiresAt && (
            <span style={{ color: days <= 30 ? 'var(--red)' : undefined, fontWeight: days <= 30 ? 700 : 500 }}>
              <FiCalendar style={{ verticalAlign: -2 }} /> {days > 0 ? `J-${days}` : 'Échu'}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** Boîte de confirmation de publication (affiche le coût et le solde). */
export function PublishDialog({ vehicle, open, onClose, onDone }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open || !vehicle) return
    setSummary(null)
    api.get('/wallet/summary', { params: { companyId: vehicle.companyId } }).then((r) => setSummary(r.data.data)).catch(() => setSummary({ error: true }))
  }, [open, vehicle])

  if (!vehicle) return null
  const cost = summary?.billing?.publishCost
  const enough = summary && !summary.error && summary.balance >= cost
  const republish = vehicle.publicationCount > 0

  const go = async () => {
    setLoading(true)
    try {
      const r = await api.post(`/vehicles/${vehicle.id}/publish`)
      toast.success(r.data.pending ? 'Véhicule soumis à validation' : 'Véhicule publié avec succès 🎉')
      onDone?.(r.data.data)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={republish ? 'Republier le véhicule' : 'Publier le véhicule'}
      subtitle={`${vehicle.title} ${vehicle.year || ''}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" icon={FiZap} loading={loading} disabled={!enough} onClick={go}>
            Publier pour {cost ?? '…'} crédits
          </Button>
        </>
      }
    >
      {!summary ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : summary.error ? (
        <div className="callout red"><FiAlertTriangle /> Impossible de lire le solde du wallet.</div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="price-box" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><small>Coût</small><strong>{cost}</strong></div>
            <div><small>Solde actuel</small><strong>{summary.balance}</strong></div>
            <div><small>Solde après</small><strong style={{ color: enough ? undefined : 'var(--red)' }}>{summary.balance - cost}</strong></div>
          </div>
          <div className="callout">
            <FiCheckCircle />
            <div>
              Le véhicule sera visible pendant <b>{summary.billing.validityMonths} mois</b>. À l’échéance, il sera{' '}
              {vehicle.autoRenew ? <b>renouvelé automatiquement</b> : <b>désactivé (renouvellement automatique désactivé)</b>} si le solde le permet.
            </div>
          </div>
          {!enough && (
            <div className="callout red">
              <FiAlertTriangle /> Solde insuffisant : rechargez votre wallet pour publier ce véhicule.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Résumé de la validité d'une publication. */
export function ValidityBox({ v, months = 12 }) {
  if (!v.expiresAt || !['active', 'pending', 'suspended'].includes(v.status)) return null
  const days = daysUntil(v.expiresAt)
  const total = months * 30.4
  const pct = Math.max(0, Math.min(100, ((total - days) / total) * 100))
  return (
    <div>
      <div className="row between small">
        <span className="muted">Validité</span>
        <span className="strong">{days > 0 ? `${days} jour(s) restant(s)` : 'Échue'}</span>
      </div>
      <div className="progress mt-1"><div style={{ width: `${pct}%`, background: days <= 30 ? 'var(--red)' : undefined }} /></div>
      <div className="row between small muted mt-1">
        <span>Publié le {fmtDate(v.publishedAt)}</span>
        <span>Expire le {fmtDate(v.expiresAt)}</span>
      </div>
      {v.autoRenew && v.status === 'active' && (
        <div className="small mt-1" style={{ color: 'var(--green)' }}>
          <FiRefreshCw style={{ verticalAlign: -2 }} /> Renouvellement automatique activé
        </div>
      )}
    </div>
  )
}

export const AvailabilityBadge = ({ value }) => <StatusBadge map={AVAILABILITY} value={value} />
export const StatusTag = ({ value }) => (value ? <StatusBadge map={VEHICLE_STATUS} value={value} /> : <Badge>—</Badge>)
