import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiEdit2, FiKey, FiMail, FiPause, FiPlay, FiTrash2, FiUserPlus, FiUsers } from 'react-icons/fi'
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, Empty, Field, FilterChips, IconButton, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs } from '../../components/ui'
import { PasswordChecklist } from '../auth/ResetPassword'
import { useApi, useDebounce } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { relative, USER_STATUS, fmtDate } from '../../utils/format'

const COMPANY_ROLES = ['company_admin', 'manager', 'accountant', 'driver', 'agent']
const ROLE_HELP = {
  company_admin: 'Accès complet à l’espace entreprise : équipe, véhicules, wallet, paramètres.',
  manager: 'Gère les véhicules, publications et contacts. Consulte le wallet.',
  accountant: 'Consulte et recharge le wallet, télécharge factures et rapports.',
  agent: 'Traite les contacts clients et consulte les véhicules.',
  driver: 'Consulte les véhicules de l’entreprise.',
  super_admin: 'Contrôle total de la plateforme.',
  client: 'Client de l’application mobile.',
}

function UserModal({ open, onClose, user, roles, companies, team, onSaved }) {
  const editing = Boolean(user)
  const [form, setForm] = useState({})
  const [mode, setMode] = useState('invite')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open) return
    setErrors({})
    setMode('invite')
    setForm(user ? { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone || '', jobTitle: user.jobTitle || '', role: user.role, companyId: user.companyId || '' } : { firstName: '', lastName: '', email: '', phone: '', jobTitle: '', role: team ? 'manager' : 'manager', companyId: '', password: '' })
  }, [open, user, team])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const needsCompany = COMPANY_ROLES.includes(form.role)

  const submit = async () => {
    setLoading(true)
    setErrors({})
    try {
      const body = { ...form, companyId: needsCompany && form.companyId ? Number(form.companyId) : null }
      if (team) delete body.companyId
      if (editing) {
        delete body.password
        await api.patch(`/users/${user.id}`, body)
        toast.success('Utilisateur mis à jour')
      } else {
        if (mode === 'invite') body.password = ''
        const r = await api.post('/users', body)
        toast.success(r.data.invited ? `Invitation envoyée à ${body.email}` : 'Utilisateur créé')
      }
      onSaved()
      onClose()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Modifier l’utilisateur' : team ? 'Ajouter un collaborateur' : 'Nouvel utilisateur'} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit}>{editing ? 'Enregistrer' : 'Créer'}</Button></>}>
      <div className="form-grid">
        <Field label="Prénom" required error={errors.firstName}><Input value={form.firstName || ''} onChange={set('firstName')} /></Field>
        <Field label="Nom" required error={errors.lastName}><Input value={form.lastName || ''} onChange={set('lastName')} /></Field>
        <Field label="Email" required error={errors.email} className="full"><Input type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Téléphone" error={errors.phone}><Input value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Fonction" error={errors.jobTitle}><Input value={form.jobTitle || ''} onChange={set('jobTitle')} placeholder="Ex. Responsable de flotte" /></Field>
        <Field label="Rôle" required error={errors.role} className="full" hint={ROLE_HELP[form.role]}>
          <Select value={form.role || ''} onChange={set('role')} options={roles.map((r) => ({ value: r.value, label: r.label }))} />
        </Field>
        {!team && needsCompany && (
          <Field label="Entreprise" required error={errors.companyId} className="full">
            <Select value={form.companyId || ''} onChange={set('companyId')} placeholder="Sélectionner…" options={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        )}
        {!editing && (
          <>
            <Field label="Accès" className="full">
              <FilterChips value={mode} onChange={setMode} options={[{ value: 'invite', label: 'Invitation par email' }, { value: 'password', label: 'Définir un mot de passe' }]} />
            </Field>
            {mode === 'password' && (
              <Field label="Mot de passe" error={errors.password} className="full">
                <Input value={form.password || ''} onChange={set('password')} />
                <PasswordChecklist value={form.password || ''} />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Users({ team }) {
  const { user: me, isSuperAdmin, can } = useAuth()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState('staff')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [companyId, setCompanyId] = useState(sp.get('companyId') || '')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [dq, role, status, companyId, tab])

  const { data, loading, error, reload } = useApi('/users', { q: dq, role, status, companyId, page, type: team ? undefined : tab })
  const roles = useApi('/users/roles')
  const companies = useApi(isSuperAdmin ? '/companies/options' : null)
  const manage = can('team:manage')

  const action = async (u, kind) => {
    try {
      if (kind === 'suspend' || kind === 'activate') await api.patch(`/users/${u.id}`, { status: kind === 'suspend' ? 'suspended' : 'active' })
      if (kind === 'delete') await api.delete(`/users/${u.id}`)
      if (kind === 'invite') await api.post(`/users/${u.id}/resend-invite`)
      if (kind === 'reset') await api.post(`/users/${u.id}/send-reset`)
      toast.success({ suspend: 'Compte suspendu', activate: 'Compte réactivé', delete: 'Compte supprimé', invite: 'Invitation renvoyée', reset: 'Lien de réinitialisation envoyé' }[kind])
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  const columns = [
    { key: 'name', label: 'Utilisateur', render: (u) => <div className="row"><Avatar user={u} /><div><div className="cell-main">{u.firstName} {u.lastName} {u.id === me.id && <Badge tone="gold" plain>Vous</Badge>}</div><div className="cell-sub">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></div></div> },
    { key: 'role', label: 'Rôle', render: (u) => <div><Badge tone={u.role === 'super_admin' ? 'dark' : u.role === 'client' ? 'blue' : 'gold'} plain>{u.roleLabel}</Badge>{u.jobTitle && <div className="cell-sub mt-1">{u.jobTitle}</div>}</div> },
    ...(isSuperAdmin && tab === 'staff' ? [{ key: 'company', label: 'Entreprise', render: (u) => u.company?.name || <span className="muted">Plateforme</span> }] : []),
    { key: 'status', label: 'Statut', render: (u) => <StatusBadge map={USER_STATUS} value={u.status} /> },
    { key: 'last', label: 'Dernière connexion', render: (u) => (u.lastLoginAt ? relative(u.lastLoginAt) : <span className="muted">Jamais</span>) },
    { key: 'created', label: 'Créé le', render: (u) => fmtDate(u.createdAt) },
    ...(manage
      ? [{
          key: 'actions',
          label: '',
          align: 'right',
          render: (u) =>
            u.id === me.id ? null : (
              <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                <IconButton icon={FiEdit2} title="Modifier" onClick={() => setModal(u)} />
                {u.status === 'pending' ? <IconButton icon={FiMail} title="Renvoyer l’invitation" onClick={() => action(u, 'invite')} /> : <IconButton icon={FiKey} title="Envoyer un lien de réinitialisation" onClick={() => action(u, 'reset')} />}
                {u.status === 'active' && <IconButton icon={FiPause} title="Suspendre" onClick={() => setConfirm({ u, kind: 'suspend' })} />}
                {u.status === 'suspended' && <IconButton icon={FiPlay} title="Réactiver" onClick={() => action(u, 'activate')} />}
                <IconButton icon={FiTrash2} title="Supprimer" onClick={() => setConfirm({ u, kind: 'delete' })} />
              </div>
            ),
        }]
      : []),
  ]

  return (
    <>
      <PageHeader title={team ? 'Équipe' : 'Utilisateurs'} subtitle={team ? 'Gérez les collaborateurs et leurs rôles' : 'Tous les comptes de la plateforme'}>
        {manage && <Button variant="primary" icon={FiUserPlus} onClick={() => setModal('new')}>{team ? 'Ajouter un collaborateur' : 'Nouvel utilisateur'}</Button>}
      </PageHeader>
      {!team && (
        <div className="mb-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'staff', label: 'Administrateurs & entreprises' }, { value: 'clients', label: 'Clients' }]} />
        </div>
      )}
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Nom, email, téléphone…" />
          {tab === 'staff' && <Select value={role} onChange={(e) => setRole(e.target.value)} placeholder="Tous les rôles" options={(roles.data?.data || []).filter((r) => r.value !== 'client')} />}
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Tous statuts" options={Object.entries(USER_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          {isSuperAdmin && tab === 'staff' && <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toutes entreprises" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />}
        </div>
        <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} empty={<Empty icon={FiUsers} title="Aucun utilisateur" />} />
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>

      <UserModal open={Boolean(modal)} onClose={() => setModal(null)} user={modal === 'new' ? null : modal} roles={roles.data?.data || []} companies={companies.data?.data || []} team={team} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        danger
        title={confirm?.kind === 'delete' ? 'Supprimer ce compte' : 'Suspendre ce compte'}
        message={confirm && `${confirm.u.firstName} ${confirm.u.lastName} (${confirm.u.email}) ${confirm.kind === 'delete' ? 'sera définitivement supprimé.' : 'ne pourra plus se connecter et ses sessions seront fermées.'}`}
        confirmLabel={confirm?.kind === 'delete' ? 'Supprimer' : 'Suspendre'}
        onConfirm={() => action(confirm.u, confirm.kind)}
      />
    </>
  )
}
