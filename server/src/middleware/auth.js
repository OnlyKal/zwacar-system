/**
 * Authentification JWT + contrôle d'accès basé sur les rôles (RBAC)
 * + isolation stricte des données par entreprise.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Company } = require('../models');
const { AppError, companyBlockedMessage } = require('../utils/helpers');
const { ROLES, ROLE_PERMISSIONS } = require('../utils/constants');

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  // Téléchargement de PDF via lien direct (window.open) : jeton court passé en query.
  if (req.query && typeof req.query.access_token === 'string') return req.query.access_token;
  return null;
}

async function loadUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret);
  } catch (e) {
    throw AppError.unauthorized(e.name === 'TokenExpiredError' ? 'Session expirée' : 'Jeton invalide');
  }
  // Rechargement systématique : une suspension prend effet immédiatement.
  const user = await User.findByPk(payload.sub, { include: [{ model: Company, as: 'company' }] });
  if (!user || user.status !== 'active') throw AppError.unauthorized('Compte inactif ou introuvable');
  if (user.companyId && user.company?.status !== 'active') throw AppError.forbidden(companyBlockedMessage(user.company?.status));
  return user;
}

/** Exige un utilisateur authentifié. */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized();
    req.user = await loadUser(token);
    next();
  } catch (e) {
    next(e);
  }
}

/** Authentification facultative (API publique : favoris, contacts liés au client). */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await loadUser(token);
  } catch {
    /* jeton invalide ignoré sur les routes publiques */
  }
  next();
}

const isSuperAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;

/** Restreint l'accès à certains rôles. */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) return next(AppError.forbidden());
  next();
};

/** Exige une permission (le super admin les possède toutes). */
const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (isSuperAdmin(req.user)) return next();
  const granted = ROLE_PERMISSIONS[req.user.role] || [];
  if (!perms.every((p) => granted.includes(p))) return next(AppError.forbidden("Vous n'avez pas la permission requise"));
  next();
};

/** Réservé au back-office (super admin + membres d'entreprise). Les clients sont exclus. */
const backOffice = (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role === ROLES.CLIENT) return next(AppError.forbidden('Espace réservé aux entreprises'));
  next();
};

/**
 * Isolation des données : renvoie l'identifiant d'entreprise à appliquer au filtre.
 * - Membre d'entreprise : toujours SA propre entreprise (toute tentative d'en cibler une autre est refusée).
 * - Super admin : l'entreprise demandée (ou null = toutes).
 */
function scopeCompanyId(req, requested) {
  const reqId = requested !== undefined && requested !== null && requested !== '' ? Number(requested) : null;
  if (isSuperAdmin(req.user)) return reqId;
  if (!req.user.companyId) throw AppError.forbidden();
  if (reqId && reqId !== req.user.companyId) throw AppError.forbidden('Accès aux données d’une autre entreprise interdit');
  return req.user.companyId;
}

/** Vérifie qu'une ressource appartient bien à l'entreprise de l'utilisateur. */
function assertOwnership(req, resource) {
  if (!resource) throw AppError.notFound();
  if (isSuperAdmin(req.user)) return resource;
  if (resource.companyId !== req.user.companyId) throw AppError.notFound(); // 404 : ne révèle pas l'existence
  return resource;
}

module.exports = { authenticate, optionalAuth, requireRole, requirePermission, backOffice, scopeCompanyId, assertOwnership, isSuperAdmin };
