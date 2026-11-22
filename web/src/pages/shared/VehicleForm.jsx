import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiDollarSign, FiFileText, FiImage, FiInfo, FiMapPin, FiSave, FiSettings, FiStar, FiUser, FiXCircle, FiZap } from 'react-icons/fi'
import { Button, Card, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea, Toggle } from '../../components/ui'
import MediaManager, { MIN_PHOTOS } from '../../components/MediaManager'
import { PublishDialog } from '../../components/vehicles'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { AVAILABILITY, DRIVER_MODES, FUEL, TRANSMISSION } from '../../utils/format'

const EMPTY = {
  companyId: '', categoryId: '', brand: '', model: '', year: '', fuelType: '', transmission: '', seats: '', doors: '', color: '', plateNumber: '',
  mileage: '', city: '', address: '', priceDaily: '', priceWeekly: '', priceMonthly: '', currency: 'USD',
  driverMode: 'none', driverPriceDaily: '', driverPriceWeekly: '', driverPriceMonthly: '',
  description: '', rentalConditions: '', availability: 'available', autoRenew: true, featureIds: [],
}
const NUMERIC = ['categoryId', 'year', 'seats', 'doors', 'mileage', 'priceDaily', 'priceWeekly', 'priceMonthly', 'driverPriceDaily', 'driverPriceWeekly', 'driverPriceMonthly', 'companyId']

/** Contrôles de complétude identiques à ceux du serveur. */
function checklist(f, photos) {
  return [
    { ok: f.brand && f.model, label: 'Marque et modèle' },
    { ok: Boolean(f.year), label: 'Année de fabrication' },
    { ok: Boolean(f.categoryId), label: 'Catégorie' },
    { ok: f.fuelType && f.transmission, label: 'Carburant et transmission' },
    { ok: f.seats && f.doors !== '', label: 'Places et portes' },
    { ok: Boolean(f.color), label: 'Couleur' },
    { ok: Boolean(f.plateNumber), label: 'Immatriculation' },
    { ok: Boolean(f.city), label: 'Localisation' },
    { ok: Boolean(f.priceDaily || f.priceWeekly || f.priceMonthly), label: 'Au moins un tarif' },
    ...(f.driverMode === 'optional' ? [{ ok: f.driverPriceDaily !== '' && f.driverPriceDaily !== null, label: 'Supplément chauffeur par jour' }] : []),
    { ok: Boolean(f.description?.trim()), label: 'Description' },
    { ok: Boolean(f.rentalConditions?.trim()), label: 'Conditions de location' },
    { ok: photos >= MIN_PHOTOS, label: `${MIN_PHOTOS} photos minimum (${photos}/${MIN_PHOTOS})` },
  ]
}

export default function VehicleForm({ base }) {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const { isSuperAdmin, can, reloadUser } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [vehicle, setVehicle] = useState(null)
  const [pending, setPending] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [publishOpen, setPublishOpen] = useState(false)

  const cats = useApi('/catalog/categories')
  const feats = useApi('/catalog/features')
  const companies = useApi(isSuperAdmin && !editing ? '/companies/options' : null)

  useEffect(() => {
    if (!editing) return
    api
      .get(`/vehicles/${id}`)
      .then(({ data }) => {
        const v = data.data
        setVehicle(v)
        const f = { ...EMPTY }
        for (const k of Object.keys(EMPTY)) if (v[k] !== undefined && v[k] !== null) f[k] = v[k]
        f.featureIds = v.features.map((x) => x.id)
        setForm(f)
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }, [id, editing])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const photos = (vehicle?.photos.length || 0) + pending.filter((p) => p.type === 'photo').length
  const checks = useMemo(() => checklist(form, photos), [form, photos])
  const ready = checks.every((c) => c.ok)
  const published = vehicle && ['active', 'pending'].includes(vehicle.status)
  const canPublish = can('vehicles:publish') && vehicle && ['draft', 'expired', 'rejected'].includes(vehicle.status)

  const payload = () => {
    const p = { ...form }
    for (const k of NUMERIC) p[k] = p[k] === '' || p[k] === null ? null : Number(p[k])
    for (const k of ['fuelType', 'transmission']) if (!p[k]) p[k] = null
    if (!isSuperAdmin || editing) delete p.companyId
    return p
  }

  const uploadPending = async (vehicleId) => {
    if (!pending.length) return null
    const fd = new FormData()
    pending.forEach((p) => fd.append(p.type === 'video' ? 'video' : 'photos', p.file))
    setProgress(0)
    try {
      const r = await api.post(`/vehicles/${vehicleId}/media`, fd, {
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
        timeout: 300000,
      })
      pending.forEach((p) => URL.revokeObjectURL(p.url))
      setPending([])
      return r.data.data
    } finally {
      setProgress(null)
    }
  }

  const save = async ({ thenPublish } = {}) => {
    setErrors({})
    if (!form.brand || !form.model) {
      setErrors({ brand: !form.brand && 'Requis', model: !form.model && 'Requis' })
      toast.error('Marque et modèle sont obligatoires')
      return
    }
    if (isSuperAdmin && !editing && !form.companyId) {
      setErrors({ companyId: 'Sélectionnez une entreprise' })
      return
    }
    if (published && !ready) {
      toast.error('Un véhicule publié doit rester complet')
      return
    }
    setSaving(true)
    try {
      const { data } = editing ? await api.patch(`/vehicles/${id}`, payload()) : await api.post('/vehicles', payload())
      let v = data.data
      try {
        v = (await uploadPending(v.id)) || v
      } catch (e) {
        toast.error(`Informations enregistrées, mais l’envoi des médias a échoué : ${errorMessage(e)}`)
        nav(`${base}/vehicles/${v.id}/edit`, { replace: true })
        setVehicle(v)
        return
      }
      setVehicle(v)
      toast.success(editing ? 'Véhicule mis à jour' : 'Véhicule enregistré en brouillon')
      if (thenPublish && v.completeness.ready) {
        // On reste sur la page : changer de route démonterait la boîte de publication.
        setPublishOpen(true)
      } else {
        nav(`${base}/vehicles/${v.id}`)
      }
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteMedia = async (mediaId) => {
    try {
      const { data } = await api.delete(`/vehicles/${id}/media/${mediaId}`)
      setVehicle(data.data)
      toast.success('Média supprimé')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const reorder = async (ids) => {
    try {
      const { data } = await api.put(`/vehicles/${id}/media/order`, { ids })
      setVehicle(data.data)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (loadError) return <ErrorBox error={loadError} />
  if (editing && !vehicle) return <Loader />

  const E = (k) => errors[k]
  const toggleFeature = (fid) => setForm((f) => ({ ...f, featureIds: f.featureIds.includes(fid) ? f.featureIds.filter((x) => x !== fid) : [...f.featureIds, fid] }))
  const year = new Date().getFullYear()

  return (
    <>
      <PageHeader
        title={editing ? `Modifier ${vehicle.title}` : 'Nouveau véhicule'}
        subtitle={editing ? 'Mettez à jour les informations, les prix et les médias' : 'Renseignez la fiche complète puis ajoutez au moins 4 photos'}
        crumbs={[{ label: 'Véhicules', to: `${base}/vehicles` }, { label: editing ? vehicle.title : 'Nouveau' }]}
      />

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="card">
          {isSuperAdmin && !editing && (
            <div className="form-section">
              <h4>Entreprise propriétaire</h4>
              <Field required error={E('companyId')}>
                <Select value={form.companyId} onChange={set('companyId')} placeholder="Sélectionner…" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} invalid={E('companyId')} />
              </Field>
            </div>
          )}

          <div className="form-section">
            <h4><FiInfo /> Informations générales</h4>
            <p>Identification du véhicule.</p>
            <div className="form-grid cols-3">
              <Field label="Marque" required error={E('brand')}><Input value={form.brand} onChange={set('brand')} placeholder="Toyota" invalid={E('brand')} /></Field>
              <Field label="Modèle" required error={E('model')}><Input value={form.model} onChange={set('model')} placeholder="Land Cruiser" invalid={E('model')} /></Field>
              <Field label="Année" required error={E('year')}><Input type="number" min="1950" max={year + 1} value={form.year} onChange={set('year')} placeholder={year} /></Field>
              <Field label="Catégorie" required error={E('categoryId')}><Select value={form.categoryId} onChange={set('categoryId')} placeholder="Choisir…" options={(cats.data?.data || []).filter((c) => c.active || c.id === Number(form.categoryId)).map((c) => ({ value: c.id, label: c.name }))} /></Field>
              <Field label="Couleur" required error={E('color')}><Input value={form.color} onChange={set('color')} placeholder="Blanc nacré" /></Field>
              <Field label="Immatriculation" required error={E('plateNumber')} hint="Jamais affichée publiquement"><Input value={form.plateNumber} onChange={set('plateNumber')} placeholder="1234AB01" style={{ textTransform: 'uppercase' }} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h4><FiSettings /> Caractéristiques techniques</h4>
            <p>Utilisées par les filtres de recherche des clients.</p>
            <div className="form-grid cols-3">
              <Field label="Carburant" required><Select value={form.fuelType} onChange={set('fuelType')} placeholder="Choisir…" options={Object.entries(FUEL).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Transmission" required><Select value={form.transmission} onChange={set('transmission')} placeholder="Choisir…" options={Object.entries(TRANSMISSION).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Kilométrage (km)"><Input type="number" min="0" value={form.mileage} onChange={set('mileage')} /></Field>
              <Field label="Nombre de places" required error={E('seats')}><Input type="number" min="1" max="100" value={form.seats} onChange={set('seats')} /></Field>
              <Field label="Nombre de portes" required error={E('doors')}><Input type="number" min="0" max="10" value={form.doors} onChange={set('doors')} /></Field>
              <Field label="Disponibilité"><Select value={form.availability} onChange={set('availability')} options={Object.entries(AVAILABILITY).map(([value, v]) => ({ value, label: v.label }))} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h4><FiMapPin /> Localisation & tarifs</h4>
            <p>Renseignez au moins un tarif.</p>
            <div className="form-grid">
              <Field label="Ville" required error={E('city')}><Input value={form.city} onChange={set('city')} placeholder="Kinshasa" /></Field>
              <Field label="Adresse de prise en charge"><Input value={form.address} onChange={set('address')} placeholder="Avenue, quartier…" /></Field>
            </div>
            <div className="form-grid cols-3 mt-2">
              <Field label="Prix journalier" error={E('priceDaily')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.priceDaily} onChange={set('priceDaily')} /></div></Field>
              <Field label="Prix hebdomadaire" error={E('priceWeekly')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.priceWeekly} onChange={set('priceWeekly')} /></div></Field>
              <Field label="Prix mensuel" error={E('priceMonthly')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.priceMonthly} onChange={set('priceMonthly')} /></div></Field>
            </div>
            <div className="form-grid mt-2">
              <Field label="Devise"><Select value={form.currency} onChange={set('currency')} options={['USD', 'CDF', 'EUR', 'XAF'].map((c) => ({ value: c, label: c }))} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h4><FiUser /> Chauffeur</h4>
            <p>Le client choisit avec ou sans chauffeur dans l’application ; le supplément s’ajoute à son estimation.</p>
            <div className="choice-cards">
              {Object.entries(DRIVER_MODES).map(([value, m]) => (
                <button type="button" key={value} className={`choice-card${form.driverMode === value ? ' active' : ''}`} onClick={() => set('driverMode')(value)} aria-pressed={form.driverMode === value}>
                  <strong>{m.label}</strong>
                  <span>{m.help}</span>
                </button>
              ))}
            </div>
            {form.driverMode === 'optional' && (
              <>
                <div className="form-grid cols-3 mt-2">
                  <Field label="Supplément / jour" required error={E('driverPriceDaily')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.driverPriceDaily} onChange={set('driverPriceDaily')} /></div></Field>
                  <Field label="Supplément / semaine" hint="Facultatif (sinon 7 × jour)" error={E('driverPriceWeekly')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.driverPriceWeekly} onChange={set('driverPriceWeekly')} /></div></Field>
                  <Field label="Supplément / mois" hint="Facultatif" error={E('driverPriceMonthly')}><div className="input-icon"><FiDollarSign /><input className="input" type="number" min="0" step="0.01" value={form.driverPriceMonthly} onChange={set('driverPriceMonthly')} /></div></Field>
                </div>
                {form.priceDaily !== '' && form.driverPriceDaily !== '' && (
                  <p className="small muted mt-2">
                    Aperçu par jour : {Number(form.priceDaily)} {form.currency} sans chauffeur · <strong>{Number(form.priceDaily) + Number(form.driverPriceDaily)} {form.currency}</strong> avec chauffeur
                  </p>
                )}
              </>
            )}
            {form.driverMode === 'included' && <p className="small muted mt-2">Les tarifs saisis ci-dessus incluent le chauffeur ; la location sans chauffeur n’est pas proposée.</p>}
          </div>

          <div className="form-section">
            <h4><FiFileText /> Description & conditions</h4>
            <div className="stack" style={{ gap: 16 }}>
              <Field label="Description" required error={E('description')}><Textarea value={form.description} onChange={set('description')} placeholder="État, entretien, points forts…" /></Field>
              <Field label="Conditions de location" required error={E('rentalConditions')} hint="Âge minimum, caution, kilométrage, documents requis…"><Textarea value={form.rentalConditions} onChange={set('rentalConditions')} /></Field>
            </div>
          </div>

          <div className="form-section">
            <h4><FiStar /> Équipements</h4>
            <p>Sélectionnez les équipements disponibles.</p>
            <div className="chips">
              {(feats.data?.data || []).filter((f) => f.active).map((f) => (
                <button type="button" key={f.id} className={`chip gold ${form.featureIds.includes(f.id) ? 'active' : ''}`} onClick={() => toggleFeature(f.id)}>
                  {form.featureIds.includes(f.id) && <FiCheckCircle />} {f.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h4><FiImage /> Photos & vidéo</h4>
            <p>4 photos obligatoires (avant, côté, intérieur, arrière recommandés). Vidéo facultative de 20 Mo maximum.</p>
            <MediaManager existing={vehicle || { photos: [], video: null }} pending={pending} setPending={setPending} onDelete={deleteMedia} onReorder={reorder} progress={progress} />
          </div>
        </div>

        <div className="stack" style={{ position: 'sticky', top: 90 }}>
          <Card title="Prêt à publier ?" subtitle={ready ? 'Toutes les informations obligatoires sont renseignées' : 'Complétez les éléments manquants'} pad>
            <div className={`progress mb-2 ${ready ? 'green' : ''}`}>
              <div style={{ width: `${(checks.filter((c) => c.ok).length / checks.length) * 100}%` }} />
            </div>
            <ul className="checklist">
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? 'ok' : 'ko'}>
                  {c.ok ? <FiCheckCircle /> : <FiXCircle />} <span style={{ color: 'var(--text)' }}>{c.label}</span>
                </li>
              ))}
            </ul>
            <hr className="divider" />
            <Toggle checked={form.autoRenew} onChange={set('autoRenew')} label="Renouvellement automatique à l’échéance" />
            <div className="stack mt-2" style={{ gap: 10 }}>
              <Button variant="dark" icon={FiSave} block loading={saving} onClick={() => save()}>
                {editing ? 'Enregistrer les modifications' : 'Enregistrer le brouillon'}
              </Button>
              {(canPublish || (!editing && can('vehicles:publish'))) && (
                <Button variant="primary" icon={FiZap} block disabled={!ready || saving} onClick={() => save({ thenPublish: true })}>
                  Enregistrer et publier
                </Button>
              )}
              <Button variant="ghost" block onClick={() => nav(-1)}>Annuler</Button>
            </div>
          </Card>
        </div>
      </div>

      <PublishDialog
        open={publishOpen}
        vehicle={vehicle}
        onClose={() => {
          setPublishOpen(false)
          // Publication annulée pour un nouveau véhicule : afficher sa fiche (brouillon enregistré).
          if (!editing && vehicle) nav(`${base}/vehicles/${vehicle.id}`, { replace: true })
        }}
        onDone={(v) => {
          reloadUser().catch(() => {})
          nav(`${base}/vehicles/${v.id}`)
        }}
      />
    </>
  )
}
