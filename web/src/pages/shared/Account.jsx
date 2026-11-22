import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiLock, FiSave } from 'react-icons/fi'
import { Avatar, Badge, Button, Card, Field, Input, PageHeader } from '../../components/ui'
import { PasswordChecklist, passwordRules } from '../auth/ResetPassword'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage, fieldErrors, setAccessToken } from '../../api/client'
import { fmtDateTime } from '../../utils/format'

export default function Account() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || '', jobTitle: user.jobTitle || '' })
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [changing, setChanging] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const r = await api.patch('/auth/me', form)
      setUser(r.data.user)
      toast.success('Profil mis à jour')
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const change = async () => {
    if (!passwordRules(pw.newPassword).every((r) => r.ok)) return toast.error('Le nouveau mot de passe ne respecte pas les règles')
    if (pw.newPassword !== pw.confirm) return toast.error('Les mots de passe ne correspondent pas')
    setChanging(true)
    try {
      const r = await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword })
      setAccessToken(r.data.accessToken)
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Mot de passe modifié — les autres sessions ont été fermées')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setChanging(false)
    }
  }

  return (
    <>
      <PageHeader title="Mon compte" subtitle="Informations personnelles et sécurité" />
      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Card title="Profil" actions={<Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>} pad>
          <div className="row mb-2" style={{ gap: 16 }}>
            <Avatar size="lg" user={user} />
            <div>
              <div className="strong" style={{ fontSize: 17 }}>{user.firstName} {user.lastName}</div>
              <div className="muted">{user.email}</div>
              <div className="mt-1"><Badge tone="gold" plain>{user.roleLabel}</Badge>{user.company && <span className="small muted"> · {user.company.name}</span>}</div>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Prénom" error={errors.firstName}><Input value={form.firstName} onChange={set('firstName')} /></Field>
            <Field label="Nom" error={errors.lastName}><Input value={form.lastName} onChange={set('lastName')} /></Field>
            <Field label="Téléphone" error={errors.phone}><Input value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Fonction" error={errors.jobTitle}><Input value={form.jobTitle} onChange={set('jobTitle')} /></Field>
          </div>
          <p className="small muted mt-2">Dernière connexion : {fmtDateTime(user.lastLoginAt)}</p>
        </Card>
        <Card title="Changer le mot de passe" pad>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Mot de passe actuel"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="Nouveau mot de passe">
              <Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
              <PasswordChecklist value={pw.newPassword} />
            </Field>
            <Field label="Confirmation"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <Button variant="dark" icon={FiLock} loading={changing} onClick={change}>Modifier le mot de passe</Button>
          </div>
        </Card>
      </div>
    </>
  )
}
