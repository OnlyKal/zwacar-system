/**
 * Émission et rotation des jetons, jetons d'action (reset / invitation / vérification).
 *
 * - Access token JWT court (15 min par défaut) envoyé en header Authorization.
 * - Refresh token opaque (aléatoire), stocké HACHÉ en base, à rotation à chaque usage.
 *   Réutilisation d'un refresh token révoqué ⇒ toutes les sessions de l'utilisateur sont révoquées.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const config = require('../config');
const { RefreshToken, ActionToken, User, Company } = require('../models');
const { AppError, sha256, randomToken, clientIp, mediaUrl, companyBlockedMessage } = require('../utils/helpers');
const { ROLE_PERMISSIONS, ROLE_LABELS } = require('../utils/constants');

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const hashPassword = (p) => bcrypt.hash(p, 12);
const checkPassword = (p, h) => (h ? bcrypt.compare(p, h) : Promise.resolve(false));

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, cid: user.companyId || null }, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });
}

async function issueTokens(user, req) {
  const refreshToken = randomToken(48);
  await RefreshToken.create({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
    userAgent: req.headers['user-agent']?.slice(0, 255),
    ip: clientIp(req),
  });
  return { accessToken: signAccess(user), refreshToken, expiresIn: config.jwt.accessTtl };
}

async function rotate(oldToken, req) {
  const row = await RefreshToken.findOne({ where: { tokenHash: sha256(oldToken) } });
  if (!row) throw AppError.unauthorized('Session invalide');
  if (row.revokedAt) {
    // Détection de réutilisation : probable vol de jeton → on coupe toutes les sessions.
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: row.userId, revokedAt: null } });
    throw AppError.unauthorized('Session révoquée');
  }
  if (new Date(row.expiresAt) < new Date()) throw AppError.unauthorized('Session expirée');
  const user = await User.findByPk(row.userId, { include: [{ model: Company, as: 'company' }] });
  if (!user || user.status !== 'active') throw AppError.unauthorized('Compte inactif');
  if (user.companyId && user.company?.status !== 'active') throw AppError.forbidden(companyBlockedMessage(user.company?.status));
  await row.update({ revokedAt: new Date() });
  return { user, tokens: await issueTokens(user, req) };
}

async function revoke(token) {
  if (!token) return;
  await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: sha256(token), revokedAt: null } });
}

const revokeAll = (userId) => RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });

/** Crée un jeton à usage unique et renvoie sa valeur en clair (à placer dans un lien email). */
async function createActionToken(userId, type, ttlMs) {
  await ActionToken.update({ usedAt: new Date() }, { where: { userId, type, usedAt: null } });
  const token = randomToken(32);
  await ActionToken.create({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeActionToken(token, types) {
  const row = await ActionToken.findOne({
    where: { tokenHash: sha256(token), type: { [Op.in]: types }, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!row) throw AppError.badRequest('Lien invalide ou expiré');
  await row.update({ usedAt: new Date() });
  return row;
}

/** Représentation de l'utilisateur renvoyée au frontend. */
function profile(user) {
  const u = user.toJSON ? user.toJSON() : user;
  delete u.passwordHash;
  delete u.failedLogins;
  delete u.lockedUntil;
  return {
    ...u,
    roleLabel: ROLE_LABELS[u.role],
    permissions: ROLE_PERMISSIONS[u.role] || [],
    company: u.company
      ? { id: u.company.id, name: u.company.name, logoUrl: mediaUrl(u.company.logoUrl), status: u.company.status, walletBalance: u.company.walletBalance }
      : null,
  };
}

module.exports = { PASSWORD_RULE, hashPassword, checkPassword, issueTokens, rotate, revoke, revokeAll, createActionToken, consumeActionToken, profile };
