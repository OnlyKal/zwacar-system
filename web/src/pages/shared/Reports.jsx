import { useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { FiActivity, FiBarChart2, FiBriefcase, FiDollarSign, FiDownload, FiEye, FiPieChart } from 'react-icons/fi'
import { IoCarSportOutline } from 'react-icons/io5'
import { Button, Card, Field, Input, PageHeader, Select } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { errorMessage, openPdf } from '../../api/client'

const REPORTS = [
  { type: 'statistics', title: 'Rapport statistique', text: 'Indicateurs clés et évolution sur 12 mois.', icon: FiPieChart, dates: false },
  { type: 'financial', title: 'Rapport financier', text: 'Paiements, montants encaissés et répartition par moyen de paiement.', icon: FiDollarSign, dates: true },
  { type: 'credits', title: 'Consommation des crédits', text: 'Grand livre détaillé : rechargements, publications, renouvellements.', icon: FiBarChart2, dates: true },
  { type: 'vehicles', title: 'Rapport des véhicules', text: 'Inventaire, statuts, expirations, consultations et contacts.', icon: IoCarSportOutline, dates: false },
  { type: 'activity', title: 'Rapport d’activité', text: 'Opérations effectuées et journal des actions sensibles.', icon: FiActivity, dates: true },
  { type: 'companies', title: 'Rapport des entreprises', text: 'Synthèse de toutes les entreprises de la plateforme.', icon: FiBriefcase, dates: true, admin: true },
]

export default function Reports() {
  const { isSuperAdmin, user } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [busy, setBusy] = useState(null)
  const companies = useApi(isSuperAdmin ? '/companies/options' : null)

  const run = async (r, download) => {
    const p = new URLSearchParams()
    if (r.dates && from) p.set('from', from)
    if (r.dates && to) p.set('to', to)
    if (isSuperAdmin && companyId && r.type !== 'companies') p.set('companyId', companyId)
    setBusy(r.type + download)
    try {
      await openPdf(`/reports/${r.type}.pdf?${p}`, { download, filename: `Rapport-${r.type}-${new Date().toISOString().slice(0, 10)}.pdf` })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="Rapports PDF" subtitle={isSuperAdmin ? 'Rapports globaux ou par entreprise' : `Rapports de ${user.company?.name}`} />
      <Card pad>
        <div className="form-grid cols-3">
          <Field label="Du"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Au"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {isSuperAdmin && (
            <Field label="Entreprise" hint="Laisser vide pour un rapport global">
              <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Toute la plateforme" options={(companies.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
          )}
        </div>
      </Card>
      <div className="grid g-3 mt-3">
        {REPORTS.filter((r) => !r.admin || isSuperAdmin).map((r, i) => (
          <motion.div key={r.type} className="card card-pad" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="list-icon" style={{ width: 46, height: 46, fontSize: 20 }}><r.icon /></div>
            <h3 className="mt-2" style={{ fontSize: 16 }}>{r.title}</h3>
            <p className="muted small" style={{ minHeight: 40 }}>{r.text}</p>
            <div className="small muted mb-2">{r.dates ? 'Filtré par la période sélectionnée' : 'Situation actuelle'}</div>
            <div className="row">
              <Button icon={FiEye} loading={busy === r.type + false} onClick={() => run(r, false)}>Consulter / imprimer</Button>
              <Button variant="primary" icon={FiDownload} loading={busy === r.type + true} onClick={() => run(r, true)}>Télécharger</Button>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}
