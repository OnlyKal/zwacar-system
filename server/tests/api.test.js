/**
 * Tests d'intégration de l'API (node:test + supertest) sur une base SQLite temporaire.
 * Couvre : authentification, RBAC, isolation des entreprises, médias, publication payante,
 * anti double débit, renouvellement / expiration automatiques, paiements, SMTP chiffré, PDF.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB = path.join(os.tmpdir(), `zwacar-test-${process.pid}.sqlite`);
process.env.NODE_ENV = 'test';
// SQLite par défaut ; TEST_DB_DIALECT=mysql + DB_HOST/DB_NAME/DB_USER/DB_PASSWORD pour tester sur une base MySQL vide dédiée.
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = DB;
process.env.JOBS_ENABLED = 'false';
// Fichiers (photos, sauvegardes) écrits dans un dossier temporaire, jamais dans storage/ du projet.
const STORAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'zwacar-test-storage-'));
process.env.STORAGE_DIR = STORAGE;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const sharp = require('sharp');

const m = require('../src/models');
const app = require('../src/app');
const { syncSchema } = require('../src/scripts/sync');
const auth = require('../src/services/auth.service');
const vehicleService = require('../src/services/vehicle.service');
const settings = require('../src/services/settings.service');
const { ROLES } = require('../src/utils/constants');

const api = request(app);
const ctx = {};
let photo;

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
async function login(email, password) {
  const r = await api.post('/api/auth/login').send({ email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.accessToken;
}
const balance = async (id) => (await m.Company.findByPk(id)).walletBalance;

const vehicleData = (n) => ({
  brand: 'Toyota',
  model: `Test ${n}`,
  year: 2022,
  categoryId: ctx.category.id,
  fuelType: 'diesel',
  transmission: 'automatic',
  seats: 5,
  doors: 4,
  color: 'Blanc',
  plateNumber: `TST${n}AA`,
  city: 'Kinshasa',
  priceDaily: 100,
  description: 'Véhicule de test',
  rentalConditions: 'Conditions de test',
});

async function createReadyVehicle(token, n) {
  const r = await api.post('/api/vehicles').set(bearer(token)).send(vehicleData(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const up = await api
    .post(`/api/vehicles/${r.body.data.id}/media`)
    .set(bearer(token))
    .attach('photos', photo, { filename: 'a.png', contentType: 'image/png' })
    .attach('photos', photo, { filename: 'b.png', contentType: 'image/png' })
    .attach('photos', photo, { filename: 'c.png', contentType: 'image/png' })
    .attach('photos', photo, { filename: 'd.png', contentType: 'image/png' });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.data.completeness.ready, true);
  return up.body.data;
}

before(async () => {
  await syncSchema();
  photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#947A26' } }).png().toBuffer();
  ctx.category = await m.Category.create({ name: 'SUV', slug: 'suv' });
  ctx.sandbox = await m.PaymentMethod.create({ code: 'sandbox', name: 'Sandbox', provider: 'sandbox' });
  ctx.manual = await m.PaymentMethod.create({ code: 'manual', name: 'Manuel', provider: 'manual' });
  await m.User.create({ firstName: 'Super', lastName: 'Admin', email: 'root@test.com', role: ROLES.SUPER_ADMIN, passwordHash: await auth.hashPassword('Root1234'), status: 'active' });
  ctx.admin = await login('root@test.com', 'Root1234');

  for (const k of ['A', 'B']) {
    const r = await api
      .post('/api/companies')
      .set(bearer(ctx.admin))
      .send({ name: `Société ${k}`, email: `societe${k}@test.com`, phone: '+243810000000', admin: { firstName: 'Admin', lastName: `Société${k}`, email: `admin${k}@test.com`, password: 'Passw0rd' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ctx[`company${k}`] = r.body.data;
    ctx[`token${k}`] = await login(`admin${k}@test.com`, 'Passw0rd');
  }
});

after(async () => {
  await m.sequelize.close();
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(STORAGE, { recursive: true, force: true });
});

test('authentification : mauvais mot de passe refusé, profil et permissions renvoyés', async () => {
  const bad = await api.post('/api/auth/login').send({ email: 'adminA@test.com', password: 'wrong' });
  assert.equal(bad.status, 401);
  const me = await api.get('/api/auth/me').set(bearer(ctx.tokenA));
  assert.equal(me.body.user.role, 'company_admin');
  assert.ok(me.body.user.permissions.includes('vehicles:publish'));
  assert.equal(me.body.user.passwordHash, undefined);
});

test('RBAC : une entreprise ne peut pas accéder aux routes super admin', async () => {
  assert.equal((await api.get('/api/companies').set(bearer(ctx.tokenA))).status, 403);
  assert.equal((await api.get('/api/settings').set(bearer(ctx.tokenA))).status, 403);
  assert.equal((await api.get('/api/stats/admin').set(bearer(ctx.tokenA))).status, 403);
  assert.equal((await api.get('/api/vehicles')).status, 401);
});

test('RBAC : un chauffeur ne peut pas créer de véhicule ni voir le wallet', async () => {
  const r = await api.post('/api/users').set(bearer(ctx.tokenA)).send({ firstName: 'Chauffeur', lastName: 'Test', email: 'driver@test.com', role: 'driver', password: 'Driver123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.companyId, ctx.companyA.id);
  const t = await login('driver@test.com', 'Driver123');
  assert.equal((await api.post('/api/vehicles').set(bearer(t)).send(vehicleData(99))).status, 403);
  assert.equal((await api.get('/api/wallet/summary').set(bearer(t))).status, 403);
  assert.equal((await api.get('/api/vehicles').set(bearer(t))).status, 200);
  // Un admin d'entreprise ne peut pas créer de super admin
  const esc = await api.post('/api/users').set(bearer(ctx.tokenA)).send({ firstName: 'Xavier', lastName: 'Yema', email: 'x@test.com', role: 'super_admin', password: 'Passw0rd' });
  assert.equal(esc.status, 403);
});

test('publication : refusée si incomplète (< 4 photos) puis si crédits insuffisants', async () => {
  const r = await api.post('/api/vehicles').set(bearer(ctx.tokenA)).send(vehicleData(1));
  const id = r.body.data.id;
  const p1 = await api.post(`/api/vehicles/${id}/publish`).set(bearer(ctx.tokenA));
  assert.equal(p1.status, 400);
  assert.ok(p1.body.error.details.some((d) => /photos/.test(d.message)));
  await api.post(`/api/vehicles/${id}/media`).set(bearer(ctx.tokenA)).attach('photos', photo, 'a.png').attach('photos', photo, 'b.png').attach('photos', photo, 'c.png').attach('photos', photo, 'd.png');
  const p2 = await api.post(`/api/vehicles/${id}/publish`).set(bearer(ctx.tokenA));
  assert.equal(p2.status, 402);
  ctx.vehicleA1 = id;
});

test('média : format invalide et vidéo falsifiée rejetés', async () => {
  const bad = await api.post(`/api/vehicles/${ctx.vehicleA1}/media`).set(bearer(ctx.tokenA)).attach('photos', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
  assert.equal(bad.status, 400);
  const fakeVideo = await api.post(`/api/vehicles/${ctx.vehicleA1}/media`).set(bearer(ctx.tokenA)).attach('video', Buffer.from('xxxxxxxxxxxxxxxxxxxxxxxx'), { filename: 'v.mp4', contentType: 'video/mp4' });
  assert.equal(fakeVideo.status, 400);
});

test('rechargement sandbox : 1 pack = 15 USD = 20 crédits', async () => {
  const r = await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 1, paymentMethodId: ctx.sandbox.id });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'completed');
  assert.equal(Number(r.body.data.amount), 15);
  assert.equal(r.body.data.credits, 20);
  assert.equal(await balance(ctx.companyA.id), 20);
});

test('publication payante : 12 crédits débités, validité 12 mois, pas de double publication', async () => {
  const r = await api.post(`/api/vehicles/${ctx.vehicleA1}/publish`).set(bearer(ctx.tokenA));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'active');
  assert.equal(await balance(ctx.companyA.id), 8);
  const months = (new Date(r.body.data.expiresAt) - Date.now()) / (30.4 * 86400000);
  assert.ok(months > 11.8 && months < 12.2);
  const again = await api.post(`/api/vehicles/${ctx.vehicleA1}/publish`).set(bearer(ctx.tokenA));
  assert.equal(again.status, 409);
  assert.equal(await balance(ctx.companyA.id), 8);
});

test('anti double débit : 6 publications simultanées du même véhicule → un seul débit', async () => {
  await api.post(`/api/companies/${ctx.companyA.id}/wallet/adjust`).set(bearer(ctx.admin)).send({ amount: 100, reason: 'Test concurrence' });
  const before = await balance(ctx.companyA.id);
  const v = await createReadyVehicle(ctx.tokenA, 2);
  const results = await Promise.all(Array.from({ length: 6 }, () => api.post(`/api/vehicles/${v.id}/publish`).set(bearer(ctx.tokenA))));
  assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join(','));
  assert.equal(await balance(ctx.companyA.id), before - 12);
  assert.equal(await m.CreditTransaction.count({ where: { vehicleId: v.id, type: 'publish' } }), 1);
  ctx.vehicleA2 = v.id;
});

test('isolation : une entreprise ne voit ni ne modifie les données d’une autre', async () => {
  assert.equal((await api.get(`/api/vehicles/${ctx.vehicleA1}`).set(bearer(ctx.tokenB))).status, 404);
  assert.equal((await api.patch(`/api/vehicles/${ctx.vehicleA1}`).set(bearer(ctx.tokenB)).send({ color: 'Rouge' })).status, 404);
  assert.equal((await api.delete(`/api/vehicles/${ctx.vehicleA1}`).set(bearer(ctx.tokenB))).status, 404);
  assert.equal((await api.post(`/api/vehicles/${ctx.vehicleA1}/publish`).set(bearer(ctx.tokenB))).status, 404);
  assert.equal((await api.get(`/api/vehicles?companyId=${ctx.companyA.id}`).set(bearer(ctx.tokenB))).status, 403);
  assert.equal((await api.get(`/api/wallet/transactions?companyId=${ctx.companyA.id}`).set(bearer(ctx.tokenB))).status, 403);
  const list = await api.get('/api/vehicles').set(bearer(ctx.tokenB));
  assert.equal(list.body.meta.total, 0);
  const users = await api.get('/api/users').set(bearer(ctx.tokenB));
  assert.ok(users.body.data.every((u) => u.companyId === ctx.companyB.id));
  const txA = await m.CreditTransaction.findOne({ where: { companyId: ctx.companyA.id } });
  assert.equal((await api.get(`/api/wallet/transactions/${txA.id}/receipt.pdf`).set(bearer(ctx.tokenB))).status, 404);
});

test('API publique : seuls les véhicules actifs et non expirés sont visibles', async () => {
  const r = await api.get('/api/public/vehicles');
  const ids = r.body.data.map((v) => v.id);
  assert.ok(ids.includes(ctx.vehicleA1));
  assert.equal(r.body.data[0].plateNumber, undefined); // immatriculation jamais exposée
  const c = await api.post(`/api/public/vehicles/${ctx.vehicleA1}/contact`).send({ channel: 'phone' });
  assert.equal(c.status, 200);
  assert.match(c.body.data.url, /^tel:/);
  assert.equal(await m.ContactEvent.count({ where: { vehicleId: ctx.vehicleA1 } }), 1);
});

test('tarification : grille jour/semaine/mois, reliquat plafonné', () => {
  const { periodCost } = require('../src/services/pricing.service');
  const g = { daily: 45, weekly: 280, monthly: 950 };
  assert.equal(periodCost(1, g), 45);
  assert.equal(periodCost(6, g), 270);
  assert.equal(periodCost(7, g), 280);
  assert.equal(periodCost(6, { daily: 50, weekly: 280 }), 280); // jamais plus cher qu'une semaine
  assert.equal(periodCost(28, g), 950); // 4 semaines (1120) plafonnées au prix du mois
  assert.equal(periodCost(35, g), 950 + 225);
  assert.equal(periodCost(10, { monthly: 900 }), 300); // tarif journalier déduit du mensuel
  assert.equal(periodCost(3, {}), null);
});

test('chauffeur : option payante, inclus ou absent ; filtre, estimation et contact', async () => {
  // Mode « en option » sans supplément → refusé pour un véhicule publié (complétude).
  const bad = await api.patch(`/api/vehicles/${ctx.vehicleA2}`).set(bearer(ctx.tokenA)).send({ driverMode: 'optional' });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  const ok = await api.patch(`/api/vehicles/${ctx.vehicleA2}`).set(bearer(ctx.tokenA)).send({ driverMode: 'optional', driverPriceDaily: 30 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.withDriver, true);
  assert.equal(ok.body.data.driverPriceDaily, 30);

  const ids = async (qs) => (await api.get(`/api/public/vehicles?${qs}`)).body.data.map((v) => v.id);
  const withD = await ids('driver=with');
  assert.ok(withD.includes(ctx.vehicleA2) && !withD.includes(ctx.vehicleA1));
  const withoutD = await ids('driver=without');
  assert.ok(withoutD.includes(ctx.vehicleA2) && withoutD.includes(ctx.vehicleA1));

  // 10 jours à 100 $/jour : 1 semaine (700) + 3 jours (300) ; chauffeur 30 $/jour : 210 + 90.
  const q1 = await api.get(`/api/public/vehicles/${ctx.vehicleA2}/quote?days=10`);
  assert.equal(q1.status, 200, JSON.stringify(q1.body));
  assert.deepEqual([q1.body.data.vehicleCost, q1.body.data.driverCost, q1.body.data.total], [1000, 0, 1000]);
  const q2 = await api.get(`/api/public/vehicles/${ctx.vehicleA2}/quote?days=10&withDriver=true`);
  assert.deepEqual([q2.body.data.withDriver, q2.body.data.driverCost, q2.body.data.total], [true, 300, 1300]);
  // Véhicule sans chauffeur : demande avec chauffeur refusée.
  assert.equal((await api.get(`/api/public/vehicles/${ctx.vehicleA1}/quote?days=2&withDriver=true`)).status, 400);

  const c = await api.post(`/api/public/vehicles/${ctx.vehicleA2}/contact`).send({ channel: 'whatsapp', withDriver: true, days: 10 });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.match(decodeURIComponent(c.body.data.url), /avec chauffeur pour 10 jours \(estimation \$1300\)/);
  const ev = await m.ContactEvent.findOne({ where: { vehicleId: ctx.vehicleA2, channel: 'whatsapp' } });
  assert.equal(ev.withDriver, true);
  assert.equal(ev.rentalDays, 10);
  assert.equal(Number(ev.estimatedTotal), 1300);

  // Chauffeur inclus : toujours avec chauffeur, sans supplément, suppléments effacés.
  const inc = await api.patch(`/api/vehicles/${ctx.vehicleA2}`).set(bearer(ctx.tokenA)).send({ driverMode: 'included' });
  assert.equal(inc.body.data.driverPriceDaily, null);
  const q3 = await api.get(`/api/public/vehicles/${ctx.vehicleA2}/quote?days=1`);
  assert.deepEqual([q3.body.data.withDriver, q3.body.data.driverIncluded, q3.body.data.total], [true, true, 100]);
  assert.ok(!(await ids('driver=without')).includes(ctx.vehicleA2));
});

test('renouvellement automatique : débit unique même si le job tourne deux fois en parallèle', async () => {
  const v = await m.Vehicle.findByPk(ctx.vehicleA2);
  await v.update({ expiresAt: new Date(Date.now() - 1000), autoRenew: true });
  const before = await balance(ctx.companyA.id);
  await Promise.all([vehicleService.processExpirations(), vehicleService.processExpirations()]);
  await v.reload();
  assert.equal(v.status, 'active');
  assert.ok(new Date(v.expiresAt) > new Date(Date.now() + 300 * 86400000));
  assert.equal(await balance(ctx.companyA.id), before - 12);
  assert.equal(await m.CreditTransaction.count({ where: { vehicleId: v.id, type: 'renewal' } }), 1);
});

test('expiration : solde insuffisant → véhicule désactivé et retiré des résultats publics', async () => {
  const v = await createReadyVehicle(ctx.tokenB, 3);
  await api.post(`/api/companies/${ctx.companyB.id}/wallet/adjust`).set(bearer(ctx.admin)).send({ amount: 12, reason: 'Une publication' });
  assert.equal((await api.post(`/api/vehicles/${v.id}/publish`).set(bearer(ctx.tokenB))).status, 200);
  assert.equal(await balance(ctx.companyB.id), 0);
  await m.Vehicle.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: v.id } });
  const stats = await vehicleService.processExpirations();
  assert.equal(stats.expired, 1);
  const after = await m.Vehicle.findByPk(v.id);
  assert.equal(after.status, 'expired');
  assert.equal(await balance(ctx.companyB.id), 0);
  assert.equal((await api.get(`/api/public/vehicles/${v.id}`)).status, 404);
  const events = await m.VehicleEvent.findAll({ where: { vehicleId: v.id } });
  assert.ok(events.some((e) => e.type === 'renewal_failed'));
});

test('expiration : renouvellement automatique désactivé → aucun débit', async () => {
  await api.patch(`/api/vehicles/${ctx.vehicleA1}/auto-renew`).set(bearer(ctx.tokenA)).send({ autoRenew: false });
  await m.Vehicle.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: ctx.vehicleA1 } });
  const before = await balance(ctx.companyA.id);
  await vehicleService.processExpirations();
  assert.equal((await m.Vehicle.findByPk(ctx.vehicleA1)).status, 'expired');
  assert.equal(await balance(ctx.companyA.id), before);
});

test('paiement manuel : en attente, confirmation par le super admin uniquement, crédit unique', async () => {
  // Une référence fournie par le client est ignorée : elle est toujours générée par le système.
  const r = await api.post('/api/payments/topup').set(bearer(ctx.tokenB)).send({ packs: 2, paymentMethodId: ctx.manual.id, providerReference: 'SAISIE-CLIENT' });
  assert.equal(r.body.data.status, 'pending');
  assert.ok(!r.body.data.providerReference);
  assert.match(r.body.instructions, /PAY-/);
  const id = r.body.data.id;
  assert.equal((await api.post(`/api/payments/${id}/confirm`).set(bearer(ctx.tokenB))).status, 403);
  assert.equal((await api.get(`/api/payments/${id}/receipt.pdf`).set(bearer(ctx.tokenB))).status, 400);
  const [c1, c2] = await Promise.all([api.post(`/api/payments/${id}/confirm`).set(bearer(ctx.admin)).send({ providerReference: 'SAISIE-ADMIN' }), api.post(`/api/payments/${id}/confirm`).set(bearer(ctx.admin)).send({})]);
  assert.equal(c1.status, 200);
  assert.equal(c2.status, 200);
  assert.match((await m.Payment.findByPk(id)).providerReference, /^TRX-\d{8}-[0-9A-F]{6}$/);
  assert.equal(await balance(ctx.companyB.id), 40);
  assert.equal(await m.CreditTransaction.count({ where: { paymentId: id } }), 1);
});

test('PDF : facture, reçu et rapports générés ; rapport entreprises réservé au super admin', async () => {
  const p = await m.Payment.findOne({ where: { companyId: ctx.companyB.id, status: 'completed' } });
  for (const url of [`/api/payments/${p.id}/invoice.pdf`, `/api/payments/${p.id}/receipt.pdf`, '/api/reports/credits.pdf', '/api/reports/statistics.pdf', '/api/reports/vehicles.pdf']) {
    const r = await api.get(url).set(bearer(ctx.tokenB)).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(r.status, 200, url);
    assert.equal(r.headers['content-type'], 'application/pdf');
    assert.equal(r.body.slice(0, 4).toString(), '%PDF');
  }
  assert.equal((await api.get('/api/reports/companies.pdf').set(bearer(ctx.tokenB))).status, 403);
  assert.equal((await api.get('/api/reports/companies.pdf').set(bearer(ctx.admin))).status, 200);
});

test('SMTP : mot de passe chiffré en base et jamais renvoyé par l’API', async () => {
  const secret = 'abcd efgh ijkl mnop';
  const r = await api.put('/api/settings/smtp').set(bearer(ctx.admin)).send({ host: 'smtp.gmail.com', port: 587, secure: 'tls', user: 'expediteur@gmail.com', password: secret, fromName: 'ZwaCar', replyTo: 'support@zwacar.com', enabled: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.password, undefined);
  assert.equal(r.body.data.hasPassword, true);
  const row = await m.Setting.findByPk('smtp');
  assert.equal(row.encrypted, true);
  assert.ok(!row.value.includes('abcdefgh') && !row.value.includes('expediteur'));
  assert.equal((await settings.getSmtpSecret()).password, 'abcdefghijklmnop');
  // Mise à jour sans mot de passe : l'ancien est conservé
  await api.put('/api/settings/smtp').set(bearer(ctx.admin)).send({ host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'expediteur@gmail.com', enabled: false });
  assert.equal((await settings.getSmtpSecret()).password, 'abcdefghijklmnop');
  const all = await api.get('/api/settings').set(bearer(ctx.admin));
  assert.ok(!JSON.stringify(all.body).includes('abcdefghijklmnop'));
});

test('validation préalable : refus par le super admin → remboursement des crédits', async () => {
  await settings.set('general', { ...(await settings.get('general')), requireVehicleApproval: true });
  const v = await createReadyVehicle(ctx.tokenB, 4);
  const before = await balance(ctx.companyB.id);
  const p = await api.post(`/api/vehicles/${v.id}/publish`).set(bearer(ctx.tokenB));
  assert.equal(p.body.data.status, 'pending');
  assert.equal(await balance(ctx.companyB.id), before - 12);
  assert.equal((await api.get(`/api/public/vehicles/${v.id}`)).status, 404);
  assert.equal((await api.post(`/api/vehicles/${v.id}/moderate`).set(bearer(ctx.tokenB)).send({ action: 'reject' })).status, 403);
  const rej = await api.post(`/api/vehicles/${v.id}/moderate`).set(bearer(ctx.admin)).send({ action: 'reject', reason: 'Photos floues' });
  assert.equal(rej.body.data.status, 'rejected');
  assert.equal(await balance(ctx.companyB.id), before);
  await settings.set('general', { ...(await settings.get('general')), requireVehicleApproval: false });
});

test('suspension d’entreprise : accès coupé immédiatement et véhicules masqués', async () => {
  await api.post(`/api/companies/${ctx.companyA.id}/status`).set(bearer(ctx.admin)).send({ status: 'suspended', reason: 'Test' });
  assert.equal((await api.get('/api/vehicles').set(bearer(ctx.tokenA))).status, 403);
  const pub = await api.get('/api/public/vehicles');
  assert.ok(pub.body.data.every((v) => v.companyId !== ctx.companyA.id));
  await api.post(`/api/companies/${ctx.companyA.id}/status`).set(bearer(ctx.admin)).send({ status: 'active' });
  assert.equal((await api.get('/api/vehicles').set(bearer(ctx.tokenA))).status, 200);
});

/* ---------------- FlexPay (serveur FlexPay simulé) ---------------- */
function mockFlexpay() {
  const fake = { calls: [], orders: new Map(), next: { code: '0', message: 'Transaction envoyée' }, seq: 0 };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    fake.calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers, body });
    const json = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (opts.headers?.Authorization !== 'Bearer secret-token-123') return { status: 401, text: async () => 'Unauthorized' };
    if (String(url).endsWith('/paymentService')) {
      if (fake.next.code !== '0') return json({ code: '1', message: fake.next.message });
      const orderNumber = `ORD${++fake.seq}`;
      fake.orders.set(orderNumber, { reference: body.reference, amount: body.amount, currency: body.currency, status: '2' });
      return json({ code: '0', message: 'Transaction envoyée', orderNumber });
    }
    const m = String(url).match(/\/check\/(.+)$/);
    if (m) {
      const t = fake.orders.get(decodeURIComponent(m[1]));
      return json(t ? { code: '0', message: 'Une transaction trouvée', transaction: { orderNumber: m[1], provider_reference: t.status === '0' ? 'MP-OP-7KI810' : null, ...t } } : { code: '1', message: 'Aucune transaction trouvée', transaction: null });
    }
    return { status: 404, text: async () => 'not found' };
  };
  fake.restore = () => (global.fetch = original);
  return fake;
}

test('FlexPay : configuration chiffrée, moyen masqué tant qu’il n’est pas configuré, refus de l’admin', async () => {
  const m1 = await api.post('/api/payment-methods').set(bearer(ctx.admin)).send({ code: 'fp_mobile', name: 'Mobile Money en ligne', provider: 'flexpay_mobile' });
  assert.equal(m1.status, 201, JSON.stringify(m1.body));
  ctx.fpMethod = m1.body.data.id;
  const before = await api.get('/api/payment-methods').set(bearer(ctx.tokenA));
  assert.ok(!before.body.data.some((m) => m.id === ctx.fpMethod), 'masqué tant que FlexPay n’est pas configuré');
  assert.equal((await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 1, paymentMethodId: ctx.fpMethod, phone: '0812345678' })).status, 400);

  const put = await api.put('/api/settings/flexpay').set(bearer(ctx.admin)).send({ enabled: true, merchant: 'ZWACAR', token: 'Bearer secret-token-123' });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.data.token, undefined);
  assert.equal(put.body.data.hasToken, true);
  assert.match(put.body.data.webhookUrl, /\/api\/payments\/webhook\/flexpay$/);
  const row = await m.Setting.findByPk('flexpay');
  assert.equal(row.encrypted, true);
  assert.ok(!row.value.includes('secret-token-123'), 'jeton chiffré en base');
  assert.equal((await api.get('/api/settings/flexpay').set(bearer(ctx.tokenA))).status, 403);

  const after = await api.get('/api/payment-methods').set(bearer(ctx.tokenA));
  const fp = after.body.data.find((x) => x.id === ctx.fpMethod);
  assert.ok(fp && fp.online && fp.needsPhone);
  // Le super admin ne peut pas initier un paiement en ligne à la place de l'entreprise.
  const adm = await api.post('/api/payments/topup').set(bearer(ctx.admin)).send({ companyId: ctx.companyA.id, packs: 1, paymentMethodId: ctx.fpMethod, phone: '0812345678' });
  assert.equal(adm.status, 400);
});

test('FlexPay Mobile Money : demande envoyée, callback falsifié ignoré, crédit unique après vérification', async () => {
  const fake = mockFlexpay();
  try {
    assert.equal((await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 1, paymentMethodId: ctx.fpMethod, phone: '12' })).status, 400);

    const start = await balance(ctx.companyA.id);
    const r = await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 1, paymentMethodId: ctx.fpMethod, phone: '+243 81 234 5678' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'pending');
    assert.equal(r.body.online, true);
    const sent = fake.calls.find((c) => c.url.endsWith('/paymentService'));
    assert.deepEqual(
      { merchant: sent.body.merchant, type: sent.body.type, phone: sent.body.phone, amount: sent.body.amount, currency: sent.body.currency },
      { merchant: 'ZWACAR', type: '1', phone: '243812345678', amount: '15.00', currency: 'USD' }
    );
    assert.match(sent.body.callbackUrl, /\/api\/payments\/webhook\/flexpay$/);
    const pay = r.body.data;
    const order = pay.providerReference;

    // Callback « succès » falsifié alors que FlexPay indique une transaction en cours → rien n'est crédité.
    const forged = await api.post('/api/payments/webhook/flexpay').send({ code: '0', reference: pay.reference, orderNumber: order });
    assert.equal(forged.status, 200);
    assert.equal(await balance(ctx.companyA.id), start);
    assert.equal((await m.Payment.findByPk(pay.id)).status, 'pending');
    // Numéro de commande ne correspondant pas au paiement → refusé.
    assert.equal((await api.post('/api/payments/webhook/flexpay').send({ code: '0', reference: pay.reference, orderNumber: 'AUTRE' })).status, 400);

    // Montant confirmé différent → anomalie, pas de crédit.
    fake.orders.get(order).status = '0';
    fake.orders.get(order).amount = '1.0';
    const anomaly = await api.post(`/api/payments/${pay.id}/refresh`).set(bearer(ctx.tokenA));
    assert.equal(anomaly.body.anomaly, true);
    assert.equal(await balance(ctx.companyA.id), start);

    // Paiement réellement confirmé : callbacks et vérifications simultanés → un seul crédit.
    fake.orders.get(order).amount = '15.0';
    const results = await Promise.all([
      ...Array.from({ length: 3 }, () => api.post('/api/payments/webhook/flexpay').send({ code: '0', reference: pay.reference, orderNumber: order })),
      ...Array.from({ length: 3 }, () => api.post(`/api/payments/${pay.id}/refresh`).set(bearer(ctx.tokenA))),
    ]);
    assert.ok(results.every((x) => x.status === 200), results.map((x) => x.status).join(','));
    assert.equal(await balance(ctx.companyA.id), start + 20);
    assert.equal(await m.CreditTransaction.count({ where: { paymentId: pay.id, type: 'topup' } }), 1);
    const paid = await m.Payment.findByPk(pay.id);
    assert.equal(paid.status, 'completed');
    assert.equal(paid.providerReference, order); // numéro de commande FlexPay, automatique
    assert.equal(paid.operatorReference, 'MP-OP-7KI810'); // référence opérateur récupérée auprès de FlexPay

    // Isolation : une autre entreprise ne peut pas interroger ce paiement.
    assert.equal((await api.post(`/api/payments/${pay.id}/refresh`).set(bearer(ctx.tokenB))).status, 404);

    // Paiement refusé par l'opérateur → clôturé par la tâche planifiée.
    const r2 = await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 2, paymentMethodId: ctx.fpMethod, phone: '0991234567' });
    fake.orders.get(r2.body.data.providerReference).status = '1';
    const { syncPendingOnline } = require('../src/services/payment/payment.service');
    const job = await syncPendingOnline();
    assert.ok(job.failed >= 1, JSON.stringify(job));
    assert.equal((await m.Payment.findByPk(r2.body.data.id)).status, 'failed');
    assert.equal(await balance(ctx.companyA.id), start + 20);

    // Demande refusée par FlexPay à l'envoi → erreur claire, paiement clôturé.
    fake.next = { code: '1', message: 'Numéro non éligible' };
    const r3 = await api.post('/api/payments/topup').set(bearer(ctx.tokenA)).send({ packs: 1, paymentMethodId: ctx.fpMethod, phone: '0851234567' });
    assert.equal(r3.status, 502);
    assert.match(r3.body.error.message, /Numéro non éligible/);
    const last = await m.Payment.findOne({ where: { companyId: ctx.companyA.id }, order: [['id', 'DESC']] });
    assert.equal(last.status, 'failed');
  } finally {
    fake.restore();
  }
});

test('notifications : le Super Admin est notifié des demandes et des paiements Mobile Money confirmés', async () => {
  const list = async (token) => (await api.get('/api/notifications').set(bearer(token))).body;
  const mine = await list(ctx.admin);
  // Paiement Mobile Money confirmé (test précédent) : une seule notification malgré 6 confirmations simultanées.
  const done = mine.data.filter((n) => n.type === 'topup.completed' && n.message.includes('Société A a payé 15.00 USD par Mobile Money'));
  assert.equal(done.length, 1, JSON.stringify(mine.data.map((n) => n.title)));
  assert.match(done[0].message, /\+20 crédits/);

  // Demande de recharge envoyée par l'entreprise → notification « à valider ».
  const before = mine.unread;
  const req = await api.post('/api/payments/topup').set(bearer(ctx.tokenB)).send({ packs: 1, paymentMethodId: ctx.manual.id, payerNote: 'Dépôt' });
  assert.equal(req.status, 201);
  const after = await list(ctx.admin);
  assert.equal(after.unread, before + 1);
  assert.equal(after.data[0].type, 'topup.requested');
  assert.match(after.data[0].message, /Société B/);

  // Une entreprise ne voit pas les notifications du Super Admin et ne peut pas les modifier.
  assert.equal((await list(ctx.tokenB)).data.length, 0);
  await api.post(`/api/notifications/${after.data[0].id}/read`).set(bearer(ctx.tokenB));
  assert.equal((await m.Notification.findByPk(after.data[0].id)).readAt, null);

  await api.post(`/api/notifications/${after.data[0].id}/read`).set(bearer(ctx.admin));
  assert.equal((await list(ctx.admin)).unread, before);
  await api.post('/api/notifications/read-all').set(bearer(ctx.admin));
  assert.equal((await list(ctx.admin)).unread, 0);
});

test('inscription entreprise : en attente, connexion bloquée, validation ou refus par le Super Admin', async () => {
  const body = (n, extra = {}) => ({
    company: { name: `Loueur ${n}`, email: `loueur${n}@test.com`, phone: '+243810000111', city: 'Goma' },
    admin: { firstName: 'Jean', lastName: `Loueur${n}`, email: `jean${n}@test.com`, password: 'Passw0rd' },
    acceptTerms: true,
    ...extra,
  });
  // Robots (champ piège rempli) et conditions non acceptées : refusés.
  assert.equal((await api.post('/api/auth/register-company').send(body(1, { website: 'http://spam' }))).status, 400);
  assert.equal((await api.post('/api/auth/register-company').send(body(1, { acceptTerms: false }))).status, 400);

  const r = await api.post('/api/auth/register-company').send(body(1));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.pending, true);
  assert.equal(r.body.accessToken, undefined);
  const company = await m.Company.findOne({ where: { email: 'loueur1@test.com' } });
  assert.equal(company.status, 'pending');
  assert.equal(company.walletBalance, 0);
  // Email déjà utilisé.
  assert.equal((await api.post('/api/auth/register-company').send(body(1))).status, 409);

  // Connexion bloquée avec un message explicite tant que l'entreprise n'est pas validée.
  const blocked = await api.post('/api/auth/login').send({ email: 'jean1@test.com', password: 'Passw0rd' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error.message, /attente de validation/);
  // Invisible dans l'annuaire public.
  assert.equal((await api.get(`/api/public/companies/${company.id}`)).status, 404);

  // Notification du Super Admin + validation.
  const notes = (await api.get('/api/notifications').set(bearer(ctx.admin))).body.data;
  assert.ok(notes.some((n) => n.type === 'company.registered' && n.message.includes('Loueur 1')));
  assert.equal((await api.post(`/api/companies/${company.id}/status`).set(bearer(ctx.admin)).send({ status: 'active' })).status, 200);
  const ok = await api.post('/api/auth/login').send({ email: 'jean1@test.com', password: 'Passw0rd' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'company_admin');
  // Une entreprise active ne peut pas être « refusée ».
  assert.equal((await api.post(`/api/companies/${company.id}/status`).set(bearer(ctx.admin)).send({ status: 'rejected' })).status, 400);

  // Refus d'une inscription.
  await api.post('/api/auth/register-company').send(body(2));
  const c2 = await m.Company.findOne({ where: { email: 'loueur2@test.com' } });
  assert.equal((await api.post(`/api/companies/${c2.id}/status`).set(bearer(ctx.admin)).send({ status: 'rejected', reason: 'Documents manquants' })).status, 200);
  const refused = await api.post('/api/auth/login').send({ email: 'jean2@test.com', password: 'Passw0rd' });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error.message, /pas été acceptée/);

  // Sans validation préalable : compte actif et session ouverte immédiatement.
  const general = await settings.get('general');
  await settings.set('general', { ...general, requireCompanyApproval: false });
  const direct = await api.post('/api/auth/register-company').send(body(3));
  assert.equal(direct.status, 201);
  assert.ok(direct.body.accessToken);
  // Inscriptions fermées.
  await settings.set('general', { ...general, allowCompanyRegistration: false });
  assert.equal((await api.post('/api/auth/register-company').send(body(4))).status, 403);
  await settings.set('general', general);
});

test('sauvegarde et restauration de la base', async () => {
  const b = await api.post('/api/backups').set(bearer(ctx.admin));
  assert.equal(b.status, 201);
  const count = await m.Vehicle.count();
  await m.Category.create({ name: 'Temporaire', slug: 'temporaire' });
  const r = await api.post(`/api/backups/${b.body.data.file}/restore`).set(bearer(ctx.admin)).send({ confirm: 'RESTAURER' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await m.Category.count({ where: { slug: 'temporaire' } }), 0);
  assert.equal(await m.Vehicle.count(), count);
});
