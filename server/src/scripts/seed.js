/**
 * Initialisation de la base :
 *   npm run seed            → données de référence + super admin (+ démo si base vide en dev)
 *   npm run seed -- --reset → réinitialise complètement la base SQLite de développement
 *   npm run seed -- --no-demo
 *
 * Les véhicules de démonstration reçoivent 4 photos générées (illustrations) afin de
 * respecter la règle des 4 photos obligatoires.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

const args = process.argv.slice(2);
if (args.includes('--reset') && config.db.dialect === 'sqlite') {
  for (const f of [config.db.storage, `${config.db.storage}-wal`, `${config.db.storage}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  fs.rmSync(path.join(config.paths.uploads, 'vehicles'), { recursive: true, force: true });
  fs.rmSync(path.join(config.paths.uploads, 'companies'), { recursive: true, force: true });
  console.log('[seed] base SQLite réinitialisée');
}

const m = require('../models');
const { syncSchema } = require('./sync');
const auth = require('../services/auth.service');
const wallet = require('../services/wallet.service');
const media = require('../services/media.service');
const vehicleService = require('../services/vehicle.service');
const payments = require('../services/payment/payment.service');
const { slugify, addMonths, sha256 } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');

const CATEGORIES = [
  ['Citadine', 'city', 'Petites voitures économiques pour la ville'],
  ['Berline', 'sedan', 'Confort et élégance'],
  ['SUV', 'suv', 'Polyvalents et spacieux'],
  ['4x4 / Tout-terrain', 'offroad', 'Pour toutes les routes'],
  ['Pick-up', 'pickup', 'Transport et chantier'],
  ['Minibus', 'van', 'Transport de groupes'],
  ['Luxe & Prestige', 'luxury', 'Véhicules haut de gamme'],
  ['Utilitaire', 'truck', 'Déménagement et marchandises'],
];
const FEATURES = [
  ['Climatisation', 'snow'],
  ['GPS', 'map'],
  ['Bluetooth', 'bluetooth'],
  ['Caméra de recul', 'camera'],
  ['Sièges en cuir', 'seat'],
  ['Toit ouvrant', 'sun'],
  ['Régulateur de vitesse', 'gauge'],
  ['Ports USB', 'usb'],
  ['Wi-Fi à bord', 'wifi'],
  ['Transmission intégrale', 'cog'],
  ['Siège bébé', 'baby'],
  ['Assurance tous risques', 'shield'],
];
// Deux moyens de rechargement : Mobile Money en ligne (FlexPay) ou demande validée par le Super Administrateur.
const METHODS = [
  { code: 'flexpay_mobile', name: 'Mobile Money (M-Pesa, Orange, Airtel, Afrimoney)', provider: 'flexpay_mobile', icon: 'mobile', sortOrder: 0, instructions: 'Paiement sécurisé FlexPay : validez la demande reçue sur votre téléphone avec votre code PIN. Vos crédits sont ajoutés automatiquement.' },
  { code: 'request', name: 'Demande de recharge', provider: 'manual', icon: 'request', sortOrder: 1, instructions: 'Votre demande est transmise à l’équipe ZwaCar. Effectuez le paiement selon les modalités qui vous seront communiquées en indiquant la référence ci-dessous ; vos crédits seront ajoutés dès validation.' },
]

/* ---------------- Illustrations des véhicules de démo ---------------- */
const VIEWS = ['Vue avant', 'Vue latérale', 'Intérieur', 'Vue arrière'];
function carSvg(title, view, hue, i) {
  const flip = i === 3 ? 'scale(-1,1) translate(-1200,0)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="hsl(${hue},24%,${14 + i * 3}%)"/>
  <ellipse cx="600" cy="615" rx="430" ry="34" fill="#000" opacity="0.35"/>
  <g transform="${flip}">
    <path d="M200 560 L225 470 Q240 430 300 420 L430 410 L520 330 Q545 305 600 305 L800 305 Q850 305 880 335 L960 420 L1010 432 Q1050 442 1055 490 L1060 560 Z" fill="#b39537"/>
    <path d="M545 345 Q560 330 600 330 L690 330 L690 415 L470 415 Z" fill="#1d1a12" opacity="0.75"/>
    <path d="M710 330 L800 330 Q835 330 855 352 L915 415 L710 415 Z" fill="#1d1a12" opacity="0.75"/>
    <rect x="1015" y="460" width="38" height="16" rx="6" fill="#fff6d5"/>
    <rect x="205" y="480" width="30" height="14" rx="5" fill="#ff8a65" opacity="0.9"/>
    <circle cx="350" cy="565" r="70" fill="#111"/><circle cx="350" cy="565" r="34" fill="#9a9a9a"/>
    <circle cx="880" cy="565" r="70" fill="#111"/><circle cx="880" cy="565" r="34" fill="#9a9a9a"/>
  </g>
  <rect x="470" y="700" width="260" height="44" rx="4" fill="#000" opacity="0.35"/>
  <text x="600" y="729" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#d9c27a">${view}</text>
</svg>`;
}

async function addDemoPhotos(vehicle, hue) {
  for (let i = 0; i < 4; i++) {
    const tmp = path.join(os.tmpdir(), `zw-seed-${vehicle.id}-${i}.png`);
    await sharp(Buffer.from(carSvg(`${vehicle.brand} ${vehicle.model}`, VIEWS[i], hue, i))).png().toFile(tmp);
    const out = await media.processPhoto(tmp, `vehicles/${vehicle.id}`);
    await m.VehicleMedia.create({ vehicleId: vehicle.id, type: 'photo', sortOrder: i, ...out });
  }
}

/* ---------------- Données de démonstration ---------------- */
const DEMO_COMPANIES = [
  {
    company: { name: 'Prestige Auto Kinshasa', email: 'contact@prestige-auto.cd', phone: '+243810000001', whatsapp: '+243810000001', city: 'Kinshasa', country: 'RD Congo', address: '12 Boulevard du 30 Juin, Gombe', description: 'Location de véhicules haut de gamme avec ou sans chauffeur depuis 2012.', taxId: 'CD/KIN/RCCM/12-B-0001' },
    admin: { firstName: 'Patrick', lastName: 'Mbala', email: 'admin@prestige-auto.cd' },
    team: [
      { firstName: 'Grace', lastName: 'Ilunga', email: 'gestion@prestige-auto.cd', role: ROLES.MANAGER, jobTitle: 'Responsable de flotte' },
      { firstName: 'Junior', lastName: 'Kasongo', email: 'chauffeur@prestige-auto.cd', role: ROLES.DRIVER, jobTitle: 'Chauffeur' },
      { firstName: 'Mireille', lastName: 'Tshala', email: 'compta@prestige-auto.cd', role: ROLES.ACCOUNTANT, jobTitle: 'Comptable' },
    ],
    packs: 4,
    vehicles: [
      ['Toyota', 'Land Cruiser Prado', 2022, 'SUV', 'diesel', 'automatic', 7, 5, 'Blanc', 150, 950, 3500, ['optional', 40, 250, 900], [0, 1, 2, 3, 4, 6, 9, 11]],
      ['Mercedes-Benz', 'Classe E', 2021, 'Luxe & Prestige', 'petrol', 'automatic', 5, 4, 'Noir', 180, 1150, 4200, ['optional', 50, 300, 1100], [0, 1, 2, 3, 4, 5, 6, 7]],
      ['Toyota', 'Hilux', 2020, 'Pick-up', 'diesel', 'manual', 5, 4, 'Gris', 110, 700, 2600, ['none'], [0, 2, 9, 11]],
      ['Range Rover', 'Sport', 2023, 'Luxe & Prestige', 'hybrid', 'automatic', 5, 5, 'Bleu nuit', 260, 1700, 6200, ['included'], [0, 1, 2, 3, 4, 5, 6, 8, 9]],
      ['Toyota', 'Coaster', 2019, 'Minibus', 'diesel', 'manual', 29, 2, 'Blanc', 220, 1400, 5000, ['included'], [0, 7, 11]],
    ],
  },
  {
    company: { name: 'Lubumbashi Car Rental', email: 'info@lshi-rental.cd', phone: '+243970000002', whatsapp: '+243970000002', city: 'Lubumbashi', country: 'RD Congo', address: '45 Avenue Kasavubu, Lubumbashi', description: 'Votre partenaire mobilité dans le Haut-Katanga : citadines, SUV et utilitaires.' },
    admin: { firstName: 'Sarah', lastName: 'Kabeya', email: 'admin@lshi-rental.cd' },
    team: [{ firstName: 'David', lastName: 'Mukendi', email: 'agent@lshi-rental.cd', role: ROLES.AGENT, jobTitle: 'Agent commercial' }],
    packs: 3,
    vehicles: [
      ['Suzuki', 'Swift', 2021, 'Citadine', 'petrol', 'manual', 5, 5, 'Rouge', 45, 280, 950, ['optional', 25, 150, 550], [0, 2, 7]],
      ['Hyundai', 'Tucson', 2022, 'SUV', 'petrol', 'automatic', 5, 5, 'Gris', 85, 540, 1900, ['none'], [0, 1, 2, 3, 6, 7]],
      ['Nissan', 'Patrol', 2020, '4x4 / Tout-terrain', 'diesel', 'automatic', 7, 5, 'Beige', 140, 900, 3200, ['optional', 35, 220, 800], [0, 1, 2, 9, 11]],
      ['Toyota', 'Corolla', 2022, 'Berline', 'hybrid', 'automatic', 5, 4, 'Argent', 60, 380, 1350, ['none'], [0, 2, 3, 6, 7]],
      ['Ford', 'Transit', 2019, 'Utilitaire', 'diesel', 'manual', 3, 4, 'Blanc', 90, 560, 2000, ['none'], [0, 7]],
    ],
  },
];

const CONDITIONS =
  "• Âge minimum du conducteur : 23 ans, permis de plus de 2 ans.\n• Caution remboursable exigée à la remise des clés.\n• Kilométrage : 250 km/jour inclus.\n• Carburant : restitution avec le même niveau.\n• Pièce d'identité et permis de conduire valides obligatoires.";

async function seedDemo(admin, categories, features) {
  const pass = await auth.hashPassword('Demo@12345');
  const req = { user: admin, headers: {}, ip: '127.0.0.1' };
  const request = await m.PaymentMethod.findOne({ where: { code: 'request' } });
  const superAdmin = await m.User.findOne({ where: { role: ROLES.SUPER_ADMIN } });
  let hue = 30;

  for (const def of DEMO_COMPANIES) {
    const company = await m.Company.create({ ...def.company, slug: slugify(def.company.name) });
    const cAdmin = await m.User.create({ ...def.admin, companyId: company.id, role: ROLES.COMPANY_ADMIN, passwordHash: pass, status: 'active', emailVerifiedAt: new Date(), jobTitle: 'Directeur' });
    for (const t of def.team) await m.User.create({ ...t, companyId: company.id, passwordHash: pass, status: 'active', emailVerifiedAt: new Date() });

    // Demande de recharge validée par le Super Administrateur + une demande en attente
    const first = await payments.createTopup({ companyId: company.id, packs: def.packs, paymentMethodId: request.id, payerNote: 'Rechargement initial' }, { ...req, user: cAdmin });
    await payments.completePayment(first.payment.id, { adminNote: 'Paiement reçu' }, { ...req, user: superAdmin });
    await payments.createTopup({ companyId: company.id, packs: 1, paymentMethodId: request.id, payerNote: 'Dépôt M-Pesa 8XK2…' }, { ...req, user: cAdmin });

    for (const [idx, v] of def.vehicles.entries()) {
      const [brand, model, year, cat, fuelType, transmission, seats, doors, color, d, w, mo, [driverMode, dd, dw, dm], feats] = v;
      const vehicle = await m.Vehicle.create({
        companyId: company.id,
        categoryId: categories[cat].id,
        brand,
        model,
        year,
        fuelType,
        transmission,
        seats,
        doors,
        color,
        plateNumber: `${company.city === 'Kinshasa' ? 'KN' : 'LB'}${1000 + idx * 137}BC`,
        mileage: 15000 + idx * 12000,
        city: company.city,
        address: company.address,
        priceDaily: d,
        priceWeekly: w,
        priceMonthly: mo,
        currency: 'USD',
        driverMode,
        driverPriceDaily: dd ?? null,
        driverPriceWeekly: dw ?? null,
        driverPriceMonthly: dm ?? null,
        description: `${brand} ${model} ${year} en excellent état, entretenu régulièrement par nos soins. Idéal pour vos déplacements professionnels comme personnels. Véhicule propre, révisé et assuré.`,
        rentalConditions: CONDITIONS,
        availability: idx === 2 ? 'rented' : 'available',
        createdById: cAdmin.id,
      });
      await vehicle.setFeatures(feats.map((i) => features[i].id));
      await addDemoPhotos(vehicle, (hue += 37) % 360);
      // Les 4 premiers véhicules sont publiés (débit réel de crédits), le dernier reste en brouillon.
      if (idx < def.vehicles.length - 1) {
        try {
          await vehicleService.publish(vehicle.id, { ...req, user: cAdmin });
        } catch (e) {
          console.log(`[seed] ${brand} ${model} non publié : ${e.message}`);
        }
      }
    }

    // Un véhicule expire bientôt (démonstration des rappels et du renouvellement)
    const soon = await m.Vehicle.findOne({ where: { companyId: company.id, status: 'active' }, order: [['id', 'DESC']] });
    if (soon) await soon.update({ expiresAt: new Date(Date.now() + 5 * 86400000), publishedAt: addMonths(new Date(Date.now() + 5 * 86400000), -12) });
  }

  // Client de démonstration + consultations et contacts
  const client = await m.User.create({ firstName: 'Client', lastName: 'Démo', email: 'client@zwacar.com', phone: '+243820000003', role: ROLES.CLIENT, passwordHash: pass, status: 'active', emailVerifiedAt: new Date() });
  const active = await m.Vehicle.findAll({ where: { status: 'active' } });
  const channels = ['whatsapp', 'phone', 'email'];
  for (const [i, v] of active.entries()) {
    const views = 20 + ((i * 37) % 90);
    const rows = Array.from({ length: views }, (_, k) => ({ vehicleId: v.id, companyId: v.companyId, visitorHash: sha256(`${v.id}-${k}`), createdAt: new Date(Date.now() - (((k * 37 + i * 11) % 330) * 86400000 + k * 60000)) }));
    await m.VehicleView.bulkCreate(rows);
    const contacts = 3 + (i % 6);
    const crow = Array.from({ length: contacts }, (_, k) => ({
      vehicleId: v.id,
      companyId: v.companyId,
      userId: k === 0 ? client.id : null,
      channel: channels[(i + k) % 3],
      clientName: k === 0 ? 'Client Démo' : ['Aline M.', 'Joseph K.', 'Fiston B.', 'Nadine T.', 'Eric L.'][k % 5],
      clientPhone: '+24381000' + String(1000 + k * 7).slice(-4),
      status: ['new', 'in_progress', 'closed'][k % 3],
      createdAt: new Date(Date.now() - (((k * 47 + i * 13) % 300) * 86400000) - i * 3600000),
    }));
    await m.ContactEvent.bulkCreate(crow);
    await v.update({ viewsCount: views, contactsCount: contacts });
  }
  if (active[0]) await m.Favorite.create({ userId: client.id, vehicleId: active[0].id });
  console.log('[seed] données de démonstration créées');
}

async function main() {
  await m.sequelize.authenticate();
  await syncSchema();

  // Super administrateur
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@zwacar.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  if (config.isProd && (adminPassword === 'Admin@12345' || !/^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(adminPassword))) {
    throw new Error('En production, définissez SEED_ADMIN_PASSWORD (12 caractères minimum, lettres et chiffres)');
  }
  let admin = await m.User.findOne({ where: { email } });
  if (!admin) {
    admin = await m.User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email,
      role: ROLES.SUPER_ADMIN,
      passwordHash: await auth.hashPassword(adminPassword),
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    console.log(`[seed] super admin créé : ${email}`);
  }

  // Référentiels
  const categories = {};
  for (const [i, [name, icon, description]] of CATEGORIES.entries()) {
    const [c] = await m.Category.findOrCreate({ where: { slug: slugify(name) }, defaults: { name, icon, description, sortOrder: i } });
    categories[name] = c;
  }
  const features = [];
  for (const [name, icon] of FEATURES) {
    const [f] = await m.Feature.findOrCreate({ where: { slug: slugify(name) }, defaults: { name, icon } });
    features.push(f);
  }
  for (const pm of METHODS) await m.PaymentMethod.findOrCreate({ where: { code: pm.code }, defaults: pm });

  const demo = !args.includes('--no-demo') && !config.isProd && (await m.Company.count()) === 0;
  if (demo) await seedDemo(admin, categories, features);

  console.log('[seed] terminé');
  await new Promise((r) => setTimeout(r, 1500)); // laisse partir les journaux d'emails asynchrones
  await m.sequelize.close();
}

main().catch((e) => {
  console.error('[seed] erreur', e);
  process.exit(1);
});
