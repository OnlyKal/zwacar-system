/** Formatage et libellés partagés. */

export const fmtNumber = (n) => new Intl.NumberFormat('fr-FR').format(Number(n || 0))
export const fmtMoney = (n, cur = 'USD') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(Number(n || 0))
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtMonth = (m) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
}
export const fmtBytes = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.round(b / 1024)} Ko`)
export const daysUntil = (d) => (d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null)
export const initials = (u) => `${u?.firstName?.[0] || ''}${u?.lastName?.[0] || ''}`.toUpperCase() || '?'
export const relative = (d) => {
  const s = Math.round((Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'à l’instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`
  return fmtDate(d)
}

export const VEHICLE_STATUS = {
  draft: { label: 'Brouillon', tone: '' },
  pending: { label: 'En validation', tone: 'amber' },
  active: { label: 'Publié', tone: 'green' },
  expired: { label: 'Expiré', tone: 'red' },
  suspended: { label: 'Suspendu', tone: 'violet' },
  rejected: { label: 'Refusé', tone: 'red' },
}
export const AVAILABILITY = {
  available: { label: 'Disponible', tone: 'green' },
  rented: { label: 'En location', tone: 'blue' },
  maintenance: { label: 'En maintenance', tone: 'amber' },
}
export const FUEL = { petrol: 'Essence', diesel: 'Diesel', hybrid: 'Hybride', electric: 'Électrique', lpg: 'GPL', other: 'Autre' }
export const TRANSMISSION = { manual: 'Manuelle', automatic: 'Automatique' }
export const PAYMENT_STATUS = {
  pending: { label: 'En attente', tone: 'amber' },
  completed: { label: 'Payé', tone: 'green' },
  failed: { label: 'Rejeté', tone: 'red' },
  cancelled: { label: 'Annulé', tone: '' },
}
export const TX_TYPES = {
  topup: { label: 'Rechargement', tone: 'green' },
  publish: { label: 'Publication', tone: 'gold' },
  renewal: { label: 'Renouvellement', tone: 'blue' },
  refund: { label: 'Remboursement', tone: 'violet' },
  adjustment: { label: 'Ajustement', tone: '' },
}
export const CONTACT_CHANNEL = { whatsapp: 'WhatsApp', phone: 'Appel', email: 'Email' }
export const CONTACT_STATUS = {
  new: { label: 'Nouveau', tone: 'blue' },
  in_progress: { label: 'En cours', tone: 'amber' },
  closed: { label: 'Traité', tone: 'green' },
}
export const USER_STATUS = {
  active: { label: 'Actif', tone: 'green' },
  pending: { label: 'Invitation envoyée', tone: 'amber' },
  suspended: { label: 'Suspendu', tone: 'red' },
}
export const EVENT_LABELS = {
  published: 'Publication',
  approved: 'Validé par l’administration',
  rejected: 'Refusé',
  renewed: 'Renouvellement automatique',
  renewal_failed: 'Échec du renouvellement',
  expired: 'Expiration',
  reminder: 'Rappel d’expiration envoyé',
  suspended: 'Suspendu',
  reactivated: 'Réactivé',
}
export const DRIVER_MODES = {
  none: { label: 'Sans chauffeur', short: 'Sans chauffeur', help: 'Le client conduit lui-même.' },
  optional: { label: 'Chauffeur en option', short: 'Chauffeur en option', help: 'Le client choisit ; un supplément s’ajoute au tarif.' },
  included: { label: 'Chauffeur inclus', short: 'Avec chauffeur', help: 'Toujours avec chauffeur, compris dans le tarif.' },
}

export const COMPANY_STATUS = {
  pending: { label: 'En attente de validation', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  suspended: { label: 'Suspendue', tone: 'red' },
  rejected: { label: 'Inscription refusée', tone: '' },
}
