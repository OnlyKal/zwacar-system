/**
 * Modèles d'emails HTML (charte ZwaCar — couleur principale #947A26).
 * Chaque modèle renvoie { subject, html, text }.
 */
const config = require('../config');

const BRAND = '#947A26';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ platformName, title, intro, body = '', cta, footer }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f5f3ee;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f1d17">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
<tr><td style="background:#16140f;padding:28px 32px">
  <img src="cid:zwacar-logo" width="36" height="36" alt="ZwaCar" style="display:inline-block;width:36px;height:36px;border:0;vertical-align:middle">
  <span style="color:#fff;font-size:20px;font-weight:700;margin-left:10px;vertical-align:middle">${esc(platformName)}</span>
</td></tr>
<tr><td style="padding:36px 32px 12px">
  <h1 style="margin:0 0 14px;font-size:22px;color:#16140f">${esc(title)}</h1>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a463b">${intro}</p>
  ${body}
  ${cta ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>
  <p style="font-size:12px;color:#8a8577;word-break:break-all">Si le bouton ne fonctionne pas : ${esc(cta.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:22px 32px;background:#faf8f3;border-top:1px solid #eee8da;font-size:12px;color:#8a8577;line-height:1.6">
  ${footer || ''}${esc(platformName)} — plateforme de location de véhicules.<br>Cet email a été envoyé automatiquement, merci de ne pas y répondre directement.
</td></tr></table></td></tr></table></body></html>`;
}

const kv = (rows) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee8da;border-radius:12px;font-size:14px;margin:8px 0">${rows
    .map(
      ([k, v], i) =>
        `<tr style="background:${i % 2 ? '#fff' : '#faf8f3'}"><td style="padding:10px 14px;color:#8a8577">${esc(k)}</td><td style="padding:10px 14px;text-align:right;font-weight:600">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const vName = (v) => `${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''}`;
const walletUrl = () => `${config.webUrl}/company/wallet`;

const templates = {
  welcome: ({ user, company, setPasswordUrl, p }) => ({
    subject: `Bienvenue sur ${p}`,
    html: layout({
      platformName: p,
      title: `Bienvenue ${user.firstName} !`,
      intro: company
        ? `Votre espace entreprise <b>${esc(company.name)}</b> a été créé sur ${esc(p)}. Vous pouvez dès maintenant publier vos véhicules et gérer votre équipe.`
        : `Votre compte ${esc(p)} a été créé avec succès. Trouvez rapidement le véhicule qui correspond à vos besoins.`,
      body: kv([['Email de connexion', user.email]]),
      cta: setPasswordUrl ? { label: 'Définir mon mot de passe', url: setPasswordUrl } : { label: 'Accéder à mon espace', url: config.webUrl },
    }),
  }),

  accountConfirmation: ({ user, verifyUrl, p }) => ({
    subject: `Confirmez votre compte ${p}`,
    html: layout({
      platformName: p,
      title: 'Confirmation de création de compte',
      intro: `Bonjour ${esc(user.firstName)}, merci de confirmer votre adresse email pour activer toutes les fonctionnalités de votre compte.`,
      cta: { label: 'Confirmer mon email', url: verifyUrl },
    }),
  }),

  invite: ({ user, company, inviter, setPasswordUrl, roleLabel, p }) => ({
    subject: `${company.name} vous invite sur ${p}`,
    html: layout({
      platformName: p,
      title: 'Vous avez été ajouté(e) à une équipe',
      intro: `${esc(inviter || 'Un administrateur')} vous a ajouté(e) à l'entreprise <b>${esc(company.name)}</b> en tant que <b>${esc(roleLabel)}</b>. Définissez votre mot de passe pour accéder à votre espace.`,
      cta: { label: 'Activer mon compte', url: setPasswordUrl },
      footer: 'Ce lien est valable 7 jours.<br>',
    }),
  }),

  passwordReset: ({ user, resetUrl, p }) => ({
    subject: `Réinitialisation de votre mot de passe ${p}`,
    html: layout({
      platformName: p,
      title: 'Mot de passe oublié ?',
      intro: `Bonjour ${esc(user.firstName)}, nous avons reçu une demande de réinitialisation de votre mot de passe. Ce lien est valable 1 heure.`,
      cta: { label: 'Réinitialiser mon mot de passe', url: resetUrl },
      footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.<br>",
    }),
  }),

  passwordChanged: ({ user, p }) => ({
    subject: 'Votre mot de passe a été modifié',
    html: layout({
      platformName: p,
      title: 'Mot de passe modifié',
      intro: `Bonjour ${esc(user.firstName)}, le mot de passe de votre compte vient d'être modifié. Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.`,
    }),
  }),

  vehiclePublished: ({ vehicle, company, cost, balance, pending, p }) => ({
    subject: pending ? `Véhicule soumis à validation : ${vName(vehicle)}` : `Véhicule publié : ${vName(vehicle)}`,
    html: layout({
      platformName: p,
      title: pending ? 'Véhicule soumis à validation' : 'Votre véhicule est en ligne 🚗',
      intro: pending
        ? `Le véhicule <b>${esc(vName(vehicle))}</b> a été soumis et sera visible dès sa validation par notre équipe.`
        : `Le véhicule <b>${esc(vName(vehicle))}</b> est maintenant visible par tous les clients de ${esc(p)}.`,
      body: kv([
        ['Entreprise', company.name],
        ['Crédits débités', `${cost}`],
        ['Solde restant', `${balance} crédits`],
        ['Valide jusqu’au', fmtDate(vehicle.expiresAt)],
      ]),
      cta: { label: 'Voir mes véhicules', url: `${config.webUrl}/company/vehicles` },
    }),
  }),

  vehicleStatus: ({ vehicle, status, reason, p }) => ({
    subject: `Mise à jour de votre véhicule ${vName(vehicle)}`,
    html: layout({
      platformName: p,
      title: { approved: 'Véhicule validé ✅', rejected: 'Véhicule refusé', suspended: 'Véhicule suspendu', reactivated: 'Véhicule réactivé' }[status] || 'Mise à jour',
      intro: `Le statut du véhicule <b>${esc(vName(vehicle))}</b> a été mis à jour par l'administration de ${esc(p)}.${reason ? `<br><br>Motif : <i>${esc(reason)}</i>` : ''}${status === 'rejected' ? '<br><br>Les crédits de publication ont été remboursés sur votre wallet.' : ''}`,
      cta: { label: 'Voir le véhicule', url: `${config.webUrl}/company/vehicles/${vehicle.id}` },
    }),
  }),

  expiryReminder: ({ vehicle, days, balance, cost, autoRenew, p }) => ({
    subject: `Expiration dans ${days} jour(s) : ${vName(vehicle)}`,
    html: layout({
      platformName: p,
      title: 'Expiration prochaine',
      intro: `La publication du véhicule <b>${esc(vName(vehicle))}</b> expire le <b>${fmtDate(vehicle.expiresAt)}</b>.<br><br>${
        autoRenew
          ? balance >= cost
            ? `Le renouvellement automatique est activé et votre solde est suffisant : ${cost} crédits seront débités à l'échéance.`
            : `<b style="color:#b42318">Votre solde (${balance} crédits) est insuffisant</b> pour le renouvellement automatique (${cost} crédits). Rechargez votre wallet pour éviter la désactivation.`
          : 'Le renouvellement automatique est désactivé : le véhicule sera retiré des résultats à l’échéance.'
      }`,
      cta: { label: 'Gérer mon wallet', url: walletUrl() },
    }),
  }),

  vehicleRenewed: ({ vehicle, cost, balance, p }) => ({
    subject: `Renouvellement effectué : ${vName(vehicle)}`,
    html: layout({
      platformName: p,
      title: 'Renouvellement automatique effectué',
      intro: `La publication du véhicule <b>${esc(vName(vehicle))}</b> a été renouvelée automatiquement pour 12 mois.`,
      body: kv([
        ['Crédits débités', `${cost}`],
        ['Solde restant', `${balance} crédits`],
        ['Nouvelle échéance', fmtDate(vehicle.expiresAt)],
      ]),
      cta: { label: 'Voir mon historique', url: walletUrl() },
    }),
  }),

  vehicleExpired: ({ vehicle, balance, cost, reason, p }) => ({
    subject: `Véhicule désactivé : ${vName(vehicle)}`,
    html: layout({
      platformName: p,
      title: 'Véhicule désactivé',
      intro: `La période de validité du véhicule <b>${esc(vName(vehicle))}</b> est arrivée à échéance. Il n'apparaît plus dans les résultats de recherche.`,
      body:
        reason === 'insufficient'
          ? `<p style="background:#fef3f2;border:1px solid #fecdca;color:#b42318;border-radius:10px;padding:14px;font-size:14px"><b>Solde insuffisant</b> : ${balance} crédit(s) disponible(s), ${cost} requis pour le renouvellement. Rechargez votre wallet puis republiez le véhicule.</p>`
          : `<p style="font-size:14px;color:#4a463b">Le renouvellement automatique était désactivé. Vous pouvez republier le véhicule à tout moment depuis votre espace.</p>`,
      cta: { label: 'Recharger mon wallet', url: walletUrl() },
    }),
  }),

  lowBalance: ({ company, balance, cost, p }) => ({
    subject: 'Solde de crédits insuffisant',
    html: layout({
      platformName: p,
      title: 'Solde insuffisant',
      intro: `Le wallet de <b>${esc(company.name)}</b> dispose de <b>${balance} crédit(s)</b>, ce qui est inférieur au coût d'une publication (${cost} crédits).`,
      cta: { label: 'Recharger maintenant', url: walletUrl() },
    }),
  }),

  topupConfirmed: ({ company, payment, balance, p }) => ({
    subject: `Rechargement confirmé — ${payment.reference}`,
    html: layout({
      platformName: p,
      title: 'Rechargement confirmé 💳',
      intro: `Le rechargement du wallet de <b>${esc(company.name)}</b> a bien été pris en compte. Vous trouverez la facture et le reçu en pièces jointes.`,
      body: kv([
        ['Référence', payment.reference],
        ['Facture', payment.invoiceNumber],
        ['Montant payé', `${Number(payment.amount).toFixed(2)} ${payment.currency}`],
        ['Crédits ajoutés', `${payment.credits}`],
        ['Moyen de paiement', payment.methodName || '—'],
        ['Nouveau solde', `${balance} crédits`],
      ]),
      cta: { label: 'Voir mon wallet', url: walletUrl() },
    }),
  }),

  topupRequested: ({ company, payment, instructions, p }) => ({
    subject: `Demande de rechargement — ${payment.reference}`,
    html: layout({
      platformName: p,
      title: 'Demande de rechargement enregistrée',
      intro: `Votre demande de rechargement pour <b>${esc(company.name)}</b> est en attente de confirmation du paiement.`,
      body:
        kv([
          ['Référence', payment.reference],
          ['Montant', `${Number(payment.amount).toFixed(2)} ${payment.currency}`],
          ['Crédits', `${payment.credits}`],
          ['Moyen de paiement', payment.methodName || '—'],
        ]) + (instructions ? `<p style="font-size:14px;line-height:1.6;background:#faf8f3;border-radius:10px;padding:14px;white-space:pre-line">${esc(instructions)}</p>` : ''),
    }),
  }),

  adminNotification: ({ title, message, p }) => ({
    subject: `[${p}] ${title}`,
    html: layout({ platformName: p, title, intro: esc(message).replace(/\n/g, '<br>') }),
  }),

  smtpTest: ({ p }) => ({
    subject: `Test de configuration SMTP — ${p}`,
    html: layout({
      platformName: p,
      title: 'Configuration SMTP opérationnelle ✅',
      intro: `Cet email confirme que le service d'envoi d'emails de ${esc(p)} est correctement configuré.`,
    }),
  }),

  companyStatus: ({ company, status, reason, p }) => ({
    subject: status === 'suspended' ? 'Votre entreprise a été suspendue' : 'Votre entreprise a été réactivée',
    html: layout({
      platformName: p,
      title: status === 'suspended' ? 'Compte entreprise suspendu' : 'Compte entreprise réactivé',
      intro:
        status === 'suspended'
          ? `L'espace de <b>${esc(company.name)}</b> a été suspendu. Vos véhicules ne sont plus visibles.${reason ? `<br><br>Motif : <i>${esc(reason)}</i>` : ''}`
          : `L'espace de <b>${esc(company.name)}</b> est de nouveau actif.`,
    }),
  }),
};

module.exports = { templates };
