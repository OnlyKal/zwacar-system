/**
 * Modèles de données (Sequelize) et associations.
 *
 * Hiérarchie : Super Administrateur → Entreprises → Clients.
 * Toute donnée appartenant à une entreprise porte une colonne `company_id`
 * utilisée par la couche d'accès pour garantir l'isolation.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { ROLES, VEHICLE_STATUS, AVAILABILITY, DRIVER_MODES } = require('../utils/constants');

const base = { underscored: true };

/* ------------------------------------------------------------------ */
/* Entreprises                                                         */
/* ------------------------------------------------------------------ */
const Company = sequelize.define(
  'Company',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    slug: { type: DataTypes.STRING(170), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(190), allowNull: false },
    phone: { type: DataTypes.STRING(40) },
    whatsapp: { type: DataTypes.STRING(40) },
    website: { type: DataTypes.STRING(190) },
    address: { type: DataTypes.STRING(255) },
    city: { type: DataTypes.STRING(100) },
    country: { type: DataTypes.STRING(100) },
    taxId: { type: DataTypes.STRING(80) },
    description: { type: DataTypes.TEXT },
    logoUrl: { type: DataTypes.STRING(255) },
    // pending = inscription en attente de validation ; rejected = inscription refusée
    status: { type: DataTypes.ENUM('pending', 'active', 'suspended', 'rejected'), allowNull: false, defaultValue: 'active' },
    suspendedReason: { type: DataTypes.STRING(255) },
    // Solde du wallet en crédits (entier — jamais de flottant pour de la monnaie interne)
    walletBalance: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    autoRenewDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { ...base, tableName: 'companies' }
);

/* ------------------------------------------------------------------ */
/* Utilisateurs                                                        */
/* ------------------------------------------------------------------ */
const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    firstName: { type: DataTypes.STRING(80), allowNull: false },
    lastName: { type: DataTypes.STRING(80), allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(40) },
    passwordHash: { type: DataTypes.STRING(100) },
    role: { type: DataTypes.ENUM(...Object.values(ROLES)), allowNull: false },
    jobTitle: { type: DataTypes.STRING(100) },
    status: { type: DataTypes.ENUM('active', 'suspended', 'pending'), allowNull: false, defaultValue: 'active' },
    emailVerifiedAt: { type: DataTypes.DATE },
    lastLoginAt: { type: DataTypes.DATE },
    failedLogins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE },
  },
  {
    ...base,
    tableName: 'users',
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  }
);

const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE },
    userAgent: { type: DataTypes.STRING(255) },
    ip: { type: DataTypes.STRING(64) },
  },
  { ...base, tableName: 'refresh_tokens' }
);

/** Jetons à usage unique : réinitialisation, invitation, vérification email. */
const ActionToken = sequelize.define(
  'ActionToken',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('reset_password', 'invite', 'verify_email'), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE },
  },
  { ...base, tableName: 'action_tokens' }
);

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */
const Category = sequelize.define(
  'Category',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    icon: { type: DataTypes.STRING(60) },
    description: { type: DataTypes.STRING(255) },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { ...base, tableName: 'categories' }
);

const Feature = sequelize.define(
  'Feature',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    icon: { type: DataTypes.STRING(60) },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { ...base, tableName: 'features' }
);

/* ------------------------------------------------------------------ */
/* Véhicules                                                           */
/* ------------------------------------------------------------------ */
const Vehicle = sequelize.define(
  'Vehicle',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    categoryId: { type: DataTypes.INTEGER },
    brand: { type: DataTypes.STRING(80), allowNull: false },
    model: { type: DataTypes.STRING(80), allowNull: false },
    year: { type: DataTypes.INTEGER },
    fuelType: { type: DataTypes.ENUM('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other') },
    transmission: { type: DataTypes.ENUM('manual', 'automatic') },
    seats: { type: DataTypes.INTEGER },
    doors: { type: DataTypes.INTEGER },
    color: { type: DataTypes.STRING(50) },
    plateNumber: { type: DataTypes.STRING(30) },
    mileage: { type: DataTypes.INTEGER },
    city: { type: DataTypes.STRING(100) },
    address: { type: DataTypes.STRING(255) },
    priceDaily: { type: DataTypes.DECIMAL(12, 2) },
    priceWeekly: { type: DataTypes.DECIMAL(12, 2) },
    priceMonthly: { type: DataTypes.DECIMAL(12, 2) },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    // Offre chauffeur : none = sans chauffeur, optional = chauffeur en option (supplément),
    // included = toujours avec chauffeur (inclus dans le tarif).
    driverMode: { type: DataTypes.ENUM(...Object.values(DRIVER_MODES)), allowNull: false, defaultValue: 'none' },
    driverPriceDaily: { type: DataTypes.DECIMAL(12, 2) },
    driverPriceWeekly: { type: DataTypes.DECIMAL(12, 2) },
    driverPriceMonthly: { type: DataTypes.DECIMAL(12, 2) },
    // Dérivé de driverMode (location possible avec chauffeur) — conservé pour la recherche.
    withDriver: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    description: { type: DataTypes.TEXT },
    rentalConditions: { type: DataTypes.TEXT },
    availability: { type: DataTypes.ENUM(...Object.values(AVAILABILITY)), allowNull: false, defaultValue: 'available' },
    status: { type: DataTypes.ENUM(...Object.values(VEHICLE_STATUS)), allowNull: false, defaultValue: 'draft' },
    statusReason: { type: DataTypes.STRING(255) },
    publishedAt: { type: DataTypes.DATE },
    expiresAt: { type: DataTypes.DATE },
    autoRenew: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    expiryReminderSentAt: { type: DataTypes.DATE },
    // Palier (en jours) du dernier rappel d'expiration envoyé pour le cycle en cours
    lastReminderDays: { type: DataTypes.INTEGER },
    // Nombre de publications payées : sert de clé d'idempotence pour la publication
    publicationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    viewsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    contactsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdById: { type: DataTypes.INTEGER },
  },
  {
    ...base,
    tableName: 'vehicles',
    indexes: [{ fields: ['company_id'] }, { fields: ['status', 'expires_at'] }, { fields: ['category_id'] }],
    hooks: {
      beforeSave(v) {
        v.withDriver = v.driverMode !== DRIVER_MODES.NONE;
        // Les suppléments chauffeur n'ont de sens qu'en mode « en option ».
        if (v.driverMode !== DRIVER_MODES.OPTIONAL) {
          v.driverPriceDaily = null;
          v.driverPriceWeekly = null;
          v.driverPriceMonthly = null;
        }
      },
    },
  }
);

const VehicleMedia = sequelize.define(
  'VehicleMedia',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vehicleId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('photo', 'video'), allowNull: false },
    path: { type: DataTypes.STRING(255), allowNull: false },
    thumbPath: { type: DataTypes.STRING(255) },
    mimeType: { type: DataTypes.STRING(60) },
    sizeBytes: { type: DataTypes.INTEGER },
    width: { type: DataTypes.INTEGER },
    height: { type: DataTypes.INTEGER },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { ...base, tableName: 'vehicle_media' }
);

const VehicleFeature = sequelize.define('VehicleFeature', {}, { ...base, tableName: 'vehicle_features', timestamps: false });

/** Historique des événements d'un véhicule (publication, renouvellement, expiration…). */
const VehicleEvent = sequelize.define(
  'VehicleEvent',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vehicleId: { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    type: {
      type: DataTypes.ENUM('published', 'approved', 'rejected', 'renewed', 'renewal_failed', 'expired', 'reminder', 'suspended', 'reactivated'),
      allowNull: false,
    },
    details: { type: DataTypes.STRING(255) },
  },
  { ...base, tableName: 'vehicle_events', updatedAt: false }
);

const VehicleView = sequelize.define(
  'VehicleView',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vehicleId: { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    visitorHash: { type: DataTypes.STRING(64) },
  },
  { ...base, tableName: 'vehicle_views', updatedAt: false, indexes: [{ fields: ['company_id', 'created_at'] }] }
);

/** Contacts générés : un client a contacté le propriétaire (WhatsApp, appel, email). */
const ContactEvent = sequelize.define(
  'ContactEvent',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vehicleId: { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER },
    channel: { type: DataTypes.ENUM('whatsapp', 'phone', 'email'), allowNull: false },
    clientName: { type: DataTypes.STRING(120) },
    clientPhone: { type: DataTypes.STRING(40) },
    clientEmail: { type: DataTypes.STRING(190) },
    message: { type: DataTypes.TEXT },
    // Demande du client au moment du contact (estimation indicative)
    withDriver: { type: DataTypes.BOOLEAN },
    rentalDays: { type: DataTypes.INTEGER },
    estimatedTotal: { type: DataTypes.DECIMAL(12, 2) },
    status: { type: DataTypes.ENUM('new', 'in_progress', 'closed'), allowNull: false, defaultValue: 'new' },
    visitorHash: { type: DataTypes.STRING(64) },
  },
  { ...base, tableName: 'contact_events', indexes: [{ fields: ['company_id', 'created_at'] }] }
);

const Favorite = sequelize.define(
  'Favorite',
  {
    userId: { type: DataTypes.INTEGER, primaryKey: true },
    vehicleId: { type: DataTypes.INTEGER, primaryKey: true },
  },
  { ...base, tableName: 'favorites', updatedAt: false }
);

/* ------------------------------------------------------------------ */
/* Wallet, crédits et paiements                                        */
/* ------------------------------------------------------------------ */
const PaymentMethod = sequelize.define(
  'PaymentMethod',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    // 'manual' (validation par l'admin), 'sandbox' (test), 'flexpay_mobile' (Mobile Money en ligne, vérifié).
    provider: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'manual' },
    instructions: { type: DataTypes.TEXT },
    icon: { type: DataTypes.STRING(60) },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { ...base, tableName: 'payment_methods' }
);

const Payment = sequelize.define(
  'Payment',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reference: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    invoiceNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    paymentMethodId: { type: DataTypes.INTEGER },
    methodName: { type: DataTypes.STRING(100) },
    // Montant payé (net, après remise)
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    // Montant avant remise et taux de remise appliqué (achat en volume)
    grossAmount: { type: DataTypes.DECIMAL(12, 2) },
    discountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    // Référence de transaction, toujours générée par le système (jamais saisie) :
    // numéro de commande FlexPay (Mobile Money) ou TRX-… à la validation d'une demande.
    providerReference: { type: DataTypes.STRING(120) },
    // Référence de l'opérateur Mobile Money (M-Pesa, Orange…) renvoyée par FlexPay
    operatorReference: { type: DataTypes.STRING(120) },
    payerNote: { type: DataTypes.STRING(255) },
    payerPhone: { type: DataTypes.STRING(20) },
    // Motif d'échec ou anomalie détectée lors de la vérification fournisseur
    failureReason: { type: DataTypes.STRING(255) },
    adminNote: { type: DataTypes.STRING(255) },
    paidAt: { type: DataTypes.DATE },
    createdById: { type: DataTypes.INTEGER },
    processedById: { type: DataTypes.INTEGER },
  },
  { ...base, tableName: 'payments', indexes: [{ fields: ['company_id', 'created_at'] }, { fields: ['status'] }] }
);

/**
 * Grand livre des crédits. Chaque mouvement est immuable.
 * `idempotencyKey` (unique) empêche physiquement les doubles débits.
 */
const CreditTransaction = sequelize.define(
  'CreditTransaction',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reference: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    idempotencyKey: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('topup', 'publish', 'renewal', 'refund', 'adjustment'), allowNull: false },
    // Montant signé : positif = crédit, négatif = débit
    amount: { type: DataTypes.INTEGER, allowNull: false },
    balanceBefore: { type: DataTypes.INTEGER, allowNull: false },
    balanceAfter: { type: DataTypes.INTEGER, allowNull: false },
    vehicleId: { type: DataTypes.INTEGER },
    paymentId: { type: DataTypes.INTEGER },
    description: { type: DataTypes.STRING(255) },
    createdById: { type: DataTypes.INTEGER },
  },
  { ...base, tableName: 'credit_transactions', updatedAt: false, indexes: [{ fields: ['company_id', 'created_at'] }, { fields: ['type'] }] }
);

/* ------------------------------------------------------------------ */
/* Plateforme                                                          */
/* ------------------------------------------------------------------ */
const Setting = sequelize.define(
  'Setting',
  {
    key: { type: DataTypes.STRING(80), primaryKey: true },
    value: { type: DataTypes.TEXT },
    encrypted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { ...base, tableName: 'settings' }
);

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER },
    companyId: { type: DataTypes.INTEGER },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entityType: { type: DataTypes.STRING(50) },
    entityId: { type: DataTypes.STRING(50) },
    description: { type: DataTypes.STRING(255) },
    metadata: { type: DataTypes.JSON },
    ip: { type: DataTypes.STRING(64) },
    userAgent: { type: DataTypes.STRING(255) },
  },
  { ...base, tableName: 'audit_logs', updatedAt: false, indexes: [{ fields: ['company_id', 'created_at'] }, { fields: ['action'] }] }
);

const EmailLog = sequelize.define(
  'EmailLog',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    to: { type: DataTypes.STRING(190), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    template: { type: DataTypes.STRING(60) },
    status: { type: DataTypes.ENUM('sent', 'failed', 'skipped'), allowNull: false },
    error: { type: DataTypes.STRING(500) },
    companyId: { type: DataTypes.INTEGER },
  },
  { ...base, tableName: 'email_logs', updatedAt: false }
);

/* ------------------------------------------------------------------ */
/* Associations                                                        */
/* ------------------------------------------------------------------ */
Company.hasMany(User, { foreignKey: 'companyId', as: 'users' });
User.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(ActionToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
ActionToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Company.hasMany(Vehicle, { foreignKey: 'companyId', as: 'vehicles' });
Vehicle.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Vehicle.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.hasMany(Vehicle, { foreignKey: 'categoryId', as: 'vehicles' });
Vehicle.hasMany(VehicleMedia, { foreignKey: 'vehicleId', as: 'media', onDelete: 'CASCADE' });
VehicleMedia.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });
Vehicle.belongsToMany(Feature, { through: VehicleFeature, as: 'features', foreignKey: 'vehicleId', otherKey: 'featureId' });
Feature.belongsToMany(Vehicle, { through: VehicleFeature, as: 'vehicles', foreignKey: 'featureId', otherKey: 'vehicleId' });
Vehicle.hasMany(VehicleEvent, { foreignKey: 'vehicleId', as: 'events', onDelete: 'CASCADE' });
VehicleEvent.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });
Vehicle.hasMany(ContactEvent, { foreignKey: 'vehicleId', as: 'contacts', onDelete: 'CASCADE' });
ContactEvent.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });
Vehicle.hasMany(VehicleView, { foreignKey: 'vehicleId', onDelete: 'CASCADE' });
Vehicle.hasMany(Favorite, { foreignKey: 'vehicleId', onDelete: 'CASCADE' });
Favorite.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });

Company.hasMany(Payment, { foreignKey: 'companyId', as: 'payments' });
Payment.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Payment.belongsTo(PaymentMethod, { foreignKey: 'paymentMethodId', as: 'paymentMethod' });
Company.hasMany(CreditTransaction, { foreignKey: 'companyId', as: 'creditTransactions' });
CreditTransaction.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CreditTransaction.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle', constraints: false });
CreditTransaction.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment', constraints: false });

AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
AuditLog.belongsTo(Company, { foreignKey: 'companyId', as: 'company', constraints: false });

/** Notifications internes (cloche du Web Admin). Une ligne par destinataire. */
const Notification = sequelize.define(
  'Notification',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(60), allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.STRING(500) },
    link: { type: DataTypes.STRING(255) },
    companyId: { type: DataTypes.INTEGER },
    // Clé d'unicité par destinataire : évite les doublons (ex. callbacks répétés)
    dedupeKey: { type: DataTypes.STRING(120) },
    readAt: { type: DataTypes.DATE },
  },
  { ...base, tableName: 'notifications', indexes: [{ fields: ['user_id', 'read_at'] }, { unique: true, fields: ['user_id', 'dedupe_key'] }] }
);

module.exports = {
  Notification,
  sequelize,
  Company,
  User,
  RefreshToken,
  ActionToken,
  Category,
  Feature,
  Vehicle,
  VehicleMedia,
  VehicleFeature,
  VehicleEvent,
  VehicleView,
  ContactEvent,
  Favorite,
  PaymentMethod,
  Payment,
  CreditTransaction,
  Setting,
  AuditLog,
  EmailLog,
};
