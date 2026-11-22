import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiBriefcase, FiCheck, FiPause, FiPlay, FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, Empty, Field, FilterChips, Input, Modal, PageHeader, Pagination, SearchInput, Select, IconButton, StatusBadge } from '../../components/ui'
import CompanyFields, { COMPANY_EMPTY, companyPayload } from '../../components/CompanyForm'
import { PasswordChecklist } from '../auth/ResetPassword'
import { useApi, useDebounce } from '../../hooks/useApi'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { COMPANY_STATUS, fmtDate, fmtNumber } from '../../utils/format'

function CreateCompanyModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(COMPANY_EMPTY)
  const [admin, setAdmin] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [mode, setMode] = useState('invite')
  const [credits, setCredits] = useState(0)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (open) {
      setForm(COMPANY_EMPTY)
      setAdmin({ firstName: '', lastName: '', email: '', phone: '', password: '' })
      setErrors({})
      setCredits(0)
    }
  }, [open])
  const submit = async () => {
    setLoading(true)
    setErrors({})
    try {
      const { data } = await api.post('/companies', { ...companyPayload(form), initialCredits: Number(credits) || 0, admin: { ...admin, password: mode === 'password' ? admin.password : '' } })
      toast.success(mode === 'invite' ? 'Entreprise créée — invitation envoyée à l’administrateur' : 'Entreprise créée')
      onCreated(data.data)
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  const sa = (k) => (e) => setAdmin((a) => ({ ...a, [k]: e.target.value }))
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Nouvelle entreprise" subtitle="Créez l’espace de l’entreprise et son compte administrateur" footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit} icon={FiPlus}>Créer l’entreprise</Button></>}>
      <CompanyFields form={form} setForm={setForm} errors={errors} />
      <hr className="divider" />
      <h4 style={{ fontSize: 14.5, marginBottom: 12 }}>Administrateur de l’entreprise</h4>
      <div className="form-grid">
        <Field label="Prénom" required error={errors['admin.firstName']}><Input value={admin.firstName} onChange={sa('firstName')} /></Field>
        <Field label="Nom" required error={errors['admin.lastName']}><Input value={admin.lastName} onChange={sa('lastName')} /></Field>
        <Field label="Email de connexion" required error={errors['admin.email']}><Input type="email" value={admin.email} onChange={sa('email')} /></Field>
        <Field label="Téléphone"><Input value={admin.phone} onChange={sa('phone')} /></Field>
        <Field label="Accès" className="full">
          <FilterChips value={mode} onChange={setMode} options={[{ value: 'invite', label: 'Envoyer une invitation par email' }, { value: 'password', label: 'Définir un mot de passe' }]} />
        </Field>
        {mode === 'password' && (
          <Field label="Mot de passe" error={errors['admin.password']} className="full">
            <Input type="text" value={admin.password} onChange={sa('password')} />
            <PasswordChecklist value={admin.password} />
          </Field>
        )}
        <Field label="Crédits offerts à la création" hint="Facultatif — tracé dans l’historique comme ajustement">
          <Input type="number" min="0" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export default function Companies() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(sp.get('status') || '')
  const [sort, setSort] = useState('createdAt')
  const [page, setPage] = useState(1)
  const [create, setCreate] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [dq, status, sort])
  const { data, loading, error, reload } = useApi('/companies', { q: dq, status, sort, dir: sort === 'name' ? 'asc' : 'desc', page })

  const act = async (c, action, value) => {
    try {
      if (action === 'delete') {
        await api.delete(`/companies/${c.id}`, { data: { confirm: value } })
        toast.success('Entreprise supprimée (sauvegarde automatique créée)')
      } else {
        await api.post(`/companies/${c.id}/status`, { status: action === 'approve' ? 'active' : action, reason: value })
        toast.success({ suspended: 'Entreprise suspendue', rejected: 'Inscription refusée', approve: 'Entreprise validée : elle peut se connecter' }[action] || 'Entreprise réactivée')
      }
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Entreprise',
      render: (c) => (
        <div className="row">
          <Avatar src={c.logoUrl} user={{ firstName: c.name }} />
          <div>
            <div className="cell-main">{c.name}</div>
            <div className="cell-sub">{c.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'city', label: 'Ville', render: (c) => c.city || '—' },
    { key: 'vehicles', label: 'Véhicules', render: (c) => <span><b>{c.activeVehicles}</b> <span className="muted">/ {c.vehiclesCount}</span></span> },
    { key: 'users', label: 'Utilisateurs', render: (c) => c.usersCount },
    { key: 'wallet', label: 'Wallet', align: 'right', render: (c) => <b>{fmtNumber(c.walletBalance)} cr.</b> },
    { key: 'status', label: 'Statut', render: (c) => <StatusBadge map={COMPANY_STATUS} value={c.status} /> },
    { key: 'createdAt', label: 'Inscription', render: (c) => fmtDate(c.createdAt) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (c) => (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          {c.status === 'pending' ? (
            <>
              <Button size="sm" variant="primary" icon={FiCheck} onClick={() => setConfirm({ c, action: 'approve' })}>Valider</Button>
              <IconButton icon={FiX} title="Refuser l’inscription" onClick={() => setConfirm({ c, action: 'rejected' })} />
            </>
          ) : c.status === 'active' ? (
            <IconButton icon={FiPause} title="Suspendre" onClick={() => setConfirm({ c, action: 'suspended' })} />
          ) : (
            <IconButton icon={FiPlay} title={c.status === 'rejected' ? 'Valider finalement' : 'Réactiver'} onClick={() => setConfirm({ c, action: c.status === 'rejected' ? 'approve' : 'active' })} />
          )}
          <IconButton icon={FiTrash2} title="Supprimer" onClick={() => setConfirm({ c, action: 'delete' })} />
        </div>
      ),
    },
  ]

  const cfg = confirm && {
    suspended: { title: `Suspendre ${confirm.c.name}`, message: 'Les collaborateurs seront déconnectés et les véhicules masqués des résultats publics.', danger: true, reason: true, label: 'Suspendre' },
    approve: { title: `Valider ${confirm.c.name}`, message: 'L’entreprise pourra se connecter, recharger son wallet et publier ses véhicules. Un email de confirmation lui est envoyé.', label: 'Valider l’inscription' },
    rejected: { title: `Refuser l’inscription de ${confirm.c.name}`, message: 'Le compte restera inaccessible. L’entreprise est informée par email (le motif lui est transmis).', danger: true, reason: true, label: 'Refuser' },
    active: { title: `Réactiver ${confirm.c.name}`, message: 'L’entreprise retrouvera l’accès à son espace et ses véhicules actifs redeviendront visibles.', label: 'Réactiver' },
    delete: { title: `Supprimer ${confirm.c.name}`, message: 'Suppression définitive de l’entreprise, de ses utilisateurs, véhicules, médias et historiques. Une sauvegarde automatique de la base est créée au préalable.', danger: true, text: confirm.c.name, label: 'Supprimer définitivement' },
  }[confirm.action]

  return (
    <>
      <PageHeader title="Entreprises" subtitle="Gérez les loueurs inscrits sur la plateforme">
        <Button variant="primary" icon={FiPlus} onClick={() => setCreate(true)}>Nouvelle entreprise</Button>
      </PageHeader>
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Nom, email, ville, téléphone…" />
          <FilterChips value={status} onChange={setStatus} options={[{ value: '', label: 'Toutes' }, { value: 'pending', label: 'En attente' }, { value: 'active', label: 'Actives' }, { value: 'suspended', label: 'Suspendues' }, { value: 'rejected', label: 'Refusées' }]} />
          <div style={{ flex: 1 }} />
          <Select value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'createdAt', label: 'Plus récentes' }, { value: 'name', label: 'Nom (A-Z)' }, { value: 'walletBalance', label: 'Solde wallet' }]} />
        </div>
        <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} onRowClick={(c) => nav(`/admin/companies/${c.id}`)} empty={<Empty icon={FiBriefcase} title="Aucune entreprise" />} />
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
      <CreateCompanyModal open={create} onClose={() => setCreate(false)} onCreated={(c) => { setCreate(false); nav(`/admin/companies/${c.id}`) }} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={cfg?.title}
        message={cfg?.message}
        danger={cfg?.danger}
        withReason={cfg?.reason}
        confirmText={cfg?.text}
        confirmLabel={cfg?.label}
        onConfirm={(v) => act(confirm.c, confirm.action, v)}
      />
    </>
  )
}
