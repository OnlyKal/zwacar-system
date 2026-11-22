/**
 * /api/users — gestion des comptes.
 *  - Super Administrateur : tous les comptes de la plateforme.
 *  - Administrateur d'entreprise : uniquement les collaborateurs de SON entreprise.
 */
const router = require('express').Router();
const Joi = require('joi');
const { Op } = require('sequelize');
const config = require('../config');
const { User, Company, RefreshToken } = require('../models');
const { authenticate, backOffice, requirePermission, scopeCompanyId, isSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const auth = require('../services/auth.service');
const email = require('../services/email.service');
const audit = require('../services/audit.service');
const { AppError, ah, paginate, paged } = require('../utils/helpers');
const { ROLES, COMPANY_ROLES, ROLE_LABELS, PERMISSIONS: P } = require('../utils/constants');

router.use(authenticate, backOffice);

/** Envoie l'email d'invitation (définition du mot de passe). */
async function sendInvite(user, inviter) {
  const token = await auth.createActionToken(user.id, 'invite', 7 * 86400000);
  const setPasswordUrl = `${config.webUrl}/reset-password?token=${token}&invite=1`;
  const company = user.companyId ? await Company.findByPk(user.companyId) : null;
  if (company) {
    email.queue('invite', user.email, { user, company, inviter: inviter ? `${inviter.firstName} ${inviter.lastName}` : null, setPasswordUrl, roleLabel: ROLE_LABELS[user.role] }, { companyId: company.id });
  } else {
    email.queue('welcome', user.email, { user, setPasswordUrl });
  }
}

/** Crée un utilisateur ; sans mot de passe, il reçoit une invitation par email. */
async function createUser(data, req) {
  const exists = await User.findOne({ where: { email: data.email } });
  if (exists) throw AppError.conflict('Un compte existe déjà avec cet email');
  const { password, ...rest } = data;
  const user = await User.create({
    ...rest,
    passwordHash: password ? await auth.hashPassword(password) : null,
    status: password ? 'active' : 'pending',
    emailVerifiedAt: password ? new Date() : null,
  });
  if (password) {
    const company = user.companyId ? await Company.findByPk(user.companyId) : null;
    email.queue('welcome', user.email, { user, company }, { companyId: user.companyId });
  } else {
    await sendInvite(user, req.user);
  }
  return user;
}

/** Chargement d'un utilisateur avec contrôle d'appartenance. */
async function loadManaged(req) {
  const user = await User.findByPk(req.params.id, { include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }] });
  if (!user) throw AppError.notFound('Utilisateur introuvable');
  if (!isSuperAdmin(req.user)) {
    if (user.companyId !== req.user.companyId) throw AppError.notFound('Utilisateur introuvable');
  }
  return user;
}

const userBody = {
  firstName: Joi.string().trim().min(2).max(80),
  lastName: Joi.string().trim().min(2).max(80),
  email: Joi.string().email().lowercase(),
  phone: Joi.string().trim().max(40).allow('', null),
  jobTitle: Joi.string().trim().max(100).allow('', null),
  role: Joi.string().valid(...Object.values(ROLES)),
  companyId: Joi.number().integer().allow(null),
  password: Joi.string().pattern(auth.PASSWORD_RULE).allow('', null).messages({ 'string.pattern.base': 'Mot de passe : 8 caractères minimum, avec lettre et chiffre' }),
};

/* ---------------- Liste ---------------- */
router.get(
  '/',
  requirePermission(P.TEAM_VIEW),
  ah(async (req, res) => {
    const pg = paginate(req.query);
    const where = {};
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.role) where.role = req.query.role;
    if (req.query.status) where.status = req.query.status;
    if (req.query.type === 'clients') where.role = ROLES.CLIENT;
    if (req.query.type === 'staff') where.role = { [Op.ne]: ROLES.CLIENT };
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [{ firstName: { [Op.like]: q } }, { lastName: { [Op.like]: q } }, { email: { [Op.like]: q } }, { phone: { [Op.like]: q } }];
    }
    const { rows, count } = await User.findAndCountAll({
      where,
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: pg.limit,
      offset: pg.offset,
    });
    res.json(paged(rows.map((u) => ({ ...u.toJSON(), roleLabel: ROLE_LABELS[u.role] })), count, pg));
  })
);

router.get('/roles', (req, res) => {
  const roles = isSuperAdmin(req.user) ? Object.values(ROLES) : COMPANY_ROLES;
  res.json({ data: roles.map((r) => ({ value: r, label: ROLE_LABELS[r] })) });
});

router.get(
  '/:id',
  requirePermission(P.TEAM_VIEW),
  ah(async (req, res) => {
    const user = await loadManaged(req);
    res.json({ data: { ...user.toJSON(), roleLabel: ROLE_LABELS[user.role] } });
  })
);

/* ---------------- Création ---------------- */
router.post(
  '/',
  requirePermission(P.TEAM_MANAGE),
  validate(Joi.object({ ...userBody, firstName: userBody.firstName.required(), lastName: userBody.lastName.required(), email: userBody.email.required(), role: userBody.role.required() })),
  ah(async (req, res) => {
    const data = { ...req.body };
    if (isSuperAdmin(req.user)) {
      if (COMPANY_ROLES.includes(data.role)) {
        if (!data.companyId) throw AppError.badRequest('Entreprise requise pour ce rôle');
        if (!(await Company.findByPk(data.companyId))) throw AppError.badRequest('Entreprise introuvable');
      } else {
        data.companyId = null;
      }
    } else {
      // Un membre d'entreprise ne peut créer que des collaborateurs de sa propre entreprise.
      if (!COMPANY_ROLES.includes(data.role)) throw AppError.forbidden('Rôle non autorisé');
      data.companyId = req.user.companyId;
    }
    const user = await createUser(data, req);
    audit.log(req, 'user.create', { entityType: 'user', entityId: user.id, companyId: user.companyId, description: `Création de ${user.email} (${ROLE_LABELS[user.role]})` });
    res.status(201).json({ data: user, invited: !data.password });
  })
);

/* ---------------- Modification ---------------- */
router.patch(
  '/:id',
  requirePermission(P.TEAM_MANAGE),
  validate(Joi.object({ ...userBody, status: Joi.string().valid('active', 'suspended') })),
  ah(async (req, res) => {
    const user = await loadManaged(req);
    const data = { ...req.body };
    delete data.password;
    if (!isSuperAdmin(req.user)) {
      delete data.companyId;
      if (data.role && !COMPANY_ROLES.includes(data.role)) throw AppError.forbidden('Rôle non autorisé');
    } else if (data.role) {
      if (COMPANY_ROLES.includes(data.role) && !(data.companyId ?? user.companyId)) throw AppError.badRequest('Entreprise requise pour ce rôle');
      if (!COMPANY_ROLES.includes(data.role)) data.companyId = null;
    }
    if (user.id === req.user.id && (data.status === 'suspended' || (data.role && data.role !== user.role))) {
      throw AppError.badRequest('Vous ne pouvez pas modifier votre propre rôle ou statut');
    }
    // Préserve au moins un administrateur actif dans l'entreprise.
    if (user.role === ROLES.COMPANY_ADMIN && ((data.role && data.role !== ROLES.COMPANY_ADMIN) || data.status === 'suspended')) {
      const admins = await User.count({ where: { companyId: user.companyId, role: ROLES.COMPANY_ADMIN, status: 'active' } });
      if (admins <= 1) throw AppError.badRequest("L'entreprise doit conserver au moins un administrateur actif");
    }
    if (data.email && data.email !== user.email && (await User.findOne({ where: { email: data.email } }))) throw AppError.conflict('Email déjà utilisé');
    if (user.status === 'pending' && data.status === 'active') delete data.status; // l'activation passe par l'invitation
    await user.update(data);
    if (data.status === 'suspended') await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });
    audit.log(req, 'user.update', { entityType: 'user', entityId: user.id, companyId: user.companyId, description: `Modification de ${user.email}`, metadata: { fields: Object.keys(data) } });
    res.json({ data: user });
  })
);

router.post(
  '/:id/resend-invite',
  requirePermission(P.TEAM_MANAGE),
  ah(async (req, res) => {
    const user = await loadManaged(req);
    if (user.status !== 'pending') throw AppError.badRequest('Ce compte est déjà activé');
    await sendInvite(user, req.user);
    audit.log(req, 'user.resend_invite', { entityType: 'user', entityId: user.id, companyId: user.companyId, description: `Invitation renvoyée à ${user.email}` });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/send-reset',
  requirePermission(P.TEAM_MANAGE),
  ah(async (req, res) => {
    const user = await loadManaged(req);
    const token = await auth.createActionToken(user.id, 'reset_password', 3600000);
    email.queue('passwordReset', user.email, { user, resetUrl: `${config.webUrl}/reset-password?token=${token}` });
    audit.log(req, 'user.send_reset', { entityType: 'user', entityId: user.id, companyId: user.companyId, description: `Lien de réinitialisation envoyé à ${user.email}` });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  requirePermission(P.TEAM_MANAGE),
  ah(async (req, res) => {
    const user = await loadManaged(req);
    if (user.id === req.user.id) throw AppError.badRequest('Vous ne pouvez pas supprimer votre propre compte');
    if (user.role === ROLES.SUPER_ADMIN && (await User.count({ where: { role: ROLES.SUPER_ADMIN } })) <= 1) throw AppError.badRequest('Impossible de supprimer le dernier super administrateur');
    if (user.role === ROLES.COMPANY_ADMIN && (await User.count({ where: { companyId: user.companyId, role: ROLES.COMPANY_ADMIN } })) <= 1) {
      throw AppError.badRequest("Impossible de supprimer le dernier administrateur de l'entreprise");
    }
    await user.destroy();
    audit.log(req, 'user.delete', { entityType: 'user', entityId: user.id, companyId: user.companyId, description: `Suppression de ${user.email}` });
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports.createUser = createUser;
