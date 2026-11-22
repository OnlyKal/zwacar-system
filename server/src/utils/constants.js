/**
 * Rôles, permissions (RBAC) et énumérations partagées.
 */
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  MANAGER: 'manager',
  ACCOUNTANT: 'accountant',
  DRIVER: 'driver',
  AGENT: 'agent',
  CLIENT: 'client',
};

/** Rôles qu'une entreprise peut attribuer à ses collaborateurs. */
const COMPANY_ROLES = [ROLES.COMPANY_ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.DRIVER, ROLES.AGENT];

const ROLE_LABELS = {
  super_admin: 'Super Administrateur',
  company_admin: "Administrateur d'entreprise",
  manager: 'Gestionnaire',
  accountant: 'Comptable',
  driver: 'Chauffeur',
  agent: 'Agent commercial',
  client: 'Client',
};

const PERMISSIONS = {
  COMPANY_VIEW: 'company:view',
  COMPANY_UPDATE: 'company:update',
  TEAM_VIEW: 'team:view',
  TEAM_MANAGE: 'team:manage',
  VEHICLES_VIEW: 'vehicles:view',
  VEHICLES_MANAGE: 'vehicles:manage',
  VEHICLES_PUBLISH: 'vehicles:publish',
  CONTACTS_VIEW: 'contacts:view',
  CONTACTS_MANAGE: 'contacts:manage',
  WALLET_VIEW: 'wallet:view',
  WALLET_TOPUP: 'wallet:topup',
  REPORTS_VIEW: 'reports:view',
  STATS_VIEW: 'stats:view',
};

const P = PERMISSIONS;
const ROLE_PERMISSIONS = {
  // Le super admin passe tous les contrôles (voir middleware rbac).
  super_admin: Object.values(P),
  company_admin: Object.values(P),
  manager: [P.COMPANY_VIEW, P.TEAM_VIEW, P.VEHICLES_VIEW, P.VEHICLES_MANAGE, P.VEHICLES_PUBLISH, P.CONTACTS_VIEW, P.CONTACTS_MANAGE, P.WALLET_VIEW, P.REPORTS_VIEW, P.STATS_VIEW],
  accountant: [P.COMPANY_VIEW, P.VEHICLES_VIEW, P.WALLET_VIEW, P.WALLET_TOPUP, P.REPORTS_VIEW, P.STATS_VIEW],
  agent: [P.COMPANY_VIEW, P.VEHICLES_VIEW, P.CONTACTS_VIEW, P.CONTACTS_MANAGE, P.STATS_VIEW],
  driver: [P.COMPANY_VIEW, P.VEHICLES_VIEW],
  client: [],
};

const VEHICLE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected',
};

const AVAILABILITY = { AVAILABLE: 'available', RENTED: 'rented', MAINTENANCE: 'maintenance' };
const DRIVER_MODES = { NONE: 'none', OPTIONAL: 'optional', INCLUDED: 'included' };

/** Valeurs par défaut des paramètres de plateforme (modifiables par le super admin). */
const DEFAULT_SETTINGS = {
  general: {
    platformName: 'ZwaCar',
    supportEmail: 'support@zwacar.com',
    supportPhone: '+243 000 000 000',
    address: 'Kinshasa, RD Congo',
    currency: 'USD',
    requireVehicleApproval: false,
    allowClientRegistration: true,
  },
  billing: {
    packPriceUsd: 15, // 15 USD
    packCredits: 20, // = 20 crédits
    publishCost: 12, // 1 véhicule = 12 crédits
    validityMonths: 12, // validité de 12 mois
    reminderDays: [30, 7], // notifications avant expiration
    minTopupPacks: 1,
    maxTopupPacks: 100,
  },
};

module.exports = { ROLES, COMPANY_ROLES, ROLE_LABELS, PERMISSIONS, ROLE_PERMISSIONS, VEHICLE_STATUS, AVAILABILITY, DRIVER_MODES, DEFAULT_SETTINGS };
