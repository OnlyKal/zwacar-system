import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiCreditCard, FiEdit2, FiInfo, FiPlus, FiTrash2 } from 'react-icons/fi'
import { Badge, Button, Card, ConfirmDialog, DataTable, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Textarea, Toggle } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { api, errorMessage, fieldErrors } from '../../api/client'

const ICONS = [
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'request', label: 'Demande' },
]

function MethodModal({ open, onClose, method, providers, onSaved }) {
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(method ? { ...method, instructions: method.instructions || '' } : { code: '', name: '', provider: 'manual', instructions: '', icon: 'mobile', active: true, sortOrder: 0 })
  }, [open, method])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const submit = async () => {
    setLoading(true)
    try {
      const body = { code: form.code, name: form.name, provider: form.provider, instructions: form.instructions, icon: form.icon, active: form.active, sortOrder: Number(form.sortOrder) || 0 }
      if (method) await api.patch(`/payment-methods/${method.id}`, body)
      else await api.post('/payment-methods', body)
      toast.success('Moyen de paiement enregistré')
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
    <Modal open={open} onClose={onClose} title={method ? 'Modifier le moyen de paiement' : 'Nouveau moyen de paiement'} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit}>Enregistrer</Button></>}>
      <div className="form-grid">
        <Field label="Nom affiché" required error={errors.name} className="full"><Input value={form.name || ''} onChange={set('name')} placeholder="Airtel Money" /></Field>
        <Field label="Code technique" required error={errors.code} hint="Minuscules, chiffres, - et _"><Input value={form.code || ''} onChange={set('code')} disabled={Boolean(method)} /></Field>
        <Field label="Fournisseur" required error={errors.provider}><Select value={form.provider} onChange={set('provider')} options={providers.map((p) => ({ value: p.code, label: p.label }))} /></Field>
        <Field label="Icône"><Select value={form.icon || ''} onChange={set('icon')} options={ICONS} /></Field>
        <Field label="Ordre"><Input type="number" value={form.sortOrder ?? 0} onChange={set('sortOrder')} /></Field>
        <Field label="Instructions de paiement" className="full" hint="Affichées à l’entreprise lors d’un rechargement (numéro, IBAN, etc.)"><Textarea value={form.instructions || ''} onChange={set('instructions')} /></Field>
        <div className="full"><Toggle checked={form.active} onChange={set('active')} label="Proposé aux entreprises" /></div>
      </div>
    </Modal>
  )
}

export default function PaymentMethods() {
  const { data, loading, error, reload } = useApi('/payment-methods', { all: '1' })
  const providers = useApi('/payment-methods/providers')
  const [modal, setModal] = useState(null)
  const [del, setDel] = useState(null)
  const toggle = async (m) => {
    try {
      await api.patch(`/payment-methods/${m.id}`, { active: !m.active })
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <>
      <PageHeader title="Moyens de paiement" subtitle="Configurez les moyens de rechargement proposés aux entreprises">
        <Button variant="primary" icon={FiPlus} onClick={() => setModal('new')}>Ajouter</Button>
      </PageHeader>
      <div className="callout blue mb-2">
        <FiInfo />
        <div>
          <b>Deux façons de recharger :</b> <b>Mobile Money</b> (FlexPay — l’entreprise paie depuis son téléphone, les crédits sont ajoutés automatiquement après vérification et vous recevez une notification ; identifiants dans Paramètres → Paiement FlexPay) ou <b>Demande de recharge</b> (vous validez la demande après réception du paiement). Un moyen Mobile Money non configuré n’est pas proposé aux entreprises.
        </div>
      </div>
      <Card>
        <DataTable
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={<Empty icon={FiCreditCard} title="Aucun moyen de paiement" />}
          columns={[
            { key: 'name', label: 'Moyen de paiement', render: (m) => <div><div className="cell-main">{m.name}</div><div className="cell-sub mono">{m.code}</div></div> },
            {
              key: 'provider',
              label: 'Fournisseur',
              render: (m) => (
                <div className="row wrap" style={{ gap: 6 }}>
                  <Badge tone={m.provider === 'sandbox' ? 'amber' : m.online ? 'green' : 'gold'} plain>{m.provider}</Badge>
                  {m.online && !m.available && <Link to="/admin/settings" className="small" style={{ color: 'var(--red)', fontWeight: 600 }}>À configurer</Link>}
                </div>
              ),
            },
            { key: 'instructions', label: 'Instructions', render: (m) => <span className="small muted">{m.instructions?.slice(0, 90) || '—'}{m.instructions?.length > 90 ? '…' : ''}</span> },
            { key: 'active', label: 'Actif', render: (m) => <Toggle checked={m.active} onChange={() => toggle(m)} /> },
            { key: 'a', label: '', align: 'right', render: (m) => <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}><IconButton icon={FiEdit2} title="Modifier" onClick={() => setModal(m)} /><IconButton icon={FiTrash2} title="Supprimer" onClick={() => setDel(m)} /></div> },
          ]}
        />
      </Card>
      <MethodModal open={Boolean(modal)} onClose={() => setModal(null)} method={modal === 'new' ? null : modal} providers={providers.data?.data || []} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        danger
        title={`Supprimer « ${del?.name} »`}
        message="Impossible si des paiements utilisent ce moyen : désactivez-le plutôt."
        confirmLabel="Supprimer"
        onConfirm={() => api.delete(`/payment-methods/${del.id}`).then(() => { toast.success('Supprimé'); reload() }).catch((e) => { toast.error(errorMessage(e)); throw e })}
      />
    </>
  )
}
