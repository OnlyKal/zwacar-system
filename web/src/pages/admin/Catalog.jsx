import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiEdit2, FiLayers, FiPlus, FiStar, FiTrash2 } from 'react-icons/fi'
import { Badge, Button, Card, ConfirmDialog, DataTable, Empty, Field, IconButton, Input, Modal, PageHeader, Toggle } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { api, errorMessage } from '../../api/client'

function ItemModal({ open, onClose, item, kind, onSaved }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (open) setForm(item ? { name: item.name, description: item.description || '', icon: item.icon || '', active: item.active, sortOrder: item.sortOrder ?? 0 } : { name: '', description: '', icon: '', active: true, sortOrder: 0 })
  }, [open, item])
  const isCat = kind === 'categories'
  const submit = async () => {
    setLoading(true)
    try {
      const body = { name: form.name, icon: form.icon, active: form.active }
      if (isCat) Object.assign(body, { description: form.description, sortOrder: Number(form.sortOrder) || 0 })
      if (item) await api.patch(`/catalog/${kind}/${item.id}`, body)
      else await api.post(`/catalog/${kind}`, body)
      toast.success('Enregistré')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`${item ? 'Modifier' : 'Nouvelle'} ${isCat ? 'catégorie' : 'caractéristique'}`} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={loading} onClick={submit}>Enregistrer</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Nom" required><Input value={form.name || ''} onChange={set('name')} autoFocus /></Field>
        {isCat && <Field label="Description"><Input value={form.description || ''} onChange={set('description')} /></Field>}
        <div className="form-grid">
          <Field label="Icône (identifiant)" hint="Utilisée par l’application mobile"><Input value={form.icon || ''} onChange={set('icon')} placeholder="suv, sedan…" /></Field>
          {isCat && <Field label="Ordre d’affichage"><Input type="number" value={form.sortOrder} onChange={set('sortOrder')} /></Field>}
        </div>
        <Toggle checked={form.active} onChange={set('active')} label="Active (proposée aux entreprises et aux clients)" />
      </div>
    </Modal>
  )
}

function Panel({ kind, title, icon }) {
  const { data, loading, error, reload } = useApi(`/catalog/${kind}`)
  const [modal, setModal] = useState(null)
  const [del, setDel] = useState(null)
  const toggle = async (it) => {
    try {
      await api.patch(`/catalog/${kind}/${it.id}`, { active: !it.active })
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Card title={title} subtitle={`${data?.data?.length ?? '…'} élément(s)`} actions={<Button size="sm" variant="primary" icon={FiPlus} onClick={() => setModal('new')}>Ajouter</Button>}>
      <DataTable
        rows={data?.data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<Empty icon={icon} title="Aucun élément" />}
        columns={[
          { key: 'name', label: 'Nom', render: (c) => <div><div className="cell-main">{c.name}</div>{c.description && <div className="cell-sub">{c.description}</div>}</div> },
          ...(kind === 'categories' ? [{ key: 'v', label: 'Véhicules', render: (c) => <Badge plain>{c.vehiclesCount}</Badge> }] : []),
          { key: 'active', label: 'Active', render: (c) => <Toggle checked={c.active} onChange={() => toggle(c)} /> },
          { key: 'a', label: '', align: 'right', render: (c) => <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}><IconButton icon={FiEdit2} title="Modifier" onClick={() => setModal(c)} /><IconButton icon={FiTrash2} title="Supprimer" onClick={() => setDel(c)} /></div> },
        ]}
      />
      <ItemModal open={Boolean(modal)} onClose={() => setModal(null)} item={modal === 'new' ? null : modal} kind={kind} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        danger
        title={`Supprimer « ${del?.name} »`}
        message={kind === 'categories' ? 'Impossible si des véhicules utilisent cette catégorie : désactivez-la plutôt.' : 'La caractéristique sera retirée de tous les véhicules.'}
        confirmLabel="Supprimer"
        onConfirm={() => api.delete(`/catalog/${kind}/${del.id}`).then(() => { toast.success('Supprimé'); reload() }).catch((e) => { toast.error(errorMessage(e)); throw e })}
      />
    </Card>
  )
}

export default function Catalog() {
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Catégories et caractéristiques utilisées dans les fiches véhicules et les filtres de recherche" />
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <Panel kind="categories" title="Catégories de véhicules" icon={FiLayers} />
        <Panel kind="features" title="Caractéristiques & équipements" icon={FiStar} />
      </div>
    </>
  )
}
