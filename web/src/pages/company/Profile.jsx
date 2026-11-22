import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera, FiSave } from 'react-icons/fi'
import { Avatar, Button, Card, ErrorBox, Loader, PageHeader } from '../../components/ui'
import CompanyFields, { companyPayload } from '../../components/CompanyForm'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function CompanyProfile() {
  const { can, reloadUser } = useAuth()
  const editable = can('company:update')
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const logo = useRef()

  const load = () => api.get('/company').then((r) => setForm(r.data.data)).catch((e) => setError(errorMessage(e)))
  useEffect(() => {
    load()
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!form) return <Loader />

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      await api.patch('/company', companyPayload(form))
      toast.success('Informations enregistrées')
      reloadUser()
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const uploadLogo = async (file) => {
    const fd = new FormData()
    fd.append('logo', file)
    try {
      const r = await api.post('/company/logo', fd)
      setForm(r.data.data)
      reloadUser()
      toast.success('Logo mis à jour')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title="Mon entreprise" subtitle="Ces coordonnées sont affichées aux clients et figurent sur vos factures">
        {editable && <Button variant="primary" icon={FiSave} loading={saving} onClick={save}>Enregistrer</Button>}
      </PageHeader>
      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Card title="Informations" pad>
          <CompanyFields form={form} setForm={setForm} errors={errors} disabled={!editable} />
        </Card>
        <Card title="Logo" subtitle="Carré, 400×400 px recommandé" pad>
          <div className="center">
            <div style={{ display: 'inline-block' }}><Avatar size="lg" src={form.logoUrl} user={{ firstName: form.name }} /></div>
            {editable && (
              <>
                <div className="mt-2"><Button icon={FiCamera} onClick={() => logo.current.click()}>Changer le logo</Button></div>
                <input ref={logo} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
              </>
            )}
          </div>
          <hr className="divider" />
          <div className="small muted">
            Les clients vous contactent directement via le téléphone et le numéro WhatsApp renseignés ici depuis l’application mobile.
          </div>
        </Card>
      </div>
    </>
  )
}
