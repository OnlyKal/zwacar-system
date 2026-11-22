import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiCheckCircle, FiMail, FiSend } from 'react-icons/fi'
import AuthShell from './AuthShell'
import { Button, Field } from '../../components/ui'
import { api, errorMessage } from '../../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Adresse email invalide')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Link to="/login" className="row small muted" style={{ gap: 6, marginBottom: 24 }}>
        <FiArrowLeft /> Retour à la connexion
      </Link>
      {sent ? (
        <div>
          <div className="empty-icon" style={{ width: 64, height: 64, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--green-bg)', color: 'var(--green)', fontSize: 28, marginBottom: 18 }}>
            <FiCheckCircle />
          </div>
          <h1>Vérifiez vos emails</h1>
          <p className="sub">Si un compte existe pour <b>{email}</b>, vous recevrez un lien de réinitialisation valable 1 heure.</p>
          <Button onClick={() => setSent(false)}>Renvoyer</Button>
        </div>
      ) : (
        <>
          <h1>Mot de passe oublié</h1>
          <p className="sub">Saisissez votre email : nous vous enverrons un lien pour définir un nouveau mot de passe.</p>
          <form onSubmit={submit} className="stack" style={{ gap: 16 }} noValidate>
            <Field label="Adresse email" error={error}>
              <div className="input-icon">
                <FiMail />
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@entreprise.com" autoFocus />
              </div>
            </Field>
            <Button variant="primary" size="lg" block loading={loading} icon={FiSend} type="submit">
              Envoyer le lien
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
