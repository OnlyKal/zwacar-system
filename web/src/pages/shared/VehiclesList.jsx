import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FiPlus } from 'react-icons/fi'
import { IoCarSportOutline } from 'react-icons/io5'
import { Card, Empty, ErrorBox, FilterChips, Loader, PageHeader, Pagination, SearchInput, Select } from '../../components/ui'
import { VehicleCard } from '../../components/vehicles'
import { useApi, useDebounce } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { VEHICLE_STATUS } from '../../utils/format'

export default function VehiclesList({ base }) {
  const { isSuperAdmin, can } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(sp.get('status') || '')
  const [categoryId, setCategoryId] = useState('')
  const [companyId, setCompanyId] = useState(sp.get('companyId') || '')
  const [sort, setSort] = useState(sp.get('sort') || 'recent')
  const [expiring] = useState(sp.get('expiring') || '')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)

  useEffect(() => setPage(1), [dq, status, categoryId, companyId, sort])

  const { data, loading, error, reload } = useApi('/vehicles', { q: dq, status, categoryId, companyId, sort, page, limit: 12, expiringDays: expiring })
  const cats = useApi('/catalog/categories')
  const companies = useApi(isSuperAdmin ? '/companies/options' : null)

  const counts = data?.statusCounts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const chips = [{ value: '', label: 'Tous', count: total }, ...Object.entries(VEHICLE_STATUS).map(([k, v]) => ({ value: k, label: v.label, count: counts[k] || 0 }))].filter((c) => c.value === '' || c.count > 0 || c.value === status)

  return (
    <>
      <PageHeader title={isSuperAdmin ? 'Véhicules de la plateforme' : 'Mes véhicules'} subtitle={expiring ? `Véhicules expirant sous ${expiring} jours` : 'Gérez votre flotte, vos publications et leur disponibilité'}>
        {can('vehicles:manage') && (
          <Link to={`${base}/vehicles/new`} className="btn btn-primary">
            <FiPlus /> Ajouter un véhicule
          </Link>
        )}
      </PageHeader>

      <Card>
        <div className="toolbar" style={{ paddingBottom: 4 }}>
          <FilterChips options={chips} value={status} onChange={setStatus} />
        </div>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Marque, modèle, immatriculation, ville…" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Toutes catégories" options={(cats.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          {isSuperAdmin && <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toutes entreprises" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />}
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={[
              { value: 'recent', label: 'Plus récents' },
              { value: 'expiry', label: 'Expiration proche' },
              { value: 'views', label: 'Plus consultés' },
              { value: 'price', label: 'Prix croissant' },
              { value: 'brand', label: 'Marque (A-Z)' },
            ]}
          />
        </div>
      </Card>

      <div className="mt-3">
        {error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loader />
        ) : !data.data.length ? (
          <Card>
            <Empty icon={IoCarSportOutline} title="Aucun véhicule" text="Aucun véhicule ne correspond à ces critères.">
              {can('vehicles:manage') && (
                <Link to={`${base}/vehicles/new`} className="btn btn-primary">
                  <FiPlus /> Ajouter un véhicule
                </Link>
              )}
            </Empty>
          </Card>
        ) : (
          <>
            <div className="vehicle-grid" style={{ opacity: loading ? 0.6 : 1 }}>
              {data.data.map((v, i) => (
                <VehicleCard key={v.id} v={v} index={i} showCompany={isSuperAdmin} onClick={() => nav(`${base}/vehicles/${v.id}`)} />
              ))}
            </div>
            <Card className="mt-2">
              <Pagination meta={data.meta} onPage={setPage} />
            </Card>
          </>
        )}
      </div>
    </>
  )
}
