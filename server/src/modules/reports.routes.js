/**
 * /api/reports/:type.pdf — rapports PDF professionnels.
 *
 * Types : financial | credits | vehicles | companies | activity | statistics
 * Paramètres : from, to (AAAA-MM-JJ), companyId (super admin), download=1
 *
 * Isolation : un membre d'entreprise ne génère que les rapports de SON entreprise ;
 * les rapports « companies » et « activity » globaux sont réservés au super admin.
 */
const router = require('express').Router();
const { Op } = require('sequelize');
const { Company, Payment, CreditTransaction, Vehicle, Category, AuditLog, User, ContactEvent } = require('../models');
const { authenticate, backOffice, requirePermission, scopeCompanyId, isSuperAdmin } = require('../middleware/auth');
const pdf = require('../services/pdf.service');
const stats = require('../services/stats.service');
const audit = require('../services/audit.service');
const { dateRange } = require('./wallet.routes');
const { AppError, ah, makeReference } = require('../utils/helpers');
const settings = require('../services/settings.service');
const { PERMISSIONS: P, ROLE_LABELS, ROLES } = require('../utils/constants');

const { fmtDate, money, int, TX_LABELS, C } = pdf;
const STATUS_FR = { draft: 'Brouillon', pending: 'En attente', active: 'Actif', expired: 'Expiré', suspended: 'Suspendu', rejected: 'Refusé', completed: 'Payé', failed: 'Échoué', cancelled: 'Annulé' };
const ACTION_GROUP_FR = { auth: 'Connexions', payment: 'Paiements', vehicle: 'Véhicules', report: 'Rapports', company: 'Entreprise', user: 'Utilisateurs', wallet: 'Wallet', settings: 'Paramètres', backup: 'Sauvegardes', payment_method: 'Moyens de paiement', contact: 'Contacts', catalog: 'Catalogue' };
const ACTION_FR = {
  'auth.login': 'Connexion', 'auth.login_failed': 'Échec de connexion', 'auth.logout': 'Déconnexion', 'auth.register': 'Inscription', 'auth.password_reset': 'Mot de passe réinitialisé', 'auth.password_change': 'Mot de passe modifié',
  'payment.create': 'Demande de rechargement', 'payment.complete': 'Rechargement confirmé', 'payment.failed': 'Paiement refusé', 'payment.cancelled': 'Demande annulée', 'payment.initiate_failed': 'Envoi du paiement échoué', 'payment.anomaly': 'Anomalie de paiement',
  'vehicle.create': 'Véhicule créé', 'vehicle.update': 'Véhicule modifié', 'vehicle.delete': 'Véhicule supprimé', 'vehicle.publish': 'Publication', 'vehicle.approve': 'Véhicule validé', 'vehicle.reject': 'Véhicule refusé', 'vehicle.suspend': 'Véhicule suspendu',
  'report.generate': 'Rapport généré', 'wallet.adjust': 'Ajustement du wallet', 'company.register': 'Inscription de l’entreprise', 'company.approve': 'Entreprise validée', 'company.reject': 'Inscription refusée', 'company.suspend': 'Entreprise suspendue', 'company.activate': 'Entreprise réactivée', 'company.update': 'Profil modifié',
  'user.create': 'Collaborateur ajouté', 'user.update': 'Collaborateur modifié', 'user.delete': 'Collaborateur supprimé',
};
const actionFr = (a) => ACTION_FR[a] || a;
const COMPANY_STATUS_FR = { pending: 'En attente', active: 'Active', suspended: 'Suspendue', rejected: 'Refusée' };
const MAX_ROWS = 5000;

router.use(authenticate, backOffice, requirePermission(P.REPORTS_VIEW));

/**
 * En-tête de périmètre, présent sur chaque rapport : on ne peut pas confondre un rapport
 * d'entreprise avec un rapport global de la plateforme.
 */
function scope(b, company, right) {
  if (company) return b.party('Entreprise', company, right);
  b.paragraph(`Périmètre : toute la plateforme ${b.meta.general.platformName} — toutes les entreprises.`, { bold: true, color: C.dark, size: 9.5 });
}

function periodLabel(q) {
  if (!q.from && !q.to) return 'Depuis le début';
  return `${q.from ? fmtDate(q.from) : '…'} au ${q.to ? fmtDate(q.to) : fmtDate(new Date())}`;
}

const builders = {
  /* ---------------- Rapport financier ---------------- */
  async financial(q, companyId, company) {
    const where = { ...dateRange(q), ...(companyId ? { companyId } : {}) };
    const rows = await Payment.findAll({ where, include: [{ model: Company, as: 'company', attributes: ['name'] }], order: [['createdAt', 'DESC']], limit: MAX_ROWS });
    const done = rows.filter((r) => r.status === 'completed');
    const total = done.reduce((s, r) => s + Number(r.amount), 0);
    const credits = done.reduce((s, r) => s + r.credits, 0);
    const discounts = done.reduce((s, r) => s + Math.max(0, Number(r.grossAmount || r.amount) - Number(r.amount)), 0);
    // Point de vue : l'entreprise PAIE et ACHÈTE ; la plateforme ENCAISSE et VEND.
    const L = company
      ? { title: 'Rapport financier — achats de crédits', amount: 'Montant payé', credits: 'Crédits achetés', discount: 'Remises obtenues' }
      : { title: 'Rapport financier de la plateforme', amount: 'Montant encaissé', credits: 'Crédits vendus', discount: 'Remises accordées' };
    const b = await pdf.createDocument({ title: L.title, kicker: 'RAPPORT', period: periodLabel(q), reference: makeReference('RPT') });
    scope(b, company);
    b.stats([
      { label: L.amount, value: money(total) },
      { label: L.credits, value: int(credits) },
      { label: L.discount, value: money(discounts), color: C.green },
      { label: 'En attente', value: int(rows.filter((r) => r.status === 'pending').length), color: C.amber },
    ]);
    // Répartition par moyen de paiement
    const byMethod = {};
    done.forEach((r) => {
      const k = r.methodName || '—';
      byMethod[k] = byMethod[k] || { n: 0, amount: 0, credits: 0 };
      byMethod[k].n++;
      byMethod[k].amount += Number(r.amount);
      byMethod[k].credits += r.credits;
    });
    b.section('Répartition par moyen de paiement');
    b.table(
      [{ label: 'Moyen de paiement', width: 3 }, { label: 'Opérations', width: 1, align: 'right' }, { label: 'Crédits', width: 1, align: 'right' }, { label: 'Montant', width: 1.5, align: 'right' }],
      Object.entries(byMethod).map(([k, v]) => [k, int(v.n), int(v.credits), money(v.amount)]),
      { totals: ['Total', int(done.length), int(credits), money(total)] }
    );
    b.section('Détail des paiements');
    b.table(
      [
        { label: 'Date', width: 1.2 },
        { label: 'Référence', width: 2 },
        ...(companyId ? [] : [{ label: 'Entreprise', width: 2 }]),
        { label: 'Moyen', width: 1.5 },
        { label: 'Statut', width: 1 },
        { label: 'Crédits', width: 0.9, align: 'right' },
        { label: 'Remise', width: 0.8, align: 'right' },
        { label: 'Montant', width: 1.3, align: 'right' },
      ],
      rows.map((r) => [fmtDate(r.createdAt), r.reference, ...(companyId ? [] : [r.company?.name]), r.methodName, STATUS_FR[r.status], int(r.credits), Number(r.discountPercent) > 0 ? `${Number(r.discountPercent)} %` : '—', money(r.amount, r.currency)])
    );
    return b;
  },

  /* ---------------- Consommation des crédits ---------------- */
  async credits(q, companyId, company) {
    const where = { ...dateRange(q), ...(companyId ? { companyId } : {}) };
    const rows = await CreditTransaction.findAll({
      where,
      include: [{ model: Company, as: 'company', attributes: ['name'] }, { model: Vehicle, as: 'vehicle', attributes: ['brand', 'model'] }],
      order: [['createdAt', 'DESC']],
      limit: MAX_ROWS,
    });
    const sumType = (t) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
    const b = await pdf.createDocument({ title: company ? 'Consommation des crédits' : 'Mouvements de crédits de la plateforme', kicker: 'RAPPORT', period: periodLabel(q), reference: makeReference('RPT') });
    scope(b, company, company && { label: 'Wallet', rows: [['Solde actuel', `${int(company.walletBalance)} crédits`]] });
    b.stats([
      { label: 'Crédits rechargés', value: int(sumType('topup')), color: C.green },
      { label: 'Publications', value: int(Math.abs(sumType('publish'))), color: C.gold },
      { label: 'Renouvellements', value: int(Math.abs(sumType('renewal'))), color: C.gold },
      { label: 'Remb. / Ajust.', value: int(sumType('refund') + sumType('adjustment')) },
    ]);
    b.section('Synthèse par type d’opération');
    b.table(
      [{ label: 'Type', width: 3 }, { label: 'Opérations', width: 1, align: 'right' }, { label: 'Crédits', width: 1.2, align: 'right' }],
      Object.keys(TX_LABELS).map((t) => [TX_LABELS[t], int(rows.filter((r) => r.type === t).length), int(sumType(t))])
    );
    b.section('Historique détaillé');
    b.table(
      [
        { label: 'Date', width: 1.3 },
        { label: 'Référence', width: 1.9 },
        ...(companyId ? [] : [{ label: 'Entreprise', width: 1.7 }]),
        { label: 'Description', width: 3.2 },
        { label: 'Mouvement', width: 1, align: 'right' },
        { label: 'Solde', width: 0.9, align: 'right' },
      ],
      rows.map((r) => [fmtDate(r.createdAt, true), r.reference, ...(companyId ? [] : [r.company?.name]), r.description || TX_LABELS[r.type], `${r.amount > 0 ? '+' : ''}${int(r.amount)}`, int(r.balanceAfter)])
    );
    return b;
  },

  /* ---------------- Véhicules ---------------- */
  async vehicles(q, companyId, company) {
    const where = { ...(companyId ? { companyId } : {}) };
    if (q.status) where.status = q.status;
    const rows = await Vehicle.findAll({ where, include: [{ model: Category, as: 'category', attributes: ['name'] }, { model: Company, as: 'company', attributes: ['name'] }], order: [['brand', 'ASC'], ['model', 'ASC']], limit: MAX_ROWS });
    const count = (s) => rows.filter((r) => r.status === s).length;
    const b = await pdf.createDocument({ title: company ? 'Rapport des véhicules' : 'Véhicules de la plateforme', kicker: 'RAPPORT', reference: makeReference('RPT'), landscape: true });
    scope(b, company);
    b.stats([
      { label: 'Total véhicules', value: int(rows.length) },
      { label: 'Actifs', value: int(count('active')), color: C.green },
      { label: 'Expirés', value: int(count('expired')), color: C.red },
      { label: 'Vues cumulées', value: int(rows.reduce((s, r) => s + r.viewsCount, 0)) },
    ]);
    b.section('Inventaire');
    b.table(
      [
        { label: 'Véhicule', width: 2.2 },
        { label: 'Année', width: 0.7 },
        { label: 'Catégorie', width: 1.3 },
        ...(companyId ? [] : [{ label: 'Entreprise', width: 1.7 }]),
        { label: 'Immat.', width: 1.1 },
        { label: 'Ville', width: 1.1 },
        { label: 'Prix/jour', width: 1.1, align: 'right' },
        { label: 'Statut', width: 1 },
        { label: 'Expiration', width: 1.1 },
        { label: 'Vues', width: 0.7, align: 'right' },
        { label: 'Contacts', width: 0.9, align: 'right' },
      ],
      rows.map((r) => [
        `${r.brand} ${r.model}`,
        r.year,
        r.category?.name,
        ...(companyId ? [] : [r.company?.name]),
        r.plateNumber,
        r.city,
        r.priceDaily ? money(r.priceDaily, r.currency) : '—',
        STATUS_FR[r.status],
        fmtDate(r.expiresAt),
        int(r.viewsCount),
        int(r.contactsCount),
      ])
    );
    return b;
  },

  /* ---------------- Entreprises (super admin) ---------------- */
  async companies(q) {
    const rows = await Company.findAll({ order: [['name', 'ASC']], limit: MAX_ROWS });
    const ids = rows.map((r) => r.id);
    const grp = async (M, where, field = 'companyId') => Object.fromEntries((await M.count({ where: { companyId: ids, ...where }, group: [field] })).map((x) => [x.companyId, Number(x.count)]));
    const [veh, act, usr, cts] = await Promise.all([grp(Vehicle, {}), grp(Vehicle, { status: 'active' }), grp(User, {}), grp(ContactEvent, dateRange(q))]);
    const rev = Object.fromEntries(
      (await Payment.findAll({ attributes: ['companyId', [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'total']], where: { status: 'completed', ...dateRange(q) }, group: ['companyId'], raw: true })).map((r) => [r.companyId, Number(r.total)])
    );
    const b = await pdf.createDocument({ title: 'Rapport des entreprises', kicker: 'RAPPORT', period: periodLabel(q), reference: makeReference('RPT'), landscape: true });
    scope(b, null);
    b.stats([
      { label: 'Entreprises', value: int(rows.length) },
      { label: 'Actives', value: int(rows.filter((r) => r.status === 'active').length), color: C.green },
      { label: 'En attente', value: int(rows.filter((r) => r.status === 'pending').length), color: C.amber },
      { label: 'Suspendues / refusées', value: int(rows.filter((r) => r.status === 'suspended' || r.status === 'rejected').length), color: C.red },
    ]);
    b.table(
      [
        { label: 'Entreprise', width: 2.2 },
        { label: 'Contact', width: 2.2 },
        { label: 'Ville', width: 1.1 },
        { label: 'Statut', width: 0.9 },
        { label: 'Utilisateurs', width: 0.9, align: 'right' },
        { label: 'Véhicules', width: 0.9, align: 'right' },
        { label: 'Actifs', width: 0.8, align: 'right' },
        { label: 'Contacts', width: 0.9, align: 'right' },
        { label: 'Solde', width: 0.9, align: 'right' },
        { label: 'Revenus', width: 1.2, align: 'right' },
        { label: 'Inscription', width: 1.1 },
      ],
      rows.map((r) => [r.name, `${r.email}\n${r.phone || ''}`, r.city, COMPANY_STATUS_FR[r.status] || r.status, int(usr[r.id]), int(veh[r.id]), int(act[r.id]), int(cts[r.id]), int(r.walletBalance), money(rev[r.id] || 0), fmtDate(r.createdAt)])
    );
    return b;
  },

  /* ---------------- Activité ---------------- */
  async activity(q, companyId, company) {
    const where = { ...dateRange(q), ...(companyId ? { companyId } : {}) };
    let rows = await AuditLog.findAll({ where, include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'role'] }, { model: Company, as: 'company', attributes: ['name'] }], order: [['createdAt', 'DESC']], limit: 2000 });
    const b = await pdf.createDocument({ title: company ? 'Rapport d’activité' : 'Activité de la plateforme', kicker: 'RAPPORT', period: periodLabel(q), reference: makeReference('RPT'), landscape: true });
    // Rapport d'une entreprise : les actions du Super Administrateur sont anonymisées (ni identité ni IP).
    if (company && q._viewer !== 'super_admin') rows = audit.maskForCompany(rows, b.meta.general.platformName);
    scope(b, company);
    const byAction = {};
    rows.forEach((r) => (byAction[r.action.split('.')[0]] = (byAction[r.action.split('.')[0]] || 0) + 1));
    b.stats(Object.entries(byAction).sort((a, b2) => b2[1] - a[1]).slice(0, 4).map(([k, v]) => ({ label: ACTION_GROUP_FR[k] || k, value: int(v) })).concat(rows.length ? [] : [{ label: 'Opérations', value: '0' }]));
    b.table(
      [
        { label: 'Date', width: 1.3 },
        { label: 'Utilisateur', width: 1.8 },
        ...(companyId ? [] : [{ label: 'Entreprise', width: 1.6 }]),
        { label: 'Action', width: 1.6 },
        { label: 'Description', width: 4 },
        { label: 'IP', width: 1.1 },
      ],
      rows.map((r) => [fmtDate(r.createdAt, true), r.user ? `${r.user.firstName} ${r.user.lastName}\n${ROLE_LABELS[r.user.role] || ''}` : 'Système', ...(companyId ? [] : [r.company?.name || '—']), actionFr(r.action), r.description, r.ip || '—'])
    );
    if (rows.length === 2000) b.paragraph('Rapport limité aux 2 000 opérations les plus récentes : affinez la période pour un historique complet.', { color: C.muted, size: 8 });
    return b;
  },

  /* ---------------- Statistiques ---------------- */
  async statistics(q, companyId, company) {
    const b = await pdf.createDocument({ title: company ? 'Rapport statistique' : 'Statistiques de la plateforme', kicker: 'RAPPORT', reference: makeReference('RPT'), period: '12 derniers mois' });
    scope(b, company);
    if (companyId) {
      const d = await stats.companyDashboard(companyId);
      b.stats([
        { label: 'Véhicules', value: int(d.totals.vehicles) },
        { label: 'Actifs', value: int(d.totals.activeVehicles), color: C.green },
        { label: 'Expirés', value: int(d.totals.expiredVehicles), color: C.red },
        { label: 'Solde wallet', value: `${int(d.totals.walletBalance)} cr.` },
        { label: 'Consultations', value: int(d.totals.views) },
        { label: 'Contacts générés', value: int(d.totals.contacts) },
        { label: 'Crédits dépensés', value: int(d.totals.creditsSpent) },
        { label: 'Montant payé', value: money(d.totals.amountPaid) },
      ]);
      b.section('Évolution mensuelle');
      b.table([{ label: 'Mois', width: 1 }, { label: 'Crédits dépensés', width: 1, align: 'right' }, { label: 'Consultations', width: 1, align: 'right' }, { label: 'Contacts', width: 1, align: 'right' }], d.series.map((s) => [s.month, int(s.spent), int(s.views), int(s.contacts)]));
      b.section('Contacts par canal');
      b.table([{ label: 'Canal', width: 2 }, { label: 'Contacts', width: 1, align: 'right' }], d.channels.map((c) => [{ whatsapp: 'WhatsApp', phone: 'Appel téléphonique', email: 'Email' }[c.channel], int(c.value)]));
      b.section('Véhicules les plus consultés');
      b.table([{ label: 'Véhicule', width: 3 }, { label: 'Statut', width: 1 }, { label: 'Vues', width: 1, align: 'right' }, { label: 'Contacts', width: 1, align: 'right' }], d.topVehicles.map((v) => [`${v.brand} ${v.model} ${v.year || ''}`, STATUS_FR[v.status], int(v.viewsCount), int(v.contactsCount)]));
      return b;
    }
    const d = await stats.adminDashboard();
    const t = d.totals;
    b.stats([
      { label: 'Entreprises', value: int(t.companies) },
      { label: 'Clients', value: int(t.clients) },
      { label: 'Véhicules', value: int(t.vehicles) },
      { label: 'Véhicules actifs', value: int(t.activeVehicles), color: C.green },
      { label: 'Revenus', value: money(t.revenue) },
      { label: 'Crédits vendus', value: int(t.creditsSold) },
      { label: 'Crédits consommés', value: int(t.creditsConsumed) },
      { label: 'Contacts générés', value: int(t.contacts) },
    ]);
    b.section('Évolution mensuelle');
    b.table(
      [{ label: 'Mois', width: 1 }, { label: 'Entreprises', width: 1, align: 'right' }, { label: 'Clients', width: 1, align: 'right' }, { label: 'Publications', width: 1, align: 'right' }, { label: 'Renouv.', width: 1, align: 'right' }, { label: 'Crédits vendus', width: 1.1, align: 'right' }, { label: 'Revenus', width: 1.2, align: 'right' }],
      d.series.map((s) => [s.month, int(s.companies), int(s.clients), int(s.publications), int(s.renewals), int(s.creditsSold), money(s.revenue)])
    );
    b.section('Entreprises les plus actives');
    b.table([{ label: 'Entreprise', width: 2.5 }, { label: 'Crédits consommés', width: 1.2, align: 'right' }, { label: 'Véhicules', width: 1, align: 'right' }, { label: 'Contacts', width: 1, align: 'right' }], d.topCompanies.map((c) => [c.name, int(c.creditsSpent), int(c.vehicles), int(c.contacts)]));
    b.section('Véhicules par catégorie');
    b.table([{ label: 'Catégorie', width: 3 }, { label: 'Véhicules', width: 1, align: 'right' }], d.byCategory.map((c) => [c.name, int(c.value)]));
    return b;
  },
};

router.get(
  '/:type.pdf',
  ah(async (req, res) => {
    const type = req.params.type;
    const build = builders[type];
    if (!build) throw AppError.notFound('Type de rapport inconnu');
    if (['companies'].includes(type) && !isSuperAdmin(req.user)) throw AppError.forbidden();
    // Le rapport d'activité reprend le journal : Super Administrateur et administrateur d'entreprise uniquement.
    if (type === 'activity' && !isSuperAdmin(req.user) && req.user.role !== ROLES.COMPANY_ADMIN) throw AppError.forbidden('Rapport réservé à l’administrateur de l’entreprise');
    const companyId = type === 'companies' ? null : scopeCompanyId(req, req.query.companyId);
    const company = companyId ? await Company.findByPk(companyId) : null;
    if (companyId && !company) throw AppError.notFound('Entreprise introuvable');
    const b = await build({ ...req.query, _viewer: req.user.role }, companyId, company);
    audit.log(req, 'report.generate', { entityType: 'report', entityId: b.meta.reference, companyId: companyId || req.user.companyId, description: `Rapport ${type}${company ? ` — ${company.name}` : ''}` });
    pdf.send(res, b.finalize(), `Rapport-${type}-${b.meta.reference}.pdf`, req.query.download === '1');
  })
);

module.exports = router;
