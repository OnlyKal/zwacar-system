import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiArchive, FiDownload, FiPlus, FiRotateCcw, FiTrash2, FiUpload, FiInfo } from 'react-icons/fi'
import { Badge, Button, Card, ConfirmDialog, DataTable, Empty, IconButton, PageHeader } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { api, downloadFile, errorMessage } from '../../api/client'
import { fmtBytes, fmtDateTime } from '../../utils/format'

export default function Backups() {
  const { data, loading, error, reload } = useApi('/backups')
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const file = useRef()

  const create = async () => {
    setCreating(true)
    try {
      const r = await api.post('/backups')
      toast.success(`Sauvegarde créée : ${r.data.data.file}`)
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  const doAction = async () => {
    const { kind, b, upload } = confirm
    try {
      if (kind === 'delete') {
        await api.delete(`/backups/${b.file}`)
        toast.success('Sauvegarde supprimée')
      } else if (upload) {
        const fd = new FormData()
        fd.append('file', upload)
        fd.append('confirm', 'RESTAURER')
        await api.post('/backups/upload-restore', fd, { timeout: 600000 })
        toast.success('Base restaurée. Reconnectez-vous.')
        setTimeout(() => window.location.assign('/login'), 1200)
      } else {
        const r = await api.post(`/backups/${b.file}/restore`, { confirm: 'RESTAURER' }, { timeout: 600000 })
        toast.success(`Base restaurée (sauvegarde de sécurité : ${r.data.data.safetyBackup})`)
        setTimeout(() => window.location.assign('/login'), 1500)
      }
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  const kindOf = (f) => (f.includes('-auto') ? ['Automatique', 'blue'] : f.includes('pre-restore') ? ['Avant restauration', 'amber'] : f.includes('before-delete') ? ['Avant suppression', 'violet'] : ['Manuelle', 'gold'])

  return (
    <>
      <PageHeader title="Sauvegardes" subtitle="Sauvegarde et restauration de la base de données">
        <Button icon={FiUpload} onClick={() => file.current.click()}>Restaurer depuis un fichier</Button>
        <input ref={file} type="file" hidden accept=".gz,.json" onChange={(e) => { if (e.target.files[0]) setConfirm({ kind: 'restore', upload: e.target.files[0] }); e.target.value = '' }} />
        <Button variant="primary" icon={FiPlus} loading={creating} onClick={create}>Créer une sauvegarde</Button>
      </PageHeader>
      <div className="callout blue mb-2">
        <FiInfo />
        <div>
          Sauvegarde automatique chaque nuit (14 dernières conservées). Le format JSON compressé est portable entre SQLite (développement) et MySQL (production). Les fichiers médias (<span className="mono">storage/uploads</span>) sont à sauvegarder séparément au niveau du serveur.
        </div>
      </div>
      <Card>
        <DataTable
          rowKey="file"
          rows={data?.data}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={<Empty icon={FiArchive} title="Aucune sauvegarde" />}
          columns={[
            { key: 'file', label: 'Fichier', render: (b) => <span className="mono">{b.file}</span> },
            { key: 'kind', label: 'Type', render: (b) => { const [l, t] = kindOf(b.file); return <Badge tone={t}>{l}</Badge> } },
            { key: 'size', label: 'Taille', render: (b) => fmtBytes(b.size) },
            { key: 'date', label: 'Date', render: (b) => fmtDateTime(b.createdAt) },
            {
              key: 'a',
              label: '',
              align: 'right',
              render: (b) => (
                <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                  <IconButton icon={FiDownload} title="Télécharger" onClick={() => downloadFile(`/backups/${b.file}/download`, b.file).catch((e) => toast.error(errorMessage(e)))} />
                  <IconButton icon={FiRotateCcw} title="Restaurer" onClick={() => setConfirm({ kind: 'restore', b })} />
                  <IconButton icon={FiTrash2} title="Supprimer" onClick={() => setConfirm({ kind: 'delete', b })} />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        danger
        title={confirm?.kind === 'delete' ? 'Supprimer la sauvegarde' : 'Restaurer la base de données'}
        message={
          confirm?.kind === 'delete'
            ? confirm.b.file
            : 'Toutes les données actuelles seront remplacées par celles de la sauvegarde. Une sauvegarde de sécurité est créée automatiquement avant l’opération. Toutes les sessions seront fermées.'
        }
        confirmText={confirm?.kind === 'restore' ? 'RESTAURER' : undefined}
        confirmLabel={confirm?.kind === 'delete' ? 'Supprimer' : 'Restaurer'}
        onConfirm={doAction}
      />
    </>
  )
}
