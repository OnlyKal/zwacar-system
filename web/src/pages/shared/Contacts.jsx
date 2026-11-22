import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiMail, FiMessageCircle, FiPhone } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import { Badge, Card, DataTable, Empty, FilterChips, Input, PageHeader, Pagination, Select } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage } from '../../api/client'
import { CONTACT_CHANNEL, CONTACT_STATUS, fmtDateTime, fmtMoney } from '../../utils/format'

const CHANNEL_ICON = { whatsapp: <FaWhatsapp style={{ color: '#25D366' }} />, phone: <FiPhone style={{ color: 'var(--gold)' }} />, email: <FiMail style={{ color: 'var(--blue)' }} /> }

export default function Contacts() {
  const { can } = useAuth()
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [status, channel, from, to])
  const { data, loading, error, reload } = useApi('/contacts', { status, channel, from, to, page })
  const counts = data?.statusCounts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  const update = async (c, s) => {
    try {
      await api.patch(`/contacts/${c.id}`, { status: s })
      toast.success('Statut mis à jour')
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const contactLink = (c) => {
    if (c.channel === 'whatsapp' && c.clientPhone) return `https://wa.me/${c.clientPhone.replace(/[^\d]/g, '')}`
    if (c.clientPhone) return `tel:${c.clientPhone}`
    if (c.clientEmail) return `mailto:${c.clientEmail}`
    return null
  }

  return (
    <>
      <PageHeader title="Contacts clients" subtitle="Demandes générées par vos véhicules depuis l’application mobile (WhatsApp, appels, emails)" />
      <Card>
        <div className="toolbar" style={{ paddingBottom: 4 }}>
          <FilterChips value={status} onChange={setStatus} options={[{ value: '', label: 'Tous', count: total }, ...Object.entries(CONTACT_STATUS).map(([value, s]) => ({ value, label: s.label, count: counts[value] || 0 }))]} />
        </div>
        <div className="toolbar">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Tous les canaux" options={Object.entries(CONTACT_CHANNEL).map(([value, label]) => ({ value, label }))} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <DataTable
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={<Empty icon={FiMessageCircle} title="Aucun contact" text="Les prises de contact des clients apparaîtront ici." />}
          columns={[
            { key: 'date', label: 'Date', render: (c) => fmtDateTime(c.createdAt) },
            { key: 'channel', label: 'Canal', render: (c) => <span className="row" style={{ gap: 8 }}>{CHANNEL_ICON[c.channel]} {CONTACT_CHANNEL[c.channel]}</span> },
            { key: 'client', label: 'Client', render: (c) => <div><div className="cell-main">{c.clientName || 'Visiteur anonyme'}</div><div className="cell-sub">{[c.clientPhone, c.clientEmail].filter(Boolean).join(' · ') || '—'}</div></div> },
            { key: 'vehicle', label: 'Véhicule', render: (c) => (c.vehicle ? <Link className="strong" to={`/company/vehicles/${c.vehicle.id}`}>{c.vehicle.brand} {c.vehicle.model}</Link> : '—') },
            {
              key: 'request',
              label: 'Demande',
              render: (c) =>
                c.withDriver == null && !c.rentalDays ? (
                  <span className="muted">—</span>
                ) : (
                  <div>
                    {c.withDriver != null && <Badge tone={c.withDriver ? 'gold' : ''} plain>{c.withDriver ? 'Avec chauffeur' : 'Sans chauffeur'}</Badge>}
                    {c.rentalDays && (
                      <div className="cell-sub">
                        {c.rentalDays} jour{c.rentalDays > 1 ? 's' : ''}
                        {c.estimatedTotal != null && <> · ≈ {fmtMoney(c.estimatedTotal, c.vehicle?.currency || 'USD')}</>}
                      </div>
                    )}
                  </div>
                ),
            },
            { key: 'message', label: 'Message', render: (c) => <span className="small muted">{c.message || '—'}</span> },
            {
              key: 'status',
              label: 'Suivi',
              render: (c) =>
                can('contacts:manage') ? (
                  <Select value={c.status} onChange={(e) => update(c, e.target.value)} options={Object.entries(CONTACT_STATUS).map(([value, s]) => ({ value, label: s.label }))} style={{ minWidth: 130, padding: '6px 10px' }} />
                ) : (
                  CONTACT_STATUS[c.status].label
                ),
            },
            { key: 'act', label: '', align: 'right', render: (c) => contactLink(c) && <a className="btn btn-sm btn-soft" href={contactLink(c)} target="_blank" rel="noreferrer">Recontacter</a> },
          ]}
        />
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
    </>
  )
}
