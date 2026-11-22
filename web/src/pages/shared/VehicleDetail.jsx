import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiAlertTriangle, FiCalendar, FiCheck, FiDroplet, FiEdit2, FiEye, FiMapPin, FiMessageCircle, FiPause, FiPlay, FiTrash2, FiUsers, FiX, FiZap, FiBriefcase, FiHash,
} from 'react-icons/fi'
import { TbManualGearbox, TbGasStation, TbDoor, TbRoad } from 'react-icons/tb'
import { IoCarSportOutline } from 'react-icons/io5'
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Loader, PageHeader, Select, StatusBadge, Toggle } from '../../components/ui'
import { PublishDialog, ValidityBox } from '../../components/vehicles'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { AVAILABILITY, EVENT_LABELS, fmtDateTime, fmtMoney, fmtNumber, FUEL, TRANSMISSION, VEHICLE_STATUS, DRIVER_MODES } from '../../utils/format'

export default function VehicleDetail({ base }) {
  const { id } = useParams()
  const nav = useNavigate()
  const { isSuperAdmin, can, reloadUser } = useAuth()
  const [v, setV] = useState(null)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)
  const [publish, setPublish] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = () =>
    api
      .get(`/vehicles/${id}`)
      .then((r) => setV(r.data.data))
      .catch((e) => setError(errorMessage(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) return <ErrorBox error={error} />
  if (!v) return <Loader />

  const patch = async (url, body, msg) => {
    try {
      await api.patch(url, body)
      toast.success(msg)
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const moderate = (action, reason) =>
    api.post(`/vehicles/${v.id}/moderate`, { action, reason }).then((r) => {
      setV({ ...r.data.data, events: v.events })
      load()
      toast.success('Statut mis à jour')
    }).catch((e) => { toast.error(errorMessage(e)); throw e })
  const remove = () =>
    api.delete(`/vehicles/${v.id}`).then(() => {
      toast.success('Véhicule supprimé')
      nav(`${base}/vehicles`)
    }).catch((e) => { toast.error(errorMessage(e)); throw e })

  const photos = v.photos
  const main = photos[active]
  const canPublish = can('vehicles:publish') && ['draft', 'expired', 'rejected'].includes(v.status)
  const specs = [
    [FiCalendar, 'Année', v.year],
    [TbGasStation, 'Carburant', FUEL[v.fuelType]],
    [TbManualGearbox, 'Transmission', TRANSMISSION[v.transmission]],
    [FiUsers, 'Places', v.seats],
    [TbDoor, 'Portes', v.doors],
    [FiDroplet, 'Couleur', v.color],
    [TbRoad, 'Kilométrage', v.mileage != null ? `${fmtNumber(v.mileage)} km` : null],
    [FiHash, 'Immatriculation', v.plateNumber],
    [FiMapPin, 'Ville', v.city],
  ]

  return (
    <>
      <PageHeader title={`${v.title} ${v.year || ''}`} crumbs={[{ label: 'Véhicules', to: `${base}/vehicles` }, { label: v.title }]}>
        {can('vehicles:manage') && (
          <Link to={`${base}/vehicles/${v.id}/edit`} className="btn">
            <FiEdit2 /> Modifier
          </Link>
        )}
        {canPublish && (
          <Button variant="primary" icon={FiZap} onClick={() => setPublish(true)} disabled={!v.completeness.ready} title={v.completeness.ready ? '' : 'Véhicule incomplet'}>
            {v.publicationCount > 0 ? 'Republier' : 'Publier'}
          </Button>
        )}
      </PageHeader>

      {v.statusReason && ['rejected', 'suspended', 'expired'].includes(v.status) && (
        <div className="callout red mb-2">
          <FiAlertTriangle /> <div><b>{VEHICLE_STATUS[v.status].label}</b> — {v.statusReason}</div>
        </div>
      )}
      {!v.completeness.ready && (
        <div className="callout mb-2">
          <FiAlertTriangle />
          <div>
            <b>Fiche incomplète ({v.completeness.percent}%)</b> : {v.completeness.missing.join(' · ')}
          </div>
        </div>
      )}

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card>
            {photos.length ? (
              <div style={{ padding: 12 }}>
                <div className="gallery">
                  <div className="g-hero"><img src={main?.url} alt="" /></div>
                  <div className="g-side">
                    {photos.slice(1, 3).map((p, i) => (
                      <div key={p.id} onClick={() => setActive(i + 1)}>
                        <img src={p.thumbUrl} alt="" />
                        {i === 1 && photos.length > 3 && <div className="more">+{photos.length - 3}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="thumbs">
                  {photos.map((p, i) => (
                    <img key={p.id} src={p.thumbUrl} alt="" className={i === active ? 'active' : ''} onClick={() => setActive(i)} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty"><div className="empty-icon"><IoCarSportOutline /></div><h4>Aucune photo</h4></div>
            )}
          </Card>

          {v.video && (
            <Card title="Vidéo de présentation" pad>
              <video src={v.video.url} controls style={{ width: '100%', borderRadius: 6, background: '#000', maxHeight: 420 }} />
            </Card>
          )}

          <Card title="Caractéristiques" pad>
            <div className="spec-grid">
              {specs.map(([Icon, label, value]) => (
                <div key={label} className="spec">
                  <Icon />
                  <small>{label}</small>
                  <strong>{value ?? '—'}</strong>
                </div>
              ))}
            </div>
            {v.features.length > 0 && (
              <>
                <h4 className="mt-3 mb-2" style={{ fontSize: 14 }}>Équipements</h4>
                <div className="chips">
                  {v.features.map((f) => (
                    <span key={f.id} className="chip" style={{ cursor: 'default' }}><FiCheck style={{ color: 'var(--gold)' }} /> {f.name}</span>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title="Tarifs" pad>
            <div className="price-box">
              <div><small>Par jour</small><strong>{v.priceDaily != null ? fmtMoney(v.priceDaily, v.currency) : '—'}</strong></div>
              <div><small>Par semaine</small><strong>{v.priceWeekly != null ? fmtMoney(v.priceWeekly, v.currency) : '—'}</strong></div>
              <div><small>Par mois</small><strong>{v.priceMonthly != null ? fmtMoney(v.priceMonthly, v.currency) : '—'}</strong></div>
            </div>
            <div className="row mt-2" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Badge tone={v.driverMode === 'none' ? '' : 'gold'}>{DRIVER_MODES[v.driverMode]?.label || 'Sans chauffeur'}</Badge>
              {v.driverMode === 'included' && <span className="small muted">Chauffeur compris dans les tarifs ci-dessus</span>}
            </div>
            {v.driverMode === 'optional' && (
              <div className="price-box mt-2">
                <div><small>Chauffeur / jour</small><strong>+ {v.driverPriceDaily != null ? fmtMoney(v.driverPriceDaily, v.currency) : '—'}</strong></div>
                <div><small>Chauffeur / semaine</small><strong>{v.driverPriceWeekly != null ? `+ ${fmtMoney(v.driverPriceWeekly, v.currency)}` : '—'}</strong></div>
                <div><small>Chauffeur / mois</small><strong>{v.driverPriceMonthly != null ? `+ ${fmtMoney(v.driverPriceMonthly, v.currency)}` : '—'}</strong></div>
              </div>
            )}
          </Card>

          <div className="grid g-2">
            <Card title="Description" pad><div className="pre muted">{v.description || '—'}</div></Card>
            <Card title="Conditions de location" pad><div className="pre muted">{v.rentalConditions || '—'}</div></Card>
          </div>
        </div>

        <div className="stack" style={{ position: 'sticky', top: 90 }}>
          <Card pad>
            <div className="row between">
              <StatusBadge map={VEHICLE_STATUS} value={v.status} />
              <StatusBadge map={AVAILABILITY} value={v.availability} />
            </div>
            <div className="row mt-2" style={{ gap: 18 }}>
              <div><div className="small muted">Consultations</div><div className="strong" style={{ fontSize: 20 }}><FiEye style={{ verticalAlign: -2 }} /> {fmtNumber(v.viewsCount)}</div></div>
              <div><div className="small muted">Contacts</div><div className="strong" style={{ fontSize: 20 }}><FiMessageCircle style={{ verticalAlign: -2 }} /> {fmtNumber(v.contactsCount)}</div></div>
            </div>
            {v.expiresAt && <hr className="divider" />}
            <ValidityBox v={v} />
            <hr className="divider" />
            <div className="stack" style={{ gap: 14 }}>
              {can('vehicles:publish') && (
                <Toggle checked={v.autoRenew} onChange={(val) => patch(`/vehicles/${v.id}/auto-renew`, { autoRenew: val }, val ? 'Renouvellement automatique activé' : 'Renouvellement automatique désactivé')} label="Renouvellement automatique" />
              )}
              {can('vehicles:manage') && (
                <div className="field">
                  <label>Disponibilité</label>
                  <Select value={v.availability} onChange={(e) => patch(`/vehicles/${v.id}/availability`, { availability: e.target.value }, 'Disponibilité mise à jour')} options={Object.entries(AVAILABILITY).map(([value, a]) => ({ value, label: a.label }))} />
                </div>
              )}
            </div>
          </Card>

          {isSuperAdmin && (
            <Card title="Modération" subtitle={v.company?.name} pad>
              <div className="stack" style={{ gap: 10 }}>
                <Link to={`/admin/companies/${v.companyId}`} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }}><FiBriefcase /> Voir l’entreprise</Link>
                {v.status === 'pending' && (
                  <>
                    <Button variant="primary" icon={FiCheck} onClick={() => setConfirm({ action: 'approve', title: 'Valider ce véhicule', message: 'Le véhicule sera visible publiquement pendant toute la durée de sa publication.' })}>Valider</Button>
                    <Button variant="danger" icon={FiX} onClick={() => setConfirm({ action: 'reject', title: 'Refuser ce véhicule', message: 'Les crédits de publication seront remboursés à l’entreprise.', reason: true, danger: true })}>Refuser</Button>
                  </>
                )}
                {v.status !== 'suspended' && v.status !== 'pending' && (
                  <Button icon={FiPause} onClick={() => setConfirm({ action: 'suspend', title: 'Suspendre ce véhicule', message: 'Le véhicule sera retiré des résultats publics. La période de validité continue de courir.', reason: true, danger: true })}>Suspendre</Button>
                )}
                {v.status === 'suspended' && (
                  <Button variant="primary" icon={FiPlay} onClick={() => setConfirm({ action: 'reactivate', title: 'Réactiver ce véhicule', message: 'Le véhicule redeviendra visible s’il est encore dans sa période de validité.' })}>Réactiver</Button>
                )}
              </div>
            </Card>
          )}

          <Card title="Historique" subtitle="Publications, renouvellements, expirations">
            <div className="card-body">
              {v.events?.length ? (
                <div className="timeline">
                  {v.events.map((e) => (
                    <div key={e.id} className={`tl-item ${['expired', 'renewal_failed', 'rejected', 'suspended'].includes(e.type) ? 'red' : ['renewed', 'approved', 'published'].includes(e.type) ? 'green' : ''}`}>
                      <div className="strong small">{EVENT_LABELS[e.type] || e.type}</div>
                      {e.details && <div className="small muted">{e.details}</div>}
                      <div className="small muted">{fmtDateTime(e.createdAt)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small muted">Aucun événement pour le moment.</div>
              )}
            </div>
          </Card>

          {can('vehicles:manage') && (
            <Button variant="ghost" icon={FiTrash2} style={{ color: 'var(--red)' }} onClick={() => setConfirm({ action: 'delete', title: 'Supprimer ce véhicule', message: 'Cette action est définitive : photos, vidéo et statistiques seront supprimées. Les crédits déjà consommés ne sont pas remboursés.', danger: true, text: 'SUPPRIMER' })}>
              Supprimer le véhicule
            </Button>
          )}
        </div>
      </div>

      <PublishDialog
        open={publish}
        vehicle={v}
        onClose={() => setPublish(false)}
        onDone={() => {
          load()
          reloadUser().catch(() => {})
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        withReason={confirm?.reason}
        confirmText={confirm?.text}
        confirmLabel="Confirmer"
        onConfirm={(val) => (confirm.action === 'delete' ? remove() : moderate(confirm.action, val))}
      />
    </>
  )
}
