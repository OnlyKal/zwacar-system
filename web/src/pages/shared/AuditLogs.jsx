import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiActivity, FiMail } from 'react-icons/fi'
import { Badge, Card, DataTable, Empty, Input, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs } from '../../components/ui'
import { useApi, useDebounce } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { fmtDateTime } from '../../utils/format'

const DOMAINS = [
  ['auth', 'Authentification'],
  ['company', 'Entreprises'],
  ['user', 'Utilisateurs'],
  ['vehicle', 'Véhicules'],
  ['payment', 'Paiements'],
  ['wallet', 'Wallet'],
  ['settings', 'Paramètres'],
  ['report', 'Rapports'],
  ['backup', 'Sauvegardes'],
]
const EMAIL_STATUS = { sent: { label: 'Envoyé', tone: 'green' }, failed: { label: 'Échec', tone: 'red' }, skipped: { label: 'Non envoyé (SMTP inactif)', tone: 'amber' } }
const domainTone = { auth: 'blue', vehicle: 'gold', payment: 'green', wallet: 'green', company: 'violet', settings: 'dark', backup: 'dark' }

function Logs({ initialCompany }) {
  const { isSuperAdmin } = useAuth()
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [companyId, setCompanyId] = useState(initialCompany || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [dq, action, companyId, from, to])
  const { data, loading, error, reload } = useApi('/audit/logs', { q: dq, action, companyId, from, to, page })
  const companies = useApi(isSuperAdmin ? '/companies/options' : null)
  return (
    <Card>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher dans les descriptions…" />
        <Select value={action} onChange={(e) => setAction(e.target.value)} placeholder="Tous les domaines" options={DOMAINS.map(([value, label]) => ({ value, label }))} />
        {isSuperAdmin && <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toutes entreprises" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <DataTable
        rows={data?.data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<Empty icon={FiActivity} title="Aucune opération" />}
        columns={[
          { key: 'date', label: 'Date', render: (l) => <span className="nowrap">{fmtDateTime(l.createdAt)}</span> },
          { key: 'user', label: 'Auteur', render: (l) => (l.user ? <div><div className="cell-main">{l.user.firstName} {l.user.lastName}</div><div className="cell-sub">{l.user.email}</div></div> : <Badge tone="dark" plain>Système</Badge>) },
          ...(isSuperAdmin ? [{ key: 'company', label: 'Entreprise', render: (l) => l.company?.name || <span className="muted">—</span> }] : []),
          { key: 'action', label: 'Action', render: (l) => <Badge tone={domainTone[l.action.split('.')[0]] || ''} plain><span className="mono">{l.action}</span></Badge> },
          { key: 'description', label: 'Description', render: (l) => l.description },
          { key: 'ip', label: 'IP', render: (l) => <span className="mono small muted">{l.ip}</span> },
        ]}
      />
      <Pagination meta={data?.meta} onPage={setPage} />
    </Card>
  )
}

function Emails() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [dq, status])
  const { data, loading, error, reload } = useApi('/audit/emails', { status, q: dq, page })
  return (
    <Card>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Destinataire, objet…" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Tous statuts" options={Object.entries(EMAIL_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <DataTable
        rows={data?.data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<Empty icon={FiMail} title="Aucun email" />}
        columns={[
          { key: 'date', label: 'Date', render: (l) => <span className="nowrap">{fmtDateTime(l.createdAt)}</span> },
          { key: 'to', label: 'Destinataire', render: (l) => l.to },
          { key: 'subject', label: 'Objet', render: (l) => <div><div className="cell-main">{l.subject}</div><div className="cell-sub mono">{l.template}</div></div> },
          { key: 'status', label: 'Statut', render: (l) => <div><StatusBadge map={EMAIL_STATUS} value={l.status} />{l.error && <div className="cell-sub mt-1" style={{ maxWidth: 260 }}>{l.error}</div>}</div> },
        ]}
      />
      <Pagination meta={data?.meta} onPage={setPage} />
    </Card>
  )
}

export default function AuditLogs() {
  const { isSuperAdmin } = useAuth()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState('logs')
  return (
    <>
      <PageHeader title="Journal d’activité" subtitle="Traçabilité des opérations sensibles effectuées sur la plateforme" />
      {isSuperAdmin && (
        <div className="mb-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'logs', label: 'Opérations', icon: FiActivity }, { value: 'emails', label: 'Emails envoyés', icon: FiMail }]} />
        </div>
      )}
      {tab === 'logs' ? <Logs initialCompany={sp.get('companyId')} /> : <Emails />}
    </>
  )
}
