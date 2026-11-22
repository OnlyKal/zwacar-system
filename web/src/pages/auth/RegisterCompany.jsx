import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiArrowLeft, FiArrowRight, FiBriefcase, FiCheckCircle, FiClock, FiLock, FiMail, FiMapPin, FiPhone, FiUser } from 'react-icons/fi'
import AuthShell from './AuthShell'
import { PasswordChecklist, passwordRules } from './ResetPassword'
import { Button, Field, Loader } from '../../components/ui'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  company: { name: '', email: '', phone: '', city: '', country: 'RD Congo', address: '', taxId: '' },
  admin: { firstName: '', lastName: '', email: '', phone: '', password: '' },
}
const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v.trim())

/** Champ texte avec icône (style de l'écran de connexion). */
function In({ icon: Icon, label, required, error, hint, ...props }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {Icon ? (
        <div className="input-icon">
          <Icon />
          <input className="input" {...props} />
        </div>
      ) : (
        <input className="input" {...props} />
      )}
    </Field>
  )
}

export default function RegisterCompany() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [cfg, setCfg] = useState(null)
  const [step, setStep] = useState(1)
  const [f, setF] = useState(EMPTY)
  const [terms, setTerms] = useState(false)
  const [trap, setTrap] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    api
      .get('/public/config')
      .then((r) => setCfg(r.data.data))
      .catch(() => setCfg({ allowCompanyRegistration: true }))
  }, [])

  const setC = (k) => (e) => setF((x) => ({ ...x, company: { ...x.company, [k]: e.target.value } }))
  const setA = (k) => (e) => setF((x) => ({ ...x, admin: { ...x.admin, [k]: e.target.value } }))

  const next = (e) => {
    e.preventDefault()
    const c = f.company
    const err = {}
    if (c.name.trim().length < 2) err['company.name'] = 'Nom requis'
    if (!emailOk(c.email)) err['company.email'] = 'Email invalide'
    if (c.phone.replace(/\D/g, '').length < 6) err['company.phone'] = 'Téléphone requis'
    if (c.city.trim().length < 2) err['company.city'] = 'Ville requise'
    setErrors(err)
    if (Object.keys(err).length) return
    if (!f.admin.email) setF((x) => ({ ...x, admin: { ...x.admin, email: x.company.email, phone: x.admin.phone || x.company.phone } }))
    setStep(2)
  }

  const submit = async (e) => {
    e.preventDefault()
    const a = f.admin
    const err = {}
    if (a.firstName.trim().length < 2) err['admin.firstName'] = 'Prénom requis'
    if (a.lastName.trim().length < 2) err['admin.lastName'] = 'Nom requis'
    if (!emailOk(a.email)) err['admin.email'] = 'Email invalide'
    if (!passwordRules(a.password).every((r) => r.ok)) err['admin.password'] = 'Mot de passe trop faible'
    setErrors(err)
    if (Object.keys(err).length) return
    if (!terms) return toast.error('Acceptez les conditions d’utilisation pour continuer')
    setLoading(true)
    try {
      const r = await api.post('/auth/register-company', { ...f, acceptTerms: true, website: trap })
      if (r.data.pending) {
        setDone({ pending: true, name: r.data.company.name })
      } else {
        // Inscription sans validation : connexion directe.
        await login(a.email.trim(), a.password)
        toast.success('Bienvenue sur ZwaCar !')
        nav('/company', { replace: true })
      }
    } catch (ex) {
      const fe = fieldErrors(ex)
      setErrors(fe)
      if (Object.keys(fe).some((k) => k.startsWith('company.'))) setStep(1)
      toast.error(errorMessage(ex))
    } finally {
      setLoading(false)
    }
  }

  if (!cfg) return <AuthShell><Loader /></AuthShell>

  if (cfg.allowCompanyRegistration === false) {
    return (
      <AuthShell>
        <h1>Inscriptions fermées</h1>
        <p className="sub">La création de comptes entreprise est momentanément désactivée. Contactez-nous{cfg.supportEmail ? ` : ${cfg.supportEmail}` : '.'}</p>
        <Link to="/login" className="btn btn-primary btn-lg btn-block">Retour à la connexion</Link>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell>
        <div className="empty-icon" style={{ margin: '0 0 18px' }}>{done.pending ? <FiClock /> : <FiCheckCircle />}</div>
        <h1>Inscription envoyée</h1>
        <p className="sub">
          Merci ! Le compte de <b style={{ color: '#fff' }}>{done.name}</b> a bien été créé. Notre équipe va valider votre inscription : vous recevrez un email dès son activation, puis vous pourrez vous connecter avec l’email et le mot de passe choisis.
        </p>
        <Link to="/login" className="btn btn-primary btn-lg btn-block">Retour à la connexion</Link>
      </AuthShell>
    )
  }

  const E = (k) => errors[k]
  return (
    <AuthShell>
      <h1>Créer un compte entreprise</h1>
      <p className="sub">
        Étape {step} sur 2 — {step === 1 ? 'votre entreprise' : 'votre compte administrateur'}
        {cfg.requireCompanyApproval !== false && step === 2 ? '. Votre inscription sera validée par notre équipe.' : ''}
      </p>

      {step === 1 ? (
        <form onSubmit={next} className="stack" style={{ gap: 14 }} noValidate>
          <In icon={FiBriefcase} label="Nom de l’entreprise" required error={E('company.name')} value={f.company.name} onChange={setC('name')} placeholder="Ex. Prestige Auto" autoFocus />
          <In icon={FiMail} label="Email de l’entreprise" required type="email" error={E('company.email')} value={f.company.email} onChange={setC('email')} placeholder="contact@entreprise.cd" />
          <In icon={FiPhone} label="Téléphone / WhatsApp" required type="tel" error={E('company.phone')} value={f.company.phone} onChange={setC('phone')} placeholder="+243 81 234 5678" />
          <In icon={FiMapPin} label="Ville" required error={E('company.city')} value={f.company.city} onChange={setC('city')} placeholder="Kinshasa" />
          <In icon={FiMapPin} label="Adresse" error={E('company.address')} value={f.company.address} onChange={setC('address')} placeholder="Avenue, commune (facultatif)" />
          <In label="N° RCCM / identification fiscale" error={E('company.taxId')} value={f.company.taxId} onChange={setC('taxId')} placeholder="Facultatif" />
          <Button variant="primary" size="lg" block icon={FiArrowRight} type="submit">Continuer</Button>
        </form>
      ) : (
        <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
          <div className="form-grid">
            <In icon={FiUser} label="Prénom" required error={E('admin.firstName')} value={f.admin.firstName} onChange={setA('firstName')} autoFocus />
            <In label="Nom" required error={E('admin.lastName')} value={f.admin.lastName} onChange={setA('lastName')} />
          </div>
          <In icon={FiMail} label="Email de connexion" required type="email" autoComplete="email" error={E('admin.email')} value={f.admin.email} onChange={setA('email')} />
          <In icon={FiPhone} label="Téléphone" type="tel" error={E('admin.phone')} value={f.admin.phone} onChange={setA('phone')} />
          <div>
            <In icon={FiLock} label="Mot de passe" required type="password" autoComplete="new-password" error={E('admin.password')} value={f.admin.password} onChange={setA('password')} />
            <PasswordChecklist value={f.admin.password} />
          </div>
          {/* Champ piège invisible (anti-robots) */}
          <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          <label className="toggle" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ display: 'inline-block', marginTop: 3 }} />
            <span className="small" style={{ color: '#bdb6a4' }}>J’accepte les conditions d’utilisation de la plateforme et certifie l’exactitude des informations fournies.</span>
          </label>
          <div className="row" style={{ gap: 10 }}>
            <Button size="lg" icon={FiArrowLeft} onClick={() => setStep(1)} type="button">Retour</Button>
            <Button variant="primary" size="lg" block loading={loading} icon={FiCheckCircle} type="submit">Créer mon compte</Button>
          </div>
        </form>
      )}

      <p className="small mt-3" style={{ color: '#8f8977' }}>
        Déjà inscrit ? <Link to="/login" style={{ fontWeight: 700 }}>Se connecter</Link>
      </p>
    </AuthShell>
  )
}
