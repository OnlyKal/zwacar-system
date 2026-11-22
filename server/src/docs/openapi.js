/**
 * Documentation OpenAPI 3 de l'API REST (servie sur /api/docs).
 * Chaque entrée : [méthode, chemin, tag, résumé, sécurité?, corps?]
 */
const config = require('../config');

const E = [
  // Auth
  ['post', '/auth/login', 'Auth', 'Connexion (email + mot de passe) → accessToken + refreshToken', false, { email: 'admin@zwacar.com', password: 'Admin@12345', scope: 'backoffice' }],
  ['post', '/auth/register', 'Auth', 'Inscription client (application mobile)', false, { firstName: 'Jean', lastName: 'Kabila', email: 'jean@mail.com', phone: '+243...', password: 'Secret123' }],
  ['post', '/auth/refresh', 'Auth', 'Rotation du refresh token (cookie httpOnly ou body)', false, { refreshToken: '...' }],
  ['post', '/auth/logout', 'Auth', 'Déconnexion (révocation du refresh token)', false],
  ['post', '/auth/forgot-password', 'Auth', 'Envoi du lien de réinitialisation', false, { email: 'user@mail.com' }],
  ['post', '/auth/reset-password', 'Auth', 'Nouveau mot de passe (reset ou invitation)', false, { token: '...', password: 'NewPass123' }],
  ['get', '/auth/me', 'Auth', 'Profil courant + permissions'],
  ['patch', '/auth/me', 'Auth', 'Mise à jour du profil'],
  ['post', '/auth/change-password', 'Auth', 'Changement de mot de passe'],
  // Public
  ['get', '/public/config', 'Public', 'Catégories, caractéristiques, marques, villes, bornes de prix', false],
  ['get', '/public/vehicles', 'Public', 'Recherche : q, categoryId, brand, model, city, minPrice, maxPrice, priceType, seats, doors, transmission, fuelType, minYear, driver (with|without), availableOnly, featureIds, sort (recent|price_asc|price_desc|popular), page, limit', false],
  ['get', '/public/vehicles/{id}', 'Public', 'Détail d’un véhicule (+ véhicules similaires, comptage des vues)', false],
  ['get', '/public/vehicles/{id}/quote', 'Public', 'Estimation du coût : days (1-365), withDriver (true|false) → vehicleCost, driverCost, total', false],
  ['post', '/public/vehicles/{id}/contact', 'Public', 'Enregistre un contact (avec durée et option chauffeur facultatives) et renvoie le lien WhatsApp / tel: / mailto:', false, { channel: 'whatsapp', days: 3, withDriver: true }],
  ['get', '/public/companies/{id}', 'Public', 'Profil public d’une entreprise', false],
  ['get', '/public/favorites', 'Public', 'Favoris du client connecté'],
  ['post', '/public/favorites/{vehicleId}', 'Public', 'Ajouter aux favoris'],
  ['delete', '/public/favorites/{vehicleId}', 'Public', 'Retirer des favoris'],
  // Companies
  ['get', '/companies', 'Entreprises (admin)', 'Liste paginée (q, status, sort)'],
  ['post', '/companies', 'Entreprises (admin)', 'Créer une entreprise + son administrateur', true, { name: 'Auto Plus', email: 'contact@autoplus.cd', phone: '+243...', city: 'Kinshasa', initialCredits: 20, admin: { firstName: 'Paul', lastName: 'Mbala', email: 'paul@autoplus.cd' } }],
  ['get', '/companies/{id}', 'Entreprises (admin)', 'Détail + statistiques + utilisateurs'],
  ['patch', '/companies/{id}', 'Entreprises (admin)', 'Modifier'],
  ['post', '/companies/{id}/status', 'Entreprises (admin)', 'Suspendre / réactiver', true, { status: 'suspended', reason: '…' }],
  ['post', '/companies/{id}/wallet/adjust', 'Entreprises (admin)', 'Ajustement manuel du wallet', true, { amount: 20, reason: 'Geste commercial' }],
  ['post', '/companies/{id}/logo', 'Entreprises (admin)', 'Logo (multipart: logo)'],
  ['delete', '/companies/{id}', 'Entreprises (admin)', 'Supprimer (body: confirm = nom exact)'],
  ['get', '/company', 'Mon entreprise', 'Profil de mon entreprise'],
  ['patch', '/company', 'Mon entreprise', 'Modifier mon entreprise'],
  ['post', '/company/logo', 'Mon entreprise', 'Logo (multipart: logo)'],
  // Users
  ['get', '/users', 'Utilisateurs', 'Liste (scopée par entreprise) : q, role, status, type=clients|staff'],
  ['get', '/users/roles', 'Utilisateurs', 'Rôles attribuables'],
  ['post', '/users', 'Utilisateurs', 'Créer (sans mot de passe → invitation email)', true, { firstName: 'Ana', lastName: 'Lusamba', email: 'ana@autoplus.cd', role: 'manager' }],
  ['patch', '/users/{id}', 'Utilisateurs', 'Modifier (rôle, statut…)'],
  ['post', '/users/{id}/resend-invite', 'Utilisateurs', 'Renvoyer l’invitation'],
  ['post', '/users/{id}/send-reset', 'Utilisateurs', 'Envoyer un lien de réinitialisation'],
  ['delete', '/users/{id}', 'Utilisateurs', 'Supprimer'],
  // Vehicles
  ['get', '/vehicles', 'Véhicules', 'Liste (scopée) : q, status, availability, categoryId, expiringDays, sort'],
  ['post', '/vehicles', 'Véhicules', 'Créer un brouillon', true, { brand: 'Toyota', model: 'Prado', year: 2022, categoryId: 1, fuelType: 'diesel', transmission: 'automatic', seats: 7, doors: 5, priceDaily: 120 }],
  ['get', '/vehicles/{id}', 'Véhicules', 'Détail + complétude + historique'],
  ['patch', '/vehicles/{id}', 'Véhicules', 'Modifier'],
  ['delete', '/vehicles/{id}', 'Véhicules', 'Supprimer'],
  ['post', '/vehicles/{id}/media', 'Véhicules', 'Upload multipart : photos[] (≥4 requis pour publier) + video (≤ 20 Mo)'],
  ['delete', '/vehicles/{id}/media/{mediaId}', 'Véhicules', 'Supprimer un média'],
  ['put', '/vehicles/{id}/media/order', 'Véhicules', 'Réordonner les photos', true, { ids: [3, 1, 2, 4] }],
  ['post', '/vehicles/{id}/publish', 'Véhicules', 'Publier (débit de 12 crédits, validité 12 mois)'],
  ['patch', '/vehicles/{id}/auto-renew', 'Véhicules', 'Activer/désactiver le renouvellement automatique', true, { autoRenew: false }],
  ['patch', '/vehicles/{id}/availability', 'Véhicules', 'Disponibilité', true, { availability: 'rented' }],
  ['post', '/vehicles/{id}/moderate', 'Véhicules', 'Modération super admin : approve|reject|suspend|reactivate', true, { action: 'suspend', reason: '…' }],
  // Wallet
  ['get', '/wallet/summary', 'Wallet', 'Solde et synthèse'],
  ['get', '/wallet/transactions', 'Wallet', 'Grand livre des crédits : type, direction, from, to'],
  ['get', '/wallet/transactions/{id}/receipt.pdf', 'Wallet', 'Reçu PDF d’une opération'],
  ['get', '/payments', 'Paiements', 'Liste des rechargements'],
  ['get', '/payments/quote', 'Paiements', 'Devis : packs → montant / crédits'],
  ['post', '/payments/topup', 'Paiements', 'Demande de rechargement', true, { packs: 2, paymentMethodId: 1 }],
  ['get', '/payments/{id}/invoice.pdf', 'Paiements', 'Facture PDF'],
  ['get', '/payments/{id}/receipt.pdf', 'Paiements', 'Reçu PDF'],
  ['post', '/payments/{id}/confirm', 'Paiements', 'Confirmer (super admin) → crédite le wallet'],
  ['get', '/notifications', 'Notifications', 'Notifications de l’utilisateur connecté (+ nombre de non lues)'],
  ['post', '/notifications/{id}/read', 'Notifications', 'Marquer une notification comme lue'],
  ['post', '/notifications/read-all', 'Notifications', 'Tout marquer comme lu'],
  ['post', '/payments/{id}/refresh', 'Paiements', 'Vérifier un paiement en ligne auprès de FlexPay (crédit unique si confirmé)'],
  ['post', '/payments/{id}/reject', 'Paiements', 'Rejeter (super admin)'],
  ['post', '/payments/{id}/cancel', 'Paiements', 'Annuler une demande en attente'],
  ['post', '/payments/webhook/{provider}', 'Paiements', 'Callback fournisseur (flexpay) — le statut est toujours revérifié auprès du fournisseur', false],
  ['get', '/payment-methods', 'Paiements', 'Moyens de paiement actifs (?all=1 admin)'],
  ['post', '/payment-methods', 'Paiements', 'Créer (super admin)'],
  ['patch', '/payment-methods/{id}', 'Paiements', 'Modifier'],
  ['delete', '/payment-methods/{id}', 'Paiements', 'Supprimer'],
  // Platform
  ['get', '/catalog/categories', 'Catalogue', 'Catégories'],
  ['post', '/catalog/categories', 'Catalogue', 'Créer une catégorie'],
  ['get', '/catalog/features', 'Catalogue', 'Caractéristiques'],
  ['post', '/catalog/features', 'Catalogue', 'Créer une caractéristique'],
  ['get', '/contacts', 'Contacts', 'Contacts clients générés (scopés)'],
  ['patch', '/contacts/{id}', 'Contacts', 'Statut du contact (new|in_progress|closed)'],
  ['get', '/settings', 'Paramètres', 'Paramètres (le mot de passe SMTP n’est jamais renvoyé)'],
  ['put', '/settings/general', 'Paramètres', 'Paramètres généraux'],
  ['put', '/settings/billing', 'Paramètres', 'Tarifs et règles de facturation'],
  ['put', '/settings/smtp', 'Paramètres', 'Configuration Gmail SMTP (chiffrée)'],
  ['post', '/settings/smtp/test', 'Paramètres', 'Tester la configuration SMTP', true, { to: 'moi@gmail.com' }],
  ['get', '/settings/flexpay', 'Paramètres', 'Configuration FlexPay (jeton jamais renvoyé) + URL de callback'],
  ['put', '/settings/flexpay', 'Paramètres', 'Configuration FlexPay (chiffrée)', true, { enabled: true, merchant: 'ZWACAR', token: '…' }],
  ['post', '/settings/flexpay/test', 'Paramètres', 'Tester la connexion FlexPay'],
  ['post', '/settings/notify', 'Paramètres', 'Notification administrative par email'],
  ['get', '/stats/admin', 'Statistiques', 'Tableau de bord super admin'],
  ['get', '/stats/company', 'Statistiques', 'Tableau de bord entreprise'],
  ['get', '/reports/{type}.pdf', 'Rapports', 'Rapports PDF : financial|credits|vehicles|companies|activity|statistics (from, to, companyId, download=1)'],
  ['get', '/audit/logs', 'Journaux', 'Journal d’activité'],
  ['get', '/audit/emails', 'Journaux', 'Journal des emails'],
  ['get', '/backups', 'Sauvegardes', 'Liste des sauvegardes'],
  ['post', '/backups', 'Sauvegardes', 'Créer une sauvegarde'],
  ['get', '/backups/{file}/download', 'Sauvegardes', 'Télécharger'],
  ['post', '/backups/{file}/restore', 'Sauvegardes', 'Restaurer (confirm: RESTAURER)'],
  ['get', '/jobs', 'Tâches', 'État du planificateur'],
  ['post', '/jobs/expirations/run', 'Tâches', 'Lancer le traitement des expirations'],
];

function build() {
  const paths = {};
  for (const [method, p, tag, summary, secured = true, example] of E) {
    const params = [...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    paths[p] = paths[p] || {};
    paths[p][method] = {
      tags: [tag],
      summary,
      parameters: params,
      ...(secured ? { security: [{ bearer: [] }] } : {}),
      ...(example ? { requestBody: { content: { 'application/json': { schema: { type: 'object' }, example } } } } : {}),
      responses: { 200: { description: 'Succès' }, 400: { description: 'Données invalides' }, 401: { description: 'Non authentifié' }, 403: { description: 'Accès refusé' }, 404: { description: 'Introuvable' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: `${config.appName} API`,
      version: '1.0.0',
      description:
        'API REST de la plateforme de location de véhicules.\n\nAuthentification : `Authorization: Bearer <accessToken>`.\n\nErreurs : `{ error: { code, message, details? } }`.\n\nPagination : `?page=1&limit=20` → `{ data, meta: { page, limit, total, pages } }`.',
    },
    servers: [{ url: `${config.apiUrl}/api` }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}

module.exports = build;
