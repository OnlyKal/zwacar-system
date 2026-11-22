import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiPlus } from 'react-icons/fi'
import { Button, Card, PageHeader } from '../../components/ui'
import { PaymentsTable } from '../../components/finance'
import { AdminTopupModal } from '../company/Wallet'

export default function Payments() {
  const [sp] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)
  return (
    <>
      <PageHeader title="Paiements & rechargements" subtitle="Validez les paiements reçus, consultez factures et reçus">
        <Button variant="primary" icon={FiPlus} onClick={() => setOpen(true)}>Enregistrer un paiement</Button>
      </PageHeader>
      <Card>
        <PaymentsTable key={sp.toString()} initialCompany={sp.get('companyId') || ''} initialStatus={sp.get('status') || ''} refreshKey={key} />
      </Card>
      <AdminTopupModal open={open} onClose={() => setOpen(false)} onDone={() => setKey((k) => k + 1)} />
    </>
  )
}
