import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiClock, FiCopy, FiCreditCard, FiDollarSign, FiInfo, FiLock, FiMail, FiPlay, FiSave, FiSend, FiSettings, FiShield } from 'react-icons/fi'
import { Badge, Button, Card, ErrorBox, Field, Input, Loader, PageHeader, Select, Tabs, Textarea, Toggle } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { fmtDateTime, fmtMoney } from '../../utils/format'

function General({ initial, onSaved }) {
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const save = async () => {
    setSaving(true)
    try {
      await api.put('/settings/general', f)
      toast.success('Paramètres généraux enregistrés')
      onSaved()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card title="Paramètres généraux" subtitle="Identité de la plateforme (emails, PDF, application mobile)" actions={<Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>} pad>
      <div className="form-grid">
        <Field label="Nom de la plateforme" error={errors.platformName}><Input value={f.platformName} onChange={set('platformName')} /></Field>
        <Field label="Devise par défaut" error={errors.currency}><Select value={f.currency} onChange={set('currency')} options={['USD', 'CDF', 'EUR', 'XAF'].map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Email du support" error={errors.supportEmail}><Input type="email" value={f.supportEmail} onChange={set('supportEmail')} /></Field>
        <Field label="Téléphone du support" error={errors.supportPhone}><Input value={f.supportPhone} onChange={set('supportPhone')} /></Field>
        <Field label="Adresse" className="full" error={errors.address}><Input value={f.address} onChange={set('address')} /></Field>
      </div>
      <hr className="divider" />
      <div className="stack" style={{ gap: 14 }}>
        <Toggle checked={f.requireVehicleApproval} onChange={set('requireVehicleApproval')} label="Validation des véhicules par le Super Administrateur avant mise en ligne" />
        <Toggle checked={f.allowClientRegistration} onChange={set('allowClientRegistration')} label="Autoriser l’inscription des clients depuis l’application mobile" />
      </div>
    </Card>
  )
}

function Billing({ initial, onSaved }) {
  const [f, setF] = useState({ ...initial, reminderDays: initial.reminderDays.join(', ') })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async () => {
    setSaving(true)
    try {
      const body = {
        packPriceUsd: Number(f.packPriceUsd),
        packCredits: Number(f.packCredits),
        publishCost: Number(f.publishCost),
        validityMonths: Number(f.validityMonths),
        minTopupPacks: Number(f.minTopupPacks),
        maxTopupPacks: Number(f.maxTopupPacks),
        reminderDays: String(f.reminderDays).split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0),
      }
      await api.put('/settings/billing', body)
      toast.success('Tarification enregistrée')
      onSaved()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const creditPrice = Number(f.packPriceUsd) / Number(f.packCredits || 1)
  return (
    <Card title="Tarifs et règles de facturation" subtitle="S’appliquent aux prochains rechargements et publications" actions={<Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>} pad>
      <div className="form-grid cols-3">
        <Field label="Prix d’un pack (USD)" error={errors.packPriceUsd}><Input type="number" step="0.01" value={f.packPriceUsd} onChange={set('packPriceUsd')} /></Field>
        <Field label="Crédits par pack" error={errors.packCredits}><Input type="number" value={f.packCredits} onChange={set('packCredits')} /></Field>
        <Field label="Coût d’une publication (crédits)" error={errors.publishCost}><Input type="number" value={f.publishCost} onChange={set('publishCost')} /></Field>
        <Field label="Validité d’une publication (mois)" error={errors.validityMonths}><Input type="number" value={f.validityMonths} onChange={set('validityMonths')} /></Field>
        <Field label="Rappels avant expiration (jours)" hint="Séparés par des virgules, ex. 30, 7" error={errors.reminderDays}><Input value={f.reminderDays} onChange={set('reminderDays')} /></Field>
        <div />
        <Field label="Packs minimum par rechargement" error={errors.minTopupPacks}><Input type="number" value={f.minTopupPacks} onChange={set('minTopupPacks')} /></Field>
        <Field label="Packs maximum par rechargement" error={errors.maxTopupPacks}><Input type="number" value={f.maxTopupPacks} onChange={set('maxTopupPacks')} /></Field>
      </div>
      <div className="callout mt-3">
        <FiInfo />
        <div>
          {f.packPriceUsd} USD = {f.packCredits} crédits (1 crédit ≈ {fmtMoney(creditPrice)}). Une publication de {f.publishCost} crédits revient à <b>{fmtMoney(creditPrice * f.publishCost)}</b> pour {f.validityMonths} mois.
        </div>
      </div>
    </Card>
  )
}

function Smtp({ initial, onSaved }) {
  const { user } = useAuth()
  const [f, setF] = useState({ ...initial, password: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState(user.email)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const setSecurity = (e) => {
    const secure = e.target.value
    setF((x) => ({ ...x, secure, port: secure === 'ssl' ? 465 : secure === 'tls' ? 587 : x.port }))
  }
  const body = () => ({ host: f.host, port: Number(f.port), secure: f.secure, user: f.user, password: f.password, fromName: f.fromName, replyTo: f.replyTo || null, enabled: f.enabled })
  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const r = await api.put('/settings/smtp', body())
      setF({ ...r.data.data, password: '' })
      toast.success('Configuration SMTP enregistrée (chiffrée)')
      onSaved()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/settings/smtp/test', { to: testTo, config: body() })
      setTestResult({ ok: true, message: r.data.message })
    } catch (e) {
      setTestResult({ ok: false, message: errorMessage(e) })
    } finally {
      setTesting(false)
    }
  }
  return (
    <div className="grid g-main" style={{ alignItems: 'start' }}>
      <Card title="Service d’envoi Gmail (SMTP)" subtitle="Emails de bienvenue, réinitialisation, factures, notifications…" actions={<Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>} pad>
        <div className="row between mb-2">
          <Toggle checked={f.enabled} onChange={set('enabled')} label="Envoi des emails activé" />
          {initial.hasPassword ? <Badge tone="green">Mot de passe enregistré</Badge> : <Badge tone="amber">Non configuré</Badge>}
        </div>
        <div className="form-grid">
          <Field label="Adresse Gmail d’expédition" required error={errors.user}><Input type="email" value={f.user} onChange={set('user')} placeholder="notifications@gmail.com" /></Field>
          <Field label="Mot de passe d’application Gmail" error={errors.password} hint={initial.hasPassword ? 'Laisser vide pour conserver le mot de passe actuel' : '16 caractères générés dans votre compte Google'}>
            <div className="input-icon"><FiLock /><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} placeholder={initial.hasPassword ? '•••• •••• •••• ••••' : 'xxxx xxxx xxxx xxxx'} /></div>
          </Field>
          <Field label="Serveur SMTP" required error={errors.host}><Input value={f.host} onChange={set('host')} /></Field>
          <Field label="Sécurité" required><Select value={f.secure} onChange={setSecurity} options={[{ value: 'tls', label: 'TLS / STARTTLS (587)' }, { value: 'ssl', label: 'SSL (465)' }, { value: 'none', label: 'Aucune (déconseillé)' }]} /></Field>
          <Field label="Port SMTP" required error={errors.port}><Input type="number" value={f.port} onChange={set('port')} /></Field>
          <Field label="Nom de l’expéditeur" error={errors.fromName}><Input value={f.fromName} onChange={set('fromName')} /></Field>
          <Field label="Adresse de réponse (Reply-To)" error={errors.replyTo} className="full"><Input type="email" value={f.replyTo || ''} onChange={set('replyTo')} placeholder="support@votredomaine.com" /></Field>
        </div>
        <div className="callout mt-3">
          <FiShield />
          <div>Les identifiants sont chiffrés (AES-256-GCM) dans la base de données et ne sont jamais renvoyés par l’API ni affichés dans l’interface.</div>
        </div>
      </Card>
      <div className="stack">
        <Card title="Tester la configuration" pad>
          <Field label="Envoyer un email de test à"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
          <Button className="mt-2" block icon={FiSend} loading={testing} onClick={test}>Tester la connexion SMTP</Button>
          {testResult && <div className={`callout mt-2 ${testResult.ok ? 'green' : 'red'}`}>{testResult.ok ? <FiCheckCircle /> : <FiInfo />}<div>{testResult.message}</div></div>}
          <p className="small muted mt-2">Le test utilise les valeurs saisies (même non enregistrées).</p>
        </Card>
        <Card title="Obtenir un mot de passe d’application" pad>
          <ol className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Activez la validation en deux étapes sur le compte Google.</li>
            <li>Ouvrez « Sécurité » → « Mots de passe des applications ».</li>
            <li>Créez un mot de passe pour « ZwaCar » et copiez les 16 caractères.</li>
            <li>Collez-le ici, enregistrez puis testez.</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

/** Paiement en ligne des crédits via FlexPay Mobile Money. */
function Flexpay() {
  const { data, loading, error, reload } = useApi('/settings/flexpay')
  const [f, setF] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  useEffect(() => {
    if (data) setF({ ...data.data, token: '' })
  }, [data])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!f) return <Loader />
  const initial = data.data
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const body = () => ({ enabled: f.enabled, merchant: f.merchant, token: f.token, mobileUrl: f.mobileUrl, checkUrl: f.checkUrl, callbackBaseUrl: f.callbackBaseUrl || '' })
  const save = async () => {
    if (f.enabled && (!f.merchant || (!f.token && !initial.hasToken))) return toast.error('Code marchand et jeton requis pour activer FlexPay')
    setSaving(true)
    setErrors({})
    try {
      await api.put('/settings/flexpay', body())
      toast.success('Configuration FlexPay enregistrée (chiffrée)')
      reload()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/settings/flexpay/test', { token: f.token || undefined, checkUrl: f.checkUrl })
      setTestResult({ ok: true, message: r.data.message })
    } catch (e) {
      setTestResult({ ok: false, message: errorMessage(e) })
    } finally {
      setTesting(false)
    }
  }
  const copy = () => navigator.clipboard?.writeText(initial.webhookUrl).then(() => toast.success('URL copiée'))
  return (
    <div className="grid g-main" style={{ alignItems: 'start' }}>
      <Card title="FlexPay — paiement en ligne des crédits" subtitle="Rechargement du wallet des entreprises par Mobile Money (M-Pesa, Orange, Airtel, Afrimoney)" actions={<Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>} pad>
        <div className="row between mb-2">
          <Toggle checked={f.enabled} onChange={set('enabled')} label="Paiement en ligne activé" />
          {initial.enabled && initial.hasToken && initial.merchant ? <Badge tone="green">Actif</Badge> : <Badge tone="amber">Non configuré</Badge>}
        </div>
        <div className="form-grid">
          <Field label="Code marchand FlexPay" required error={errors.merchant}><Input value={f.merchant} onChange={set('merchant')} placeholder="ZWACAR" /></Field>
          <Field label="Jeton d’autorisation (token)" error={errors.token} hint={initial.hasToken ? 'Laisser vide pour conserver le jeton actuel' : 'Fourni par FlexPay (avec ou sans « Bearer »)'}>
            <div className="input-icon"><FiLock /><input className="input" type="password" autoComplete="new-password" value={f.token} onChange={set('token')} placeholder={initial.hasToken ? '••••••••••••••••' : 'eyJhbGciOi…'} /></div>
          </Field>
          <Field label="URL Mobile Money (paymentService)" className="full" error={errors.mobileUrl}><Input value={f.mobileUrl} onChange={set('mobileUrl')} /></Field>
          <Field label="URL de vérification (check)" className="full" error={errors.checkUrl} hint="Le numéro de commande FlexPay est ajouté à la fin"><Input value={f.checkUrl} onChange={set('checkUrl')} /></Field>
          <Field label="URL publique de l’API" className="full" error={errors.callbackBaseUrl} hint="Utilisée pour le callback FlexPay. Vide = API_URL du serveur."><Input value={f.callbackBaseUrl || ''} onChange={set('callbackBaseUrl')} placeholder="https://api.votredomaine.com" /></Field>
        </div>
        <div className="field mt-2">
          <label>URL de callback à communiquer à FlexPay</label>
          <div className="row" style={{ gap: 8 }}>
            <Input value={initial.webhookUrl} readOnly className="mono" />
            <Button icon={FiCopy} onClick={copy}>Copier</Button>
          </div>
        </div>
        <div className="callout mt-3">
          <FiShield />
          <div>Le jeton est chiffré (AES-256-GCM) et n’est jamais renvoyé par l’API. Un callback FlexPay n’est jamais cru sur parole : chaque paiement est revérifié auprès de FlexPay (montant et devise) avant de créditer le wallet, une seule fois.</div>
        </div>
      </Card>
      <div className="stack">
        <Card title="Tester la connexion" pad>
          <p className="small muted" style={{ marginTop: 0 }}>Interroge l’API de vérification FlexPay avec le jeton saisi (ou enregistré).</p>
          <Button block icon={FiSend} loading={testing} onClick={test}>Tester la connexion FlexPay</Button>
          {testResult && <div className={`callout mt-2 ${testResult.ok ? 'green' : 'red'}`}>{testResult.ok ? <FiCheckCircle /> : <FiInfo />}<div>{testResult.message}</div></div>}
        </Card>
        <Card title="Fonctionnement" pad>
          <ol className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>L’entreprise choisit un pack et saisit son numéro Mobile Money.</li>
            <li>FlexPay envoie une demande de paiement sur son téléphone ; elle valide avec son code PIN.</li>
            <li>FlexPay notifie ZwaCar (callback) ; le paiement est revérifié puis les crédits sont ajoutés.</li>
            <li>Sans callback, une vérification automatique a lieu toutes les 2 minutes (expiration après 48 h).</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

function Notifications() {
  const companies = useApi('/companies/options')
  const [all, setAll] = useState(true)
  const [ids, setIds] = useState([])
  const [msg, setMsg] = useState({ title: '', message: '' })
  const [loading, setLoading] = useState(false)
  const send = async () => {
    setLoading(true)
    try {
      const r = await api.post('/settings/notify', { all, companyIds: all ? undefined : ids, ...msg })
      toast.success(`Notification envoyée à ${r.data.recipients} entreprise(s)`)
      setMsg({ title: '', message: '' })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Card title="Notification administrative" subtitle="Message envoyé par email aux entreprises" actions={<Button variant="primary" icon={FiSend} loading={loading} onClick={send}>Envoyer</Button>} pad>
      <div className="stack" style={{ gap: 14 }}>
        <Toggle checked={all} onChange={setAll} label="Toutes les entreprises actives" />
        {!all && (
          <div className="chips">
            {(companies.data?.data || []).map((c) => (
              <button key={c.id} className={`chip gold ${ids.includes(c.id) ? 'active' : ''}`} onClick={() => setIds((x) => (x.includes(c.id) ? x.filter((i) => i !== c.id) : [...x, c.id]))}>{c.name}</button>
            ))}
          </div>
        )}
        <Field label="Objet"><Input value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /></Field>
        <Field label="Message"><Textarea value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} style={{ minHeight: 160 }} /></Field>
      </div>
    </Card>
  )
}

function Jobs() {
  const { data, reload } = useApi('/jobs')
  const [running, setRunning] = useState(false)
  const run = async () => {
    setRunning(true)
    try {
      const r = await api.post('/jobs/expirations/run')
      const d = r.data.data
      toast.success(d.skipped ? d.reason : `${d.processed} véhicule(s) traité(s) : ${d.renewed} renouvelé(s), ${d.expired} désactivé(s), ${d.reminders} rappel(s)`)
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }
  const j = data?.data
  return (
    <Card title="Tâches planifiées" subtitle="Expirations, renouvellements automatiques, rappels, sauvegardes" actions={<Button variant="primary" icon={FiPlay} loading={running} onClick={run}>Exécuter maintenant</Button>} pad>
      {j && (
        <div className="spec-grid">
          <div className="spec"><FiClock /><small>Planification</small><strong className="mono">{j.cron}</strong></div>
          <div className="spec"><FiSettings /><small>Statut</small><strong>{j.enabled ? (j.running ? 'En cours…' : 'Actif') : 'Désactivé'}</strong></div>
          <div className="spec"><FiCheckCircle /><small>Dernière exécution</small><strong>{j.lastRun ? fmtDateTime(j.lastRun) : '—'}</strong></div>
          {j.lastResult && <div className="spec"><FiDollarSign /><small>Dernier résultat</small><strong>{j.lastResult.renewed ?? 0} renouv. · {j.lastResult.expired ?? 0} exp. · {j.lastResult.reminders ?? 0} rappels</strong></div>}
        </div>
      )}
      {j?.lastError && <div className="callout red mt-2">{j.lastError}</div>}
      <div className="callout mt-3">
        <FiInfo />
        <div>
          À chaque exécution : envoi des rappels avant expiration, puis pour chaque véhicule arrivé à échéance → débit de la publication et renouvellement si le solde le permet, sinon désactivation et email à l’entreprise. Chaque débit est idempotent : aucun double débit possible. Une sauvegarde de la base est réalisée chaque nuit à 02:00.
        </div>
      </div>
    </Card>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('general')
  const { data, loading, error, reload } = useApi('/settings')
  const [version, setVersion] = useState(0)
  useEffect(() => setVersion((v) => v + 1), [data])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (loading && !data) return <Loader />
  const s = data.data
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration générale de la plateforme" />
      <div className="mb-2">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'general', label: 'Général', icon: FiSettings },
            { value: 'billing', label: 'Tarification', icon: FiDollarSign },
            { value: 'smtp', label: 'Emails (Gmail)', icon: FiMail },
            { value: 'flexpay', label: 'Paiement FlexPay', icon: FiCreditCard },
            { value: 'notify', label: 'Notifications', icon: FiSend },
            { value: 'jobs', label: 'Tâches', icon: FiClock },
          ]}
        />
      </div>
      {tab === 'general' && <General key={version} initial={s.general} onSaved={reload} />}
      {tab === 'billing' && <Billing key={version} initial={s.billing} onSaved={reload} />}
      {tab === 'smtp' && <Smtp key={version} initial={s.smtp} onSaved={reload} />}
      {tab === 'flexpay' && <Flexpay />}
      {tab === 'notify' && <Notifications />}
      {tab === 'jobs' && <Jobs />}
    </>
  )
}
