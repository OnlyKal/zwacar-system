/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCheckCircle, FiClock, FiCreditCard, FiInfo, FiLoader, FiPlus, FiRefreshCw, FiShield, FiSmartphone, FiTrendingDown, FiHome, FiDollarSign, FiXCircle, FiZap, FiSend } from 'react-icons/fi'
import { Button, Card, ErrorBox, Field, Input, Loader, Modal, PageHeader, Select, StatCard, Tabs, Toggle } from '../../components/ui'
import { PaymentsTable, TransactionsTable } from '../../components/finance'
import { api, errorMessage } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { fmtMoney, fmtNumber, topupPrice } from '../../utils/format'

const METHOD_ICON = { mobile: FiSmartphone, request: FiSend, bank: FiHome, cash: FiDollarSign, test: FiZap }

const methodHint = (m) =>
  m.provider === 'sandbox'
    ? 'Confirmation immédiate (test)'
    : m.provider === 'flexpay_mobile'
      ? 'Paiement immédiat — validation sur votre téléphone, crédits ajoutés automatiquement'
      : 'Demande transmise à l’administrateur — crédits ajoutés après validation'

/** Accepte 0812345678, 812345678, +243 812 345 678… */
export const validPhone = (v) => {
  let d = String(v || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('243')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return /^[89]\d{8}$/.test(d)
}

/** Sélecteur de packs + moyen de paiement (partagé entre entreprise et super admin). */
function TopupForm({ billing, methods, packs, setPacks, methodId, setMethodId, note, setNote, phone, setPhone }) {
  const presets = [1, 2, 5, 10]
  const selected = methods.find((m) => m.id === methodId)
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <div className="field"><label>Nombre de packs</label></div>
        <div className="pack-picker mt-1">
          {presets.map((n) => {
            const p = topupPrice(billing, n)
            return (
              <div key={n} className={`pack ${packs === n ? 'active' : ''}`} onClick={() => setPacks(n)}>
                {p.percent > 0 && <span className="pack-off">−{p.percent} %</span>}
                <strong>{p.credits}</strong>
                <small>crédits</small>
                <div className="small strong mt-1" style={{ color: 'var(--gold-700)' }}>{fmtMoney(p.net)}</div>
                {p.percent > 0 && <div className="pack-old">{fmtMoney(p.gross)}</div>}
              </div>
            )
          })}
        </div>
        <div className="row mt-2" style={{ gap: 10 }}>
          <span className="small muted">Autre quantité :</span>
          <Input type="number" min={billing.minTopupPacks} max={billing.maxTopupPacks} value={packs} onChange={(e) => setPacks(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 100 }} />
          <span className="small muted">pack(s) de {billing.packCredits} crédits</span>
        </div>
      </div>
      <div>
        <div className="field"><label>Moyen de paiement</label></div>
        <div className="stack mt-1" style={{ gap: 8 }}>
          {methods.map((m) => {
            const Icon = METHOD_ICON[m.icon] || FiCreditCard
            return (
              <div key={m.id} className={`method ${methodId === m.id ? 'active' : ''}`} onClick={() => setMethodId(m.id)}>
                <div className="m-icon"><Icon /></div>
                <div style={{ flex: 1 }}>
                  <div className="strong">{m.name}</div>
                  <div className="small muted">{methodHint(m)}</div>
                </div>
                {methodId === m.id && <FiCheckCircle style={{ color: 'var(--gold)', fontSize: 20 }} />}
              </div>
            )
          })}
          {!methods.length && <div className="callout red">Aucun moyen de paiement actif. Contactez l’administrateur.</div>}
        </div>
      </div>
      {selected?.needsPhone ? (
        <Field label="Numéro Mobile Money" required hint="M-Pesa, Orange Money, Airtel Money ou Afrimoney — la demande de paiement arrivera sur ce téléphone" error={phone && !validPhone(phone) ? 'Numéro invalide (ex. 0812345678)' : null}>
          <div className="input-icon"><FiSmartphone /><input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" /></div>
        </Field>
      ) : selected?.online ? null : (
        <Field label="Note (facultatif)" hint="La référence de transaction est générée automatiquement"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      )}
      <div className="callout">
        <FiInfo />
        <div>
          {(() => {
            const p = topupPrice(billing, packs)
            return (
              <>
                Total : <b>{fmtMoney(p.net)}</b>
                {p.percent > 0 && <> <s className="muted">{fmtMoney(p.gross)}</s> — remise de {p.percent} % (−{fmtMoney(p.saving)})</>} pour <b>{fmtNumber(p.credits)} crédits</b>, soit {Math.floor(p.credits / billing.publishCost)} publication(s) de véhicule ({billing.publishCost} crédits / {billing.validityMonths} mois).
                {(billing.volumeDiscounts || []).length > 0 && (
                  <div className="small muted mt-1">
                    Remises : {[...billing.volumeDiscounts].sort((a, b) => a.minPacks - b.minPacks).map((t) => `${t.percent} % dès ${t.minPacks} packs`).join(' · ')}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function useTopupState(open) {
  const [packs, setPacks] = useState(1)
  const [methodId, setMethodId] = useState(null)
  const [note, setNote] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (open) {
      setPacks(1)
      setNote('')
      setResult(null)
    }
  }, [open])
  return { packs, setPacks, methodId, setMethodId, note, setNote, phone, setPhone, result, setResult }
}

/**
 * Suivi en direct d'un paiement en ligne : interroge l'API (qui revérifie auprès de FlexPay)
 * toutes les 4 secondes pendant 3 minutes au plus.
 */
function usePaymentWatch(payment, onSettled) {
  const [state, setState] = useState({ payment, checking: false, timedOut: false })
  const tries = useRef(0)
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled
  const check = async () => {
    setState((s) => ({ ...s, checking: true }))
    try {
      const r = await api.post(`/payments/${payment.id}/refresh`)
      setState((s) => ({ ...s, payment: r.data.data, balance: r.data.balance, checking: false }))
      if (r.data.data.status !== 'pending') settledRef.current?.(r.data.data, r.data.balance)
      return r.data.data
    } catch {
      setState((s) => ({ ...s, checking: false }))
      return null
    }
  }
  useEffect(() => {
    if (!payment || payment.status !== 'pending') return undefined
    tries.current = 0
    let stop = false
    const timer = setInterval(async () => {
      if (stop) return
      tries.current += 1
      const p = await check()
      if ((p && p.status !== 'pending') || tries.current >= 45) {
        clearInterval(timer)
        if (p?.status === 'pending' || !p) setState((s) => ({ ...s, timedOut: true }))
      }
    }, 4000)
    return () => {
      stop = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id])
  return { ...state, check }
}

function OnlineWaiting({ result, onSettled, onRetry }) {
  const w = usePaymentWatch(result.data, onSettled)
  const p = w.payment
  if (p.status === 'completed') {
    return (
      <div className="center" style={{ padding: 20 }}>
        <div className="empty-icon" style={{ margin: '0 auto 14px', background: 'var(--green-bg)', color: 'var(--green)' }}><FiCheckCircle /></div>
        <h3>Paiement confirmé</h3>
        <p className="muted">+{p.credits} crédits ajoutés{w.balance != null ? <> — nouveau solde : <b>{w.balance}</b> crédits</> : null}. La facture et le reçu vous ont été envoyés par email.</p>
      </div>
    )
  }
  if (p.status === 'failed' || p.status === 'cancelled') {
    return (
      <div className="center" style={{ padding: 20 }}>
        <div className="empty-icon" style={{ margin: '0 auto 14px', background: 'var(--red-bg)', color: 'var(--red)' }}><FiXCircle /></div>
        <h3>Paiement non abouti</h3>
        <p className="muted">{p.failureReason || 'Le paiement a été refusé ou annulé.'} Aucun montant n’a été crédité.</p>
        <Button className="mt-2" variant="primary" onClick={onRetry}>Réessayer</Button>
      </div>
    )
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="center" style={{ padding: '10px 0 0' }}>
        <div className="empty-icon" style={{ margin: '0 auto 14px' }}><FiSmartphone /></div>
        <h3>Validez le paiement sur votre téléphone</h3>
        <p className="muted" style={{ maxWidth: 380, margin: '6px auto 0' }}>
          Une demande de <b>{fmtMoney(p.amount, p.currency)}</b> a été envoyée au <b className="nowrap">+{p.payerPhone}</b>. Saisissez votre code PIN Mobile Money pour confirmer.
        </p>
      </div>
      <div className="callout">
        {w.timedOut ? <FiClock /> : <FiLoader className="spin" />}
        <div>
          {w.timedOut
            ? 'Toujours en attente. Vous pouvez fermer cette fenêtre : vos crédits seront ajoutés automatiquement dès la confirmation de l’opérateur.'
            : 'En attente de la confirmation de l’opérateur… Vérification automatique en cours.'}
          {p.failureReason && <div className="small mt-1" style={{ color: 'var(--red)' }}>{p.failureReason}</div>}
        </div>
      </div>
      <div className="row between small muted">
        <span className="mono">{p.reference}</span>
        <Button size="sm" icon={FiRefreshCw} loading={w.checking} onClick={w.check}>J’ai validé — vérifier</Button>
      </div>
    </div>
  )
}

export function TopupModal({ open, onClose, billing, onDone }) {
  const st = useTopupState(open)
  const { user } = useAuth()
  const methods = useApi(open ? '/payment-methods' : null)
  const [loading, setLoading] = useState(false)
  const list = methods.data?.data || []
  const selected = list.find((m) => m.id === st.methodId)
  useEffect(() => {
    if (list.length && !list.find((m) => m.id === st.methodId)) st.setMethodId(list[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length])
  useEffect(() => {
    if (open && !st.phone && user?.phone) st.setPhone(user.phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (selected?.needsPhone && !validPhone(st.phone)) return toast.error('Saisissez un numéro Mobile Money valide (ex. 0812345678)')
    setLoading(true)
    try {
      const body = { packs: st.packs, paymentMethodId: st.methodId }
      if (selected?.needsPhone) body.phone = st.phone
      else if (!selected?.online) body.payerNote = st.note
      const r = await api.post('/payments/topup', body)
      st.setResult(r.data)
      onDone()
      if (r.data.data.status === 'completed') toast.success(`+${r.data.data.credits} crédits ajoutés à votre wallet`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const res = st.result
  const online = res?.online && res.data.status === 'pending'
  const label = selected?.online ? `Payer ${fmtMoney(topupPrice(billing, st.packs).net)}` : 'Envoyer la demande'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recharger le wallet"
      subtitle={`${billing.packPriceUsd} USD = ${billing.packCredits} crédits`}
      footer={res ? <Button variant="primary" onClick={onClose}>{online ? 'Fermer' : 'Terminer'}</Button> : <><Button onClick={onClose}>Annuler</Button><Button variant="primary" icon={selected?.online ? FiShield : FiSend} loading={loading} disabled={!st.methodId} onClick={submit}>{label}</Button></>}
    >
      {res ? (
        online ? (
          <OnlineWaiting result={res} onSettled={() => onDone()} onRetry={() => st.setResult(null)} />
        ) : res.data.status === 'completed' ? (
          <div className="center" style={{ padding: 20 }}>
            <div className="empty-icon" style={{ margin: '0 auto 14px', background: 'var(--green-bg)', color: 'var(--green)' }}><FiCheckCircle /></div>
            <h3>Rechargement confirmé</h3>
            <p className="muted">+{res.data.credits} crédits — nouveau solde : <b>{res.balance}</b> crédits. La facture et le reçu vous ont été envoyés par email.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <div className="callout"><FiClock /><div><b>Demande envoyée — {res.data.reference}</b><br />L’administrateur a été notifié. Vos crédits seront ajoutés dès la validation de votre paiement.</div></div>
            {res.instructions && <div className="card card-pad pre" style={{ background: 'var(--gold-50)' }}>{res.instructions}</div>}
          </div>
        )
      ) : methods.loading && !methods.data ? (
        <Loader />
      ) : (
        <TopupForm billing={billing} methods={list} {...st} />
      )}
    </Modal>
  )
}

/** Enregistrement d'un paiement par le Super Administrateur pour une entreprise. */
export function AdminTopupModal({ open, onClose, onDone }) {
  const st = useTopupState(open)
  const [companyId, setCompanyId] = useState('')
  const [paid, setPaid] = useState(true)
  const [loading, setLoading] = useState(false)
  const methods = useApi(open ? '/payment-methods' : null, { all: '1' })
  const companies = useApi(open ? '/companies/options' : null)
  const billing = useApi(open ? '/settings/billing' : null)
  // Les paiements en ligne sont initiés par l'entreprise elle-même.
  const list = (methods.data?.data || []).filter((m) => m.active && !m.online)
  useEffect(() => {
    if (list.length && !st.methodId) st.setMethodId(list[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length])

  const submit = async () => {
    if (!companyId) return toast.error('Sélectionnez une entreprise')
    setLoading(true)
    try {
      const r = await api.post('/payments/topup', { companyId: Number(companyId), packs: st.packs, paymentMethodId: st.methodId, payerNote: st.note, markAsPaid: paid })
      toast.success(r.data.data.status === 'completed' ? `Paiement enregistré : +${r.data.data.credits} crédits` : 'Demande de paiement créée')
      onDone()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Enregistrer un paiement" subtitle="Créditer une entreprise dont le paiement a été reçu (demande de recharge)" footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit}>Enregistrer</Button></>}>
      {!billing.data ? (
        <Loader />
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          <Field label="Entreprise" required>
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Sélectionner…" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <TopupForm billing={billing.data.data} methods={list} {...st} />
          <Toggle checked={paid} onChange={setPaid} label="Paiement déjà reçu : créditer immédiatement le wallet" />
        </div>
      )}
    </Modal>
  )
}

export default function Wallet() {
  const { can, reloadUser } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [tab, setTab] = useState('transactions')
  const [open, setOpen] = useState(sp.get('topup') === '1')
  const [key, setKey] = useState(0)
  const { data, loading, error, reload } = useApi('/wallet/summary', { _r: key })

  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (loading && !data) return <Loader />
  const s = data.data
  const b = s.billing
  const refresh = () => {
    setKey((k) => k + 1)
    reloadUser().catch(() => {})
  }
  const closeTopup = () => {
    setOpen(false)
    if (sp.get('topup')) setSp({})
  }
  const low = s.balance < b.publishCost

  return (
    <>
      <PageHeader title="Wallet & crédits" subtitle="Rechargez votre wallet pour publier et renouveler vos véhicules">
        <Button icon={FiRefreshCw} onClick={refresh}>Actualiser</Button>
        {can('wallet:topup') && <Button variant="primary" icon={FiPlus} onClick={() => setOpen(true)}>Recharger</Button>}
      </PageHeader>

      <div className="grid g-main">
        <div className="wallet-hero">
          <small>Solde disponible</small>
          <div className="balance">{fmtNumber(s.balance)} <span style={{ fontSize: 20, fontWeight: 600, color: '#c9c3b2' }}>crédits</span></div>
          <div className="row wrap mt-2" style={{ gap: 22, position: 'relative', zIndex: 1 }}>
            <div><small>Publications possibles</small><div className="strong" style={{ color: '#fff', fontSize: 18 }}>{s.publicationsAvailable}</div></div>
            <div><small>Renouvellements à venir</small><div className="strong" style={{ color: '#fff', fontSize: 18 }}>{s.upcomingRenewalCost} cr.</div></div>
            <div><small>Tarif</small><div className="strong" style={{ color: '#fff', fontSize: 18 }}>{b.packPriceUsd} $ = {b.packCredits} cr.</div></div>
          </div>
          {can('wallet:topup') && (
            <Button variant="primary" icon={FiPlus} className="mt-3" onClick={() => setOpen(true)} style={{ position: 'relative', zIndex: 1 }}>
              Recharger maintenant
            </Button>
          )}
        </div>
        <div className="grid" style={{ gridTemplateRows: '1fr 1fr' }}>
          <StatCard icon={FiTrendingDown} tone="amber" label="Crédits consommés" value={fmtNumber(s.totals.spent)} sub={`${s.totals.renewals} renouvellement(s) automatique(s)`} />
          <StatCard icon={FiCreditCard} tone="green" label="Crédits rechargés" value={fmtNumber(s.totals.credited)} sub={`${s.totals.pendingPayments} paiement(s) en attente`} />
        </div>
      </div>

      {low && (
        <div className="callout red mt-3">
          <FiInfo />
          <div>Votre solde est inférieur au coût d’une publication ({b.publishCost} crédits). Les véhicules arrivant à échéance seront désactivés faute de renouvellement automatique.</div>
        </div>
      )}
      {s.balance < s.upcomingRenewalCost && !low && (
        <div className="callout mt-3">
          <FiInfo />
          <div>Votre solde ne couvre pas le renouvellement de tous vos véhicules en renouvellement automatique ({s.upcomingRenewalCost} crédits nécessaires sur leurs prochaines échéances).</div>
        </div>
      )}

      <div className="mt-3 mb-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'transactions', label: 'Historique des opérations' }, { value: 'payments', label: 'Rechargements & factures' }]} />
      </div>
      <Card>{tab === 'transactions' ? <TransactionsTable refreshKey={key} /> : <PaymentsTable refreshKey={key} />}</Card>

      <TopupModal open={open} onClose={closeTopup} billing={b} onDone={refresh} />
    </>
  )
}
