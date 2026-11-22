import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCheck, FiLock, FiX } from 'react-icons/fi'
import AuthShell from './AuthShell'
import { Button, Field } from '../../components/ui'
import { api, errorMessage } from '../../api/client'

export const passwordRules = (p) => [
  { ok: p.length >= 8, label: '8 caractères minimum' },
  { ok: /[A-Za-z]/.test(p), label: 'Au moins une lettre' },
  { ok: /\d/.test(p), label: 'Au moins un chiffre' },
]

export function PasswordChecklist({ value }) {
  return (
    <ul className="checklist mt-1">
      {passwordRules(value).map((r) => (
        <li key={r.label} className={r.ok ? 'ok' : 'muted'}>
          {r.ok ? <FiCheck /> : <FiX />} {r.label}
        </li>
      ))}
    </ul>
  )
}

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const invite = params.get('invite') === '1'
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const valid = passwordRules(pw).every((r) => r.ok)
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!valid) return setError('Le mot de passe ne respecte pas les règles')
    if (pw !== pw2) return setError('Les mots de passe ne correspondent pas')
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password: pw })
      toast.success(invite ? 'Compte activé ! Vous pouvez vous connecter.' : 'Mot de passe modifié')
      nav('/login')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1>{invite ? 'Activez votre compte' : 'Nouveau mot de passe'}</h1>
      <p className="sub">{invite ? 'Définissez votre mot de passe pour accéder à votre espace.' : 'Choisissez un nouveau mot de passe sécurisé.'}</p>
      {!token ? (
        <div className="callout red">
          Lien invalide. <Link to="/forgot-password">Demander un nouveau lien</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack" style={{ gap: 16 }} noValidate>
          <Field label="Mot de passe">
            <div className="input-icon">
              <FiLock />
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
            </div>
            <PasswordChecklist value={pw} />
          </Field>
          <Field label="Confirmation">
            <div className="input-icon">
              <FiLock />
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
          </Field>
          {error && <div className="callout red">{error}</div>}
          <Button variant="primary" size="lg" block loading={loading} type="submit">
            {invite ? 'Activer mon compte' : 'Enregistrer'}
          </Button>
          <Link to="/login" className="small muted center">Retour à la connexion</Link>
        </form>
      )}
    </AuthShell>
  )
}
