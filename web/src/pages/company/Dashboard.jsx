import { Link } from 'react-router-dom'
import { FiAlertTriangle, FiArrowRight, FiClock, FiCreditCard, FiEye, FiMail, FiMessageCircle, FiPhone, FiPlus, FiRefreshCw, FiTrendingDown } from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import { IoCarSportOutline } from 'react-icons/io5'
import { Badge, Card, Empty, ErrorBox, Loader, PageHeader, StatCard, StatusBadge } from '../../components/ui'
import { AreaSeries, BarSeries, Donut, Legend, PALETTE } from '../../components/charts'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { daysUntil, fmtDate, fmtMoney, fmtNumber, VEHICLE_STATUS } from '../../utils/format'

export default function CompanyDashboard() {
  const { user, can } = useAuth()
  const { data, loading, error, reload } = useApi('/stats/company')
  const billing = useApi('/settings/billing')
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (loading && !data) return <Loader />
  const d = data.data
  const t = d.totals
  const cost = billing.data?.data?.publishCost || 12
  const low = t.walletBalance < cost

  return (
    <>
      <PageHeader title={`Bonjour ${user.firstName} 👋`} subtitle={`Tableau de bord de ${d.company.name}`}>
        {can('wallet:topup') && (
          <Link to="/company/wallet?topup=1" className="btn">
            <FiCreditCard /> Recharger
          </Link>
        )}
        {can('vehicles:manage') && (
          <Link to="/company/vehicles/new" className="btn btn-primary">
            <FiPlus /> Ajouter un véhicule
          </Link>
        )}
      </PageHeader>

      {low && can('wallet:view') && (
        <div className="callout red mb-2">
          <FiAlertTriangle />
          <div style={{ flex: 1 }}>
            <b>Solde insuffisant</b> : {t.walletBalance} crédit(s), une publication ou un renouvellement coûte {cost} crédits. Les véhicules arrivant à échéance seront désactivés.
          </div>
          <Link to="/company/wallet?topup=1" className="btn btn-sm btn-danger">Recharger</Link>
        </div>
      )}

      <div className="grid g-4">
        <StatCard dark icon={FiCreditCard} label="Solde du wallet" value={`${fmtNumber(t.walletBalance)} crédits`} sub={`≈ ${Math.floor(t.walletBalance / cost)} publication(s)`} />
        <StatCard icon={IoCarSportOutline} tone="green" label="Véhicules actifs" value={`${t.activeVehicles} / ${t.vehicles}`} sub={`${t.draftVehicles} brouillon(s) · ${t.pendingVehicles} en validation`} delay={0.05} />
        <StatCard icon={FiClock} tone="red" label="Véhicules expirés" value={t.expiredVehicles} sub={`${t.upcomingExpirations} expiration(s) sous 60 jours`} delay={0.1} />
        <StatCard icon={FiTrendingDown} tone="amber" label="Crédits dépensés" value={fmtNumber(t.creditsSpent)} sub={`${fmtMoney(t.amountPaid)} rechargés au total`} delay={0.15} />
      </div>

      <div className="grid g-main mt-3">
        <Card title="Consultations et contacts" subtitle="Intérêt des clients sur 12 mois" actions={<Legend items={[['Consultations', PALETTE[2]], ['Contacts', PALETTE[0]]]} />} pad>
          <AreaSeries data={d.series} series={[{ key: 'views', name: 'Consultations', color: PALETTE[2] }, { key: 'contacts', name: 'Contacts', color: PALETTE[0] }]} />
        </Card>
        <Card title="Contacts générés" subtitle={`${fmtNumber(t.contacts)} contacts · ${fmtNumber(t.views)} consultations`} pad>
          <Donut data={d.channels.map((c, i) => ({ name: { whatsapp: 'WhatsApp', phone: 'Appels', email: 'Emails' }[c.channel], value: c.value, color: ['#25D366', PALETTE[0], PALETTE[1]][i] }))} centerLabel="contacts" />
          <div className="row mt-2" style={{ justifyContent: 'space-around' }}>
            {d.channels.map((c) => (
              <div key={c.channel} className="center">
                <div style={{ fontSize: 18, color: c.channel === 'whatsapp' ? '#25D366' : 'var(--gold)' }}>{c.channel === 'whatsapp' ? <FaWhatsapp /> : c.channel === 'phone' ? <FiPhone /> : <FiMail />}</div>
                <div className="strong">{c.value}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-3 mt-3">
        <Card title="Prochaines expirations" subtitle="Sous 60 jours" actions={<Link to="/company/vehicles?expiring=60" className="btn btn-ghost btn-sm">Voir <FiArrowRight /></Link>}>
          {d.upcoming.length ? (
            d.upcoming.map((v) => {
              const days = daysUntil(v.expiresAt)
              return (
                <Link key={v.id} to={`/company/vehicles/${v.id}`} className="list-item">
                  <div className="list-icon" style={days <= 7 ? { background: 'var(--red-bg)', color: 'var(--red)' } : undefined}>
                    <FiClock />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="strong">{v.brand} {v.model}</div>
                    <div className="small muted">
                      {fmtDate(v.expiresAt)} · {v.autoRenew ? <span><FiRefreshCw style={{ verticalAlign: -2 }} /> renouvellement auto</span> : 'renouvellement désactivé'}
                    </div>
                  </div>
                  <Badge tone={days <= 7 ? 'red' : 'amber'}>J-{days}</Badge>
                </Link>
              )
            })
          ) : (
            <Empty icon={FiClock} title="Aucune expiration proche" />
          )}
        </Card>
        <Card title="Dépenses de crédits" pad>
          <BarSeries height={230} data={d.series} series={[{ key: 'spent', name: 'Crédits', color: PALETTE[0] }]} />
        </Card>
        <Card title="Véhicules les plus consultés" actions={<Link to="/company/vehicles?sort=views" className="btn btn-ghost btn-sm">Tous <FiArrowRight /></Link>}>
          {d.topVehicles.length ? (
            d.topVehicles.map((v, i) => (
              <Link key={v.id} to={`/company/vehicles/${v.id}`} className="list-item">
                <span className="rank">{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div className="strong">{v.brand} {v.model}</div>
                  <StatusBadge map={VEHICLE_STATUS} value={v.status} />
                </div>
                <div className="small right">
                  <div><FiEye style={{ verticalAlign: -2 }} /> {v.viewsCount}</div>
                  <div className="muted"><FiMessageCircle style={{ verticalAlign: -2 }} /> {v.contactsCount}</div>
                </div>
              </Link>
            ))
          ) : (
            <Empty title="Aucun véhicule" />
          )}
        </Card>
      </div>
    </>
  )
}
