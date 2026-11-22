/**
 * Statistiques des tableaux de bord (Super Administrateur et Entreprise).
 * Les agrégations mensuelles sont compatibles SQLite et MySQL.
 */
const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Company, User, Vehicle, Payment, CreditTransaction, ContactEvent, VehicleView, Category, AuditLog } = require('../models');
const { ROLES, VEHICLE_STATUS: S } = require('../utils/constants');

const isMysql = () => sequelize.getDialect() === 'mysql';
const monthOf = (column) => (isMysql() ? fn('DATE_FORMAT', col(column), '%Y-%m') : fn('strftime', '%Y-%m', col(column)));

/** Liste des 12 derniers mois au format AAAA-MM. */
function lastMonths(n = 12) {
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const since12 = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1));
};

async function monthly(model, { where = {}, dateCol = 'created_at', agg = 'count', field } = {}) {
  const rows = await model.findAll({
    attributes: [
      [monthOf(dateCol), 'month'],
      [agg === 'count' ? fn('COUNT', col('id')) : fn('SUM', col(field)), 'value'],
    ],
    where: { ...where, [dateCol === 'created_at' ? 'createdAt' : 'paidAt']: { [Op.gte]: since12() } },
    group: [literal('month')],
    raw: true,
  });
  const map = Object.fromEntries(rows.map((r) => [r.month, Number(r.value) || 0]));
  return lastMonths().map((m) => map[m] || 0);
}

const sum = async (model, field, where) => Number((await model.sum(field, { where })) || 0);

async function adminDashboard() {
  const now = new Date();
  const [companies, activeCompanies, clients, staff, vehicles, active, expired, pending, suspended] = await Promise.all([
    Company.count(),
    Company.count({ where: { status: 'active' } }),
    User.count({ where: { role: ROLES.CLIENT } }),
    User.count({ where: { companyId: { [Op.ne]: null } } }),
    Vehicle.count(),
    Vehicle.count({ where: { status: S.ACTIVE, expiresAt: { [Op.gt]: now } } }),
    Vehicle.count({ where: { status: S.EXPIRED } }),
    Vehicle.count({ where: { status: S.PENDING } }),
    Vehicle.count({ where: { status: S.SUSPENDED } }),
  ]);
  const [revenue, creditsSold, consumed, refunded, pendingPayments, walletTotal, contacts] = await Promise.all([
    sum(Payment, 'amount', { status: 'completed' }),
    sum(CreditTransaction, 'amount', { type: 'topup' }),
    sum(CreditTransaction, 'amount', { type: { [Op.in]: ['publish', 'renewal'] } }),
    sum(CreditTransaction, 'amount', { type: 'refund' }),
    Payment.count({ where: { status: 'pending' } }),
    sum(Company, 'walletBalance', {}),
    ContactEvent.count(),
  ]);

  const months = lastMonths();
  const [regCompanies, regClients, revenueSeries, soldSeries, publishSeries, renewSeries] = await Promise.all([
    monthly(Company),
    monthly(User, { where: { role: ROLES.CLIENT } }),
    monthly(Payment, { where: { status: 'completed' }, dateCol: 'paid_at', agg: 'sum', field: 'amount' }),
    monthly(CreditTransaction, { where: { type: 'topup' }, agg: 'sum', field: 'amount' }),
    monthly(CreditTransaction, { where: { type: 'publish' } }),
    monthly(CreditTransaction, { where: { type: 'renewal' } }),
  ]);
  const consumedSeries = await monthly(CreditTransaction, { where: { type: { [Op.in]: ['publish', 'renewal'] } }, agg: 'sum', field: 'amount' });

  // Entreprises les plus actives : crédits consommés + véhicules + contacts
  const topRaw = await CreditTransaction.findAll({
    attributes: ['companyId', [fn('SUM', col('amount')), 'spent'], [fn('COUNT', col('id')), 'ops']],
    where: { type: { [Op.in]: ['publish', 'renewal'] } },
    group: ['companyId'],
    order: [[literal('spent'), 'ASC']],
    limit: 5,
    raw: true,
  });
  const topCompanies = await Promise.all(
    topRaw.map(async (r) => {
      const c = await Company.findByPk(r.companyId, { attributes: ['id', 'name', 'city', 'walletBalance'] });
      return {
        id: r.companyId,
        name: c?.name || '—',
        city: c?.city,
        creditsSpent: Math.abs(Number(r.spent)),
        publications: Number(r.ops),
        vehicles: await Vehicle.count({ where: { companyId: r.companyId } }),
        contacts: await ContactEvent.count({ where: { companyId: r.companyId } }),
      };
    })
  );

  const byCategoryRaw = await Vehicle.findAll({
    attributes: ['categoryId', [fn('COUNT', col('Vehicle.id')), 'count']],
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    group: ['categoryId', 'category.id'],
    raw: true,
  });
  const byCategory = byCategoryRaw.map((r) => ({ name: r['category.name'] || 'Sans catégorie', value: Number(r.count) }));

  const recentActivity = await AuditLog.findAll({
    order: [['createdAt', 'DESC']],
    limit: 8,
    include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }, { model: Company, as: 'company', attributes: ['name'] }],
  });

  return {
    totals: {
      companies,
      activeCompanies,
      clients,
      staff,
      vehicles,
      activeVehicles: active,
      expiredVehicles: expired,
      pendingVehicles: pending,
      suspendedVehicles: suspended,
      revenue,
      creditsSold,
      creditsConsumed: Math.abs(consumed) - refunded,
      creditsInWallets: walletTotal,
      pendingPayments,
      contacts,
    },
    series: months.map((m, i) => ({
      month: m,
      companies: regCompanies[i],
      clients: regClients[i],
      revenue: revenueSeries[i],
      creditsSold: soldSeries[i],
      creditsConsumed: Math.abs(consumedSeries[i]),
      publications: publishSeries[i],
      renewals: renewSeries[i],
    })),
    topCompanies,
    byCategory,
    vehicleStatus: [
      { name: 'Actifs', value: active, key: 'active' },
      { name: 'En attente', value: pending, key: 'pending' },
      { name: 'Expirés', value: expired, key: 'expired' },
      { name: 'Suspendus', value: suspended, key: 'suspended' },
      { name: 'Brouillons', value: await Vehicle.count({ where: { status: S.DRAFT } }), key: 'draft' },
    ],
    recentActivity: recentActivity.map((a) => ({ id: a.id, action: a.action, description: a.description, createdAt: a.createdAt, user: a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Système', company: a.company?.name })),
  };
}

async function companyDashboard(companyId) {
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 86400000);
  const w = { companyId };
  const company = await Company.findByPk(companyId);
  const [total, active, expired, draft, pending, views, contacts, spent, topups] = await Promise.all([
    Vehicle.count({ where: w }),
    Vehicle.count({ where: { ...w, status: S.ACTIVE, expiresAt: { [Op.gt]: now } } }),
    Vehicle.count({ where: { ...w, status: S.EXPIRED } }),
    Vehicle.count({ where: { ...w, status: S.DRAFT } }),
    Vehicle.count({ where: { ...w, status: S.PENDING } }),
    VehicleView.count({ where: w }),
    ContactEvent.count({ where: w }),
    sum(CreditTransaction, 'amount', { ...w, type: { [Op.in]: ['publish', 'renewal'] } }),
    sum(Payment, 'amount', { ...w, status: 'completed' }),
  ]);

  const upcoming = await Vehicle.findAll({
    where: { ...w, status: S.ACTIVE, expiresAt: { [Op.between]: [now, in60] } },
    order: [['expiresAt', 'ASC']],
    limit: 8,
    attributes: ['id', 'brand', 'model', 'year', 'expiresAt', 'autoRenew'],
  });

  const months = lastMonths();
  const [spendSeries, viewSeries, contactSeries] = await Promise.all([
    monthly(CreditTransaction, { where: { ...w, type: { [Op.in]: ['publish', 'renewal'] } }, agg: 'sum', field: 'amount' }),
    monthly(VehicleView, { where: w }),
    monthly(ContactEvent, { where: w }),
  ]);

  const channelsRaw = await ContactEvent.findAll({ attributes: ['channel', [fn('COUNT', col('id')), 'count']], where: w, group: ['channel'], raw: true });
  const channels = ['whatsapp', 'phone', 'email'].map((c) => ({ channel: c, value: Number(channelsRaw.find((r) => r.channel === c)?.count || 0) }));

  const topVehicles = await Vehicle.findAll({ where: w, order: [['viewsCount', 'DESC']], limit: 5, attributes: ['id', 'brand', 'model', 'year', 'viewsCount', 'contactsCount', 'status'] });

  return {
    company: { id: company.id, name: company.name, walletBalance: company.walletBalance },
    totals: {
      vehicles: total,
      activeVehicles: active,
      expiredVehicles: expired,
      draftVehicles: draft,
      pendingVehicles: pending,
      walletBalance: company.walletBalance,
      creditsSpent: Math.abs(spent),
      amountPaid: topups,
      views,
      contacts,
      upcomingExpirations: upcoming.length,
    },
    upcoming,
    series: months.map((m, i) => ({ month: m, spent: Math.abs(spendSeries[i]), views: viewSeries[i], contacts: contactSeries[i] })),
    channels,
    topVehicles,
  };
}

module.exports = { adminDashboard, companyDashboard, lastMonths };
