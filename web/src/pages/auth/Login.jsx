import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiLock, FiLogIn, FiMail } from 'react-icons/fi'
import AuthShell from './AuthShell'
import { Button, Field } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage } from '../../api/client'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [canRegister, setCanRegister] = useState(false)
  useEffect(() => {
    api.get('/public/config').then((r) => setCanRegister(r.data.data.allowCompanyRegistration !== false)).catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) return setError('Email et mot de passe requis')
    setLoading(true)
    try {
      const user = await login(form.email.trim(), form.password)
      toast.success(`Bienvenue ${user.firstName} !`)
      const home = user.role === 'super_admin' ? '/admin' : '/company'
      const from = loc.state?.from
      nav(from && from.startsWith(home) ? from : home, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1>Connexion</h1>
      <p className="sub">Identifiez-vous pour accéder à votre espace.</p>
      <form onSubmit={submit} className="stack" style={{ gap: 16 }} noValidate>
        <Field label="Adresse email">
          <div className="input-icon">
            <FiMail />
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vous@entreprise.com" autoFocus />
          </div>
        </Field>
        <Field label="Mot de passe">
          <div className="input-icon">
            <FiLock />
            <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            <button type="button" className="btn btn-ghost icon-btn sm suffix" onClick={() => setShow((s) => !s)} aria-label="Afficher le mot de passe">
              {show ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </Field>
        <div className="row between">
          <span />
          <Link to="/forgot-password" className="small" style={{ color: 'var(--gold)', fontWeight: 600 }}>
            Mot de passe oublié ?
          </Link>
        </div>
        {error && <div className="callout red">{error}</div>}
        <Button variant="primary" size="lg" block loading={loading} icon={FiLogIn} type="submit">
          Se connecter
        </Button>
      </form>
      {canRegister && (
      <div className="auth-signup">
        <span>Vous louez des véhicules ?</span>
        <Link to="/register">Créer un compte entreprise</Link>
      </div>
      )}
    </AuthShell>
  )
}
