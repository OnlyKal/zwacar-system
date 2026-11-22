/**
 * Tableaux financiers partagés : paiements (rechargements) et grand livre des crédits.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCheck, FiDownload, FiFileText, FiPrinter, FiRefreshCw, FiX, FiXCircle, FiCreditCard, FiDollarSign } from 'react-icons/fi'
import { Button, ConfirmDialog, DataTable, Empty, Field, IconButton, Input, Modal, Pagination, SearchInput, Select, StatusBadge } from './ui'
import { useApi, useDebounce } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { api, errorMessage, openPdf } from '../api/client'
import { fmtDateTime, fmtMoney, fmtNumber, PAYMENT_STATUS, TX_TYPES } from '../utils/format'

const pdf = (path, opts) => openPdf(path, opts).catch((e) => toast.error(errorMessage(e)))

function ConfirmPaymentModal({ payment, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setNote('')
  }, [payment])
  if (!payment) return null
  const go = async () => {
    setLoading(true)
    try {
      await api.post(`/payments/${payment.id}/confirm`, { adminNote: note })
      toast.success(`Paiement confirmé : +${payment.credits} crédits pour ${payment.company?.name}`)
      onDone()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Confirmer la réception du paiement" subtitle={payment.reference} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" icon={FiCheck} loading={loading} onClick={go}>Confirmer et créditer</Button></>}>
      <div className="price-box mb-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div><small>Montant</small><strong>{fmtMoney(payment.amount, payment.currency)}</strong></div>
        <div><small>Crédits</small><strong>+{payment.credits}</strong></div>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="small muted">{payment.company?.name} · {payment.methodName}{payment.payerNote ? ` · « ${payment.payerNote} »` : ''}</div>
        <Field label="Référence de transaction" hint="Générée automatiquement par le système à la validation">
          <Input value={payment.providerReference || 'Automatique (TRX-…)'} readOnly disabled className="mono" />
        </Field>
        <Field label="Note interne"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="callout"><FiFileText /> La facture et le reçu seront envoyés automatiquement par email à l’entreprise.</div>
      </div>
    </Modal>
  )
}

/** Liste des paiements. `companyId` force le filtre (vue entreprise / détail). */
export function PaymentsTable({ companyId: forcedCompany, compact, refreshKey, initialCompany = '', initialStatus = '' }) {
  const { isSuperAdmin, can } = useAuth()
  const [status, setStatus] = useState(initialStatus)
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState(initialCompany)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [toConfirm, setToConfirm] = useState(null)
  const [action, setAction] = useState(null)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [status, dq, companyId, from, to])
  const { data, loading, error, reload } = useApi('/payments', { status, q: dq, companyId: forcedCompany || companyId, from, to, page, limit: compact ? 8 : 20, _r: refreshKey })
  const companies = useApi(isSuperAdmin && !forcedCompany ? '/companies/options' : null)

  const [verifying, setVerifying] = useState(null)
  const isOnline = (p) => p.paymentMethod?.provider === 'flexpay_mobile'
  const verify = async (p) => {
    setVerifying(p.id)
    try {
      const r = await api.post(`/payments/${p.id}/refresh`)
      const st = r.data.data.status
      if (st === 'completed') toast.success(`Paiement confirmé : +${r.data.data.credits} crédits`)
      else if (st === 'failed') toast.error('Paiement refusé par l’opérateur')
      else if (r.data.anomaly) toast.error('Anomalie détectée : vérification manuelle requise')
      else toast('Toujours en attente de confirmation', { icon: '⏳' })
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setVerifying(null)
    }
  }

  const close = async (p, kind, note) => {
    try {
      await api.post(`/payments/${p.id}/${kind}`, { adminNote: note })
      toast.success(kind === 'reject' ? 'Paiement rejeté' : 'Demande annulée')
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  const columns = [
    { key: 'ref', label: 'Référence', render: (p) => <div><div className="cell-main mono">{p.reference}</div><div className="cell-sub">{fmtDateTime(p.createdAt)}</div></div> },
    ...(isSuperAdmin && !forcedCompany ? [{ key: 'company', label: 'Entreprise', render: (p) => <Link to={`/admin/companies/${p.companyId}`} className="strong">{p.company?.name}</Link> }] : []),
    { key: 'method', label: 'Moyen', render: (p) => <div><div>{p.methodName}</div>{p.providerReference && <div className="cell-sub mono">{p.providerReference}</div>}{p.operatorReference && <div className="cell-sub mono">Opérateur : {p.operatorReference}</div>}</div> },
    { key: 'credits', label: 'Crédits', align: 'right', render: (p) => <b>+{fmtNumber(p.credits)}</b> },
    { key: 'amount', label: 'Montant', align: 'right', render: (p) => <b>{fmtMoney(p.amount, p.currency)}</b> },
    { key: 'status', label: 'Statut', render: (p) => <div><StatusBadge map={PAYMENT_STATUS} value={p.status} />{p.failureReason && <div className="cell-sub" style={{ color: 'var(--red)', maxWidth: 220, whiteSpace: 'normal' }}>{p.failureReason}</div>}</div> },
    {
      key: 'docs',
      label: 'Documents',
      align: 'right',
      render: (p) => (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
          {p.status === 'pending' && isOnline(p) && <Button size="sm" icon={FiRefreshCw} loading={verifying === p.id} onClick={() => verify(p)}>Vérifier</Button>}
          {isSuperAdmin && p.status === 'pending' && (
            <>
              <Button size="sm" variant="primary" icon={FiCheck} onClick={() => setToConfirm(p)}>Confirmer</Button>
              <IconButton icon={FiX} title="Rejeter" onClick={() => setAction({ p, kind: 'reject' })} />
            </>
          )}
          {!isSuperAdmin && p.status === 'pending' && can('wallet:topup') && <IconButton icon={FiXCircle} title="Annuler la demande" onClick={() => setAction({ p, kind: 'cancel' })} />}
          <IconButton icon={FiFileText} title="Voir / imprimer la facture" onClick={() => pdf(`/payments/${p.id}/invoice.pdf`)} />
          <IconButton icon={FiDownload} title="Télécharger la facture" onClick={() => pdf(`/payments/${p.id}/invoice.pdf`, { download: true, filename: `Facture-${p.invoiceNumber}.pdf` })} />
          {p.status === 'completed' && <IconButton icon={FiPrinter} title="Reçu de paiement" onClick={() => pdf(`/payments/${p.id}/receipt.pdf`)} />}
        </div>
      ),
    },
  ]

  return (
    <>
      {!compact && (
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Référence, facture, opérateur…" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Tous statuts" options={Object.entries(PAYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          {isSuperAdmin && !forcedCompany && <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toutes entreprises" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />}
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Du" style={{ width: 'auto' }} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Au" style={{ width: 'auto' }} />
          {data?.totals && <span className="small muted" style={{ marginLeft: 'auto' }}>Encaissé : <b className="strong">{fmtMoney(data.totals.completedAmount)}</b></span>}
        </div>
      )}
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} empty={<Empty icon={FiCreditCard} title="Aucun paiement" />} />
      <Pagination meta={data?.meta} onPage={setPage} />
      <ConfirmPaymentModal payment={toConfirm} onClose={() => setToConfirm(null)} onDone={reload} />
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        danger
        withReason={action?.kind === 'reject'}
        title={action?.kind === 'reject' ? 'Rejeter le paiement' : 'Annuler la demande'}
        message={action && `${action.p.reference} — ${fmtMoney(action.p.amount)}. Aucun crédit ne sera ajouté.`}
        confirmLabel={action?.kind === 'reject' ? 'Rejeter' : 'Annuler la demande'}
        onConfirm={(note) => close(action.p, action.kind, note)}
      />
    </>
  )
}

/** Grand livre des crédits. */
export function TransactionsTable({ companyId: forcedCompany, compact, refreshKey, initialCompany = '' }) {
  const { isSuperAdmin } = useAuth()
  const [type, setType] = useState('')
  const [direction, setDirection] = useState('')
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState(initialCompany)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  useEffect(() => setPage(1), [type, direction, dq, companyId, from, to])
  const { data, loading, error, reload } = useApi('/wallet/transactions', { type, direction, q: dq, companyId: forcedCompany || companyId, from, to, page, limit: compact ? 8 : 20, _r: refreshKey })
  const companies = useApi(isSuperAdmin && !forcedCompany ? '/companies/options' : null)

  const columns = [
    { key: 'date', label: 'Date', render: (t) => <div><div className="cell-main">{fmtDateTime(t.createdAt)}</div><div className="cell-sub mono">{t.reference}</div></div> },
    ...(isSuperAdmin && !forcedCompany ? [{ key: 'company', label: 'Entreprise', render: (t) => t.company?.name }] : []),
    { key: 'type', label: 'Opération', render: (t) => <StatusBadge map={TX_TYPES} value={t.type} /> },
    { key: 'desc', label: 'Description', render: (t) => <div><div>{t.description}</div>{t.vehicle && <div className="cell-sub">{t.vehicle.brand} {t.vehicle.model} {t.vehicle.year}</div>}</div> },
    { key: 'amount', label: 'Mouvement', align: 'right', render: (t) => <span className={t.amount > 0 ? 'amount-in' : 'amount-out'}>{t.amount > 0 ? '+' : ''}{fmtNumber(t.amount)}</span> },
    { key: 'balance', label: 'Solde', align: 'right', render: (t) => <b>{fmtNumber(t.balanceAfter)}</b> },
    { key: 'pdf', label: '', align: 'right', render: (t) => <IconButton icon={FiFileText} title="Reçu PDF" onClick={() => pdf(`/wallet/transactions/${t.id}/receipt.pdf`)} /> },
  ]

  return (
    <>
      {!compact && (
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Référence, description…" />
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="Toutes opérations" options={Object.entries(TX_TYPES).map(([value, s]) => ({ value, label: s.label }))} />
          <Select value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="Crédits et débits" options={[{ value: 'in', label: 'Crédits (+)' }, { value: 'out', label: 'Débits (−)' }]} />
          {isSuperAdmin && !forcedCompany && <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toutes entreprises" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />}
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
      )}
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} empty={<Empty icon={FiDollarSign} title="Aucune opération" />} />
      <Pagination meta={data?.meta} onPage={setPage} />
    </>
  )
}
