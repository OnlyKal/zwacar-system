import { useSearchParams } from 'react-router-dom'
import { Card, PageHeader } from '../../components/ui'
import { TransactionsTable } from '../../components/finance'

export default function Transactions() {
  const [sp] = useSearchParams()
  return (
    <>
      <PageHeader title="Historique des crédits" subtitle="Grand livre de toutes les opérations : rechargements, publications, renouvellements, remboursements et ajustements" />
      <Card>
        <TransactionsTable initialCompany={sp.get('companyId') || ''} />
      </Card>
    </>
  )
}
