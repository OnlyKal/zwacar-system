/* eslint-disable react-refresh/only-export-components */
import { Field, Input, Textarea, Toggle } from './ui'

export const COMPANY_EMPTY = { name: '', email: '', phone: '', whatsapp: '', website: '', address: '', city: '', country: 'RD Congo', taxId: '', description: '', autoRenewDefault: true }

/** Champs du profil entreprise (création admin, édition admin et espace entreprise). */
export default function CompanyFields({ form, setForm, errors = {}, disabled }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))
  return (
    <div className="form-grid">
      <Field label="Nom de l’entreprise" required error={errors.name} className="full">
        <Input value={form.name} onChange={set('name')} disabled={disabled} invalid={errors.name} />
      </Field>
      <Field label="Email de contact" required error={errors.email}>
        <Input type="email" value={form.email} onChange={set('email')} disabled={disabled} invalid={errors.email} />
      </Field>
      <Field label="Téléphone" error={errors.phone} hint="Utilisé pour les appels des clients">
        <Input value={form.phone || ''} onChange={set('phone')} disabled={disabled} placeholder="+243…" />
      </Field>
      <Field label="WhatsApp" error={errors.whatsapp} hint="Format international, ex. +243810000000">
        <Input value={form.whatsapp || ''} onChange={set('whatsapp')} disabled={disabled} placeholder="+243…" />
      </Field>
      <Field label="Site web" error={errors.website}>
        <Input value={form.website || ''} onChange={set('website')} disabled={disabled} placeholder="https://" />
      </Field>
      <Field label="Adresse" error={errors.address}>
        <Input value={form.address || ''} onChange={set('address')} disabled={disabled} />
      </Field>
      <Field label="Ville" error={errors.city}>
        <Input value={form.city || ''} onChange={set('city')} disabled={disabled} />
      </Field>
      <Field label="Pays" error={errors.country}>
        <Input value={form.country || ''} onChange={set('country')} disabled={disabled} />
      </Field>
      <Field label="N° RCCM / identifiant fiscal" error={errors.taxId}>
        <Input value={form.taxId || ''} onChange={set('taxId')} disabled={disabled} />
      </Field>
      <Field label="Description" className="full" error={errors.description}>
        <Textarea value={form.description || ''} onChange={set('description')} disabled={disabled} style={{ minHeight: 90 }} />
      </Field>
      <div className="full">
        <Toggle checked={form.autoRenewDefault} onChange={set('autoRenewDefault')} disabled={disabled} label="Renouvellement automatique activé par défaut pour les nouveaux véhicules" />
      </div>
    </div>
  )
}

/** Nettoie le formulaire avant envoi (supprime les champs non modifiables). */
export const companyPayload = (f) => {
  const out = {}
  for (const k of Object.keys(COMPANY_EMPTY)) out[k] = f[k] ?? (k === 'autoRenewDefault' ? true : '')
  return out
}
