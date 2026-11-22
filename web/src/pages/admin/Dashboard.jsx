import { Link } from 'react-router-dom'
import { FiActivity, FiArrowRight, FiBriefcase, FiCreditCard, FiDollarSign, FiFileText, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi'
import { IoCarSportOutline } from 'react-icons/io5'
import { Card, ErrorBox, Loader, PageHeader, StatCard, Button, Empty } from '../../components/ui'
import { AreaSeries, BarSeries, Donut, Legend, LineSeries, PALETTE } from '../../components/charts'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { fmtMoney, fmtNumber, relative } from '../../utils/format'
import { openPdf, errorMessage } from '../../api/client'
import toast from 'react-hot-toast'

const STATUS_COLORS = { active: '#12805c', pending: '#b26a00', expired: '#c0392b', suspended: '#6b46c1', draft: '#c9c3b2' }

export default function AdminDashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useApi('/stats/admin')
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (loading && !data) return <Loader />
  const d = data.data
  const t = d.totals

  const pdf = () => openPdf('/reports/statistics.pdf').catch((e) => toast.error(errorMessage(e)))

  return (
    <>
      <PageHeader title={`Bonjour ${user.firstName} 👋`} subtitle="Vue d’ensemble de l’activité de la plateforme">
        <Button icon={FiFileText} onClick={pdf}>Rapport statistique</Button>
        <Link to="/admin/companies" className="btn btn-primary">
          <FiBriefcase /> Gérer les entreprises
        </Link>
      </PageHeader>

      <div className="grid g-4">
        <StatCard dark icon={FiDollarSign} label="Revenus générés" value={fmtMoney(t.revenue)} sub={`${t.pendingPayments} paiement(s) en attente`} />
        <StatCard icon={FiBriefcase} label="Entreprises" value={fmtNumber(t.companies)} sub={`${t.activeCompanies} actives`} delay={0.05} />
        <StatCard icon={FiUsers} tone="blue" label="Clients inscrits" value={fmtNumber(t.clients)} sub={`${t.staff} collaborateurs d’entreprises`} delay={0.1} />
        <StatCard icon={IoCarSportOutline} tone="green" label="Véhicules actifs" value={`${fmtNumber(t.activeVehicles)} / ${fmtNumber(t.vehicles)}`} sub={`${t.expiredVehicles} expirés · ${t.pendingVehicles} en validation`} delay={0.15} />
        <StatCard icon={FiZap} tone="amber" label="Crédits vendus" value={fmtNumber(t.creditsSold)} delay={0.2} />
        <StatCard icon={FiTrendingUp} tone="violet" label="Crédits consommés" value={fmtNumber(t.creditsConsumed)} delay={0.25} />
        <StatCard icon={FiCreditCard} label="Crédits dans les wallets" value={fmtNumber(t.creditsInWallets)} delay={0.3} />
        <StatCard icon={FiActivity} tone="green" label="Contacts générés" value={fmtNumber(t.contacts)} sub="WhatsApp, appels et emails" delay={0.35} />
      </div>

      <div className="grid g-main mt-3">
        <Card title="Revenus mensuels" subtitle="Paiements confirmés sur 12 mois" actions={<Legend items={[['Revenus (USD)', PALETTE[0]]]} />} pad>
          <AreaSeries data={d.series} series={[{ key: 'revenue', name: 'Revenus', color: PALETTE[0] }]} format={(v) => fmtMoney(v)} />
        </Card>
        <Card title="Statut des véhicules" subtitle="Répartition du parc" pad>
          <Donut data={d.vehicleStatus.map((s) => ({ ...s, color: STATUS_COLORS[s.key] }))} centerLabel="véhicules" />
          <div className="legend mt-2" style={{ justifyContent: 'center' }}>
            {d.vehicleStatus.map((s) => (
              <span key={s.key}>
                <i style={{ background: STATUS_COLORS[s.key] }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-2 mt-3">
        <Card title="Crédits vendus vs consommés" actions={<Legend items={[['Vendus', PALETTE[2]], ['Consommés', PALETTE[1]]]} />} pad>
          <BarSeries data={d.series} series={[{ key: 'creditsSold', name: 'Vendus', color: PALETTE[2] }, { key: 'creditsConsumed', name: 'Consommés', color: PALETTE[1] }]} />
        </Card>
        <Card title="Évolution des inscriptions" actions={<Legend items={[['Entreprises', PALETTE[0]], ['Clients', PALETTE[4]]]} />} pad>
          <LineSeries data={d.series} series={[{ key: 'companies', name: 'Entreprises', color: PALETTE[0] }, { key: 'clients', name: 'Clients', color: PALETTE[4] }]} />
        </Card>
      </div>

      <div className="grid g-3 mt-3">
        <Card title="Statistiques de publication" actions={<Legend items={[['Publications', PALETTE[0]], ['Renouvellements', PALETTE[3]]]} />} pad>
          <BarSeries height={230} stacked data={d.series} series={[{ key: 'publications', name: 'Publications', color: PALETTE[0] }, { key: 'renewals', name: 'Renouvellements', color: PALETTE[3] }]} />
        </Card>
        <Card title="Entreprises les plus actives" subtitle="Par crédits consommés" actions={<Link to="/admin/companies" className="btn btn-ghost btn-sm">Tout voir <FiArrowRight /></Link>}>
          {d.topCompanies.length ? (
            d.topCompanies.map((c, i) => (
              <Link to={`/admin/companies/${c.id}`} key={c.id} className="list-item">
                <span className="rank">{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong">{c.name}</div>
                  <div className="small muted">
                    {c.vehicles} véhicule(s) · {c.contacts} contact(s)
                  </div>
                </div>
                <div className="right">
                  <div className="strong">{fmtNumber(c.creditsSpent)}</div>
                  <div className="small muted">crédits</div>
                </div>
              </Link>
            ))
          ) : (
            <Empty title="Aucune activité" />
          )}
        </Card>
        <Card title="Activité récente" actions={<Link to="/admin/logs" className="btn btn-ghost btn-sm">Journal <FiArrowRight /></Link>}>
          {d.recentActivity.map((a) => (
            <div key={a.id} className="list-item">
              <div className="list-icon"><FiActivity /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description || a.action}</div>
                <div className="small muted">
                  {a.user}
                  {a.company ? ` · ${a.company}` : ''} · {relative(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Véhicules par catégorie" className="mt-3" pad>
        <div className="row wrap" style={{ gap: 28 }}>
          {d.byCategory.map((c, i) => (
            <div key={c.name} style={{ minWidth: 160, flex: 1 }}>
              <div className="row between small">
                <span className="strong">{c.name}</span>
                <span className="muted">{c.value}</span>
              </div>
              <div className="progress mt-1">
                <div style={{ width: `${(c.value / Math.max(1, t.vehicles)) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
