import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCamera, FiCreditCard, FiDollarSign, FiEye, FiFileText, FiMessageCircle, FiPlus, FiSave, FiSend } from 'react-icons/fi'
import { IoCarSportOutline } from 'react-icons/io5'
import { Avatar, Badge, Button, Card, DataTable, ErrorBox, Field, Input, Loader, Modal, PageHeader, StatCard, StatusBadge, FilterChips } from '../../components/ui'
import CompanyFields, { companyPayload } from '../../components/CompanyForm'
import { api, errorMessage, fieldErrors, openPdf } from '../../api/client'
import { fmtDate, fmtMoney, fmtNumber, USER_STATUS, relative } from '../../utils/format'

function AdjustModal({ company, open, onClose, onDone }) {
  const [dir, setDir] = useState('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const key = useRef(crypto.randomUUID())
  useEffect(() => {
    if (open) {
      setAmount('')
      setReason('')
      key.current = crypto.randomUUID()
    }
  }, [open])
  const submit = async () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) return toast.error('Montant invalide')
    if (reason.trim().length < 3) return toast.error('Motif requis')
    setLoading(true)
    try {
      await api.post(`/companies/${company.id}/wallet/adjust`, { amount: dir === 'credit' ? n : -n, reason, idempotencyKey: key.current })
      toast.success('Wallet ajusté')
      onDone()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Ajuster le wallet" subtitle={`${company.name} — solde actuel : ${company.walletBalance} crédits`} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit}>Valider</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <FilterChips value={dir} onChange={setDir} options={[{ value: 'credit', label: '+ Créditer' }, { value: 'debit', label: '− Débiter' }]} />
        <Field label="Nombre de crédits"><Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Motif" hint="Visible dans l’historique de l’entreprise"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Geste commercial, correction…" /></Field>
      </div>
    </Modal>
  )
}

export default function CompanyDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [adjust, setAdjust] = useState(false)
  const [notify, setNotify] = useState(false)
  const [msg, setMsg] = useState({ title: '', message: '' })
  const logo = useRef()

  const load = () =>
    api.get(`/companies/${id}`).then((r) => {
      setC(r.data.data)
      setForm(r.data.data)
    }).catch((e) => setError(errorMessage(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) return <ErrorBox error={error} />
  if (!c) return <Loader />

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      await api.patch(`/companies/${id}`, companyPayload(form))
      toast.success('Entreprise mise à jour')
      load()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const uploadLogo = async (file) => {
    const fd = new FormData()
    fd.append('logo', file)
    try {
      await api.post(`/companies/${id}/logo`, fd)
      toast.success('Logo mis à jour')
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const sendNotify = async () => {
    try {
      await api.post('/settings/notify', { companyIds: [c.id], ...msg })
      toast.success('Notification envoyée par email')
      setNotify(false)
      setMsg({ title: '', message: '' })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const pdf = (type) => openPdf(`/reports/${type}.pdf?companyId=${c.id}`).catch((e) => toast.error(errorMessage(e)))
  const s = c.stats

  return (
    <>
      <PageHeader title={c.name} subtitle={`Inscrite le ${fmtDate(c.createdAt)} · ${c.city || ''}`} crumbs={[{ label: 'Entreprises', to: '/admin/companies' }, { label: c.name }]}>
        {c.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspendue{c.suspendedReason ? ` — ${c.suspendedReason}` : ''}</Badge>}
        <Button icon={FiSend} onClick={() => setNotify(true)}>Notifier</Button>
        <Button variant="primary" icon={FiCreditCard} onClick={() => setAdjust(true)}>Ajuster le wallet</Button>
      </PageHeader>

      <div className="grid g-4">
        <StatCard dark icon={FiCreditCard} label="Solde wallet" value={`${fmtNumber(c.walletBalance)} cr.`} sub={`${fmtNumber(s.creditsSpent)} crédits consommés`} />
        <StatCard icon={IoCarSportOutline} tone="green" label="Véhicules actifs" value={`${s.active} / ${s.vehicles}`} sub={`${s.expired} expiré(s)`} />
        <StatCard icon={FiDollarSign} tone="amber" label="Revenus générés" value={fmtMoney(s.revenue)} />
        <StatCard icon={FiMessageCircle} tone="blue" label="Contacts générés" value={fmtNumber(s.contacts)} />
      </div>

      <div className="grid g-main mt-3" style={{ alignItems: 'start' }}>
        <Card title="Profil de l’entreprise" actions={<Button variant="primary" size="sm" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>}>
          <div className="card-body">
            <div className="row mb-2" style={{ gap: 16 }}>
              <Avatar size="lg" src={c.logoUrl} user={{ firstName: c.name }} />
              <Button size="sm" icon={FiCamera} onClick={() => logo.current.click()}>Changer le logo</Button>
              <input ref={logo} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
            </div>
            <CompanyFields form={form} setForm={setForm} errors={errors} />
          </div>
        </Card>
        <div className="stack">
          <Card title="Raccourcis" pad>
            <div className="stack" style={{ gap: 8 }}>
              <Link className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} to={`/admin/vehicles?companyId=${c.id}`}><IoCarSportOutline /> Véhicules</Link>
              <Link className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} to={`/admin/transactions?companyId=${c.id}`}><FiCreditCard /> Historique des crédits</Link>
              <Link className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} to={`/admin/payments?companyId=${c.id}`}><FiDollarSign /> Paiements</Link>
              <Link className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} to={`/admin/logs?companyId=${c.id}`}><FiEye /> Journal d’activité</Link>
            </div>
          </Card>
          <Card title="Rapports PDF" pad>
            <div className="stack" style={{ gap: 8 }}>
              {[['statistics', 'Rapport statistique'], ['credits', 'Consommation des crédits'], ['financial', 'Rapport financier'], ['vehicles', 'Rapport des véhicules'], ['activity', 'Rapport d’activité']].map(([t, l]) => (
                <Button key={t} variant="ghost" icon={FiFileText} style={{ justifyContent: 'flex-start' }} onClick={() => pdf(t)}>{l}</Button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Utilisateurs de l’entreprise" subtitle={`${c.users.length} compte(s)`} className="mt-3" actions={<Link to={`/admin/users?companyId=${c.id}`} className="btn btn-sm"><FiPlus /> Gérer</Link>}>
        <DataTable
          rows={c.users}
          columns={[
            { key: 'name', label: 'Nom', render: (u) => <div className="row"><Avatar user={u} /><div><div className="cell-main">{u.firstName} {u.lastName}</div><div className="cell-sub">{u.email}</div></div></div> },
            { key: 'role', label: 'Rôle', render: (u) => <Badge tone="gold" plain>{{ company_admin: 'Administrateur', manager: 'Gestionnaire', accountant: 'Comptable', driver: 'Chauffeur', agent: 'Agent' }[u.role] || u.role}</Badge> },
            { key: 'status', label: 'Statut', render: (u) => <StatusBadge map={USER_STATUS} value={u.status} /> },
            { key: 'last', label: 'Dernière connexion', render: (u) => (u.lastLoginAt ? relative(u.lastLoginAt) : 'Jamais') },
          ]}
        />
      </Card>

      <AdjustModal company={c} open={adjust} onClose={() => setAdjust(false)} onDone={load} />
      <Modal open={notify} onClose={() => setNotify(false)} title="Notification administrative" subtitle={`Envoyée par email à ${c.email}`} footer={<><Button onClick={() => setNotify(false)}>Annuler</Button><Button variant="primary" icon={FiSend} onClick={sendNotify}>Envoyer</Button></>}>
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Objet"><Input value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className="textarea" value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  )
}

