/**
 * /api/auth — connexion, inscription client, sessions, mot de passe oublié, profil.
 */
const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { User, Company, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const auth = require('../services/auth.service');
const email = require('../services/email.service');
const settings = require('../services/settings.service');
const audit = require('../services/audit.service');
const { AppError, ah, slugify, randomToken, companyBlockedMessage } = require('../utils/helpers');
const notifications = require('../services/notification.service');
const { ROLES } = require('../utils/constants');

const REFRESH_COOKIE = 'zw_rt';
const cookieOpts = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: config.jwt.refreshTtlDays * 86400000,
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Trop de tentatives, réessayez dans quelques minutes' } } });
const mailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.isTest ? 1000 : 8, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Trop de demandes, réessayez plus tard' } } });

const password = Joi.string().pattern(auth.PASSWORD_RULE).required().messages({ 'string.pattern.base': 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre' });

const withCompany = { include: [{ model: Company, as: 'company' }] };

async function respondWithSession(res, req, user) {
  const tokens = await auth.issueTokens(user, req);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts());
  res.json({ user: auth.profile(user), ...tokens });
}

/* ---------------- Connexion ---------------- */
router.post(
  '/login',
  loginLimiter,
  validate(Joi.object({ email: Joi.string().email().required(), password: Joi.string().required(), scope: Joi.string().valid('backoffice', 'client') })),
  ah(async (req, res) => {
    const user = await User.scope('withPassword').findOne({ where: { email: req.body.email.toLowerCase() }, ...withCompany });
    const invalid = AppError.unauthorized('Email ou mot de passe incorrect');
    if (!user) throw invalid;
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) throw AppError.forbidden('Compte temporairement verrouillé suite à plusieurs échecs. Réessayez dans 15 minutes.');

    if (!(await auth.checkPassword(req.body.password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      await user.update({ failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60000) : null });
      audit.log(req, 'auth.login_failed', { userId: user.id, companyId: user.companyId, entityType: 'user', entityId: user.id, description: `Échec de connexion (${failed})` });
      throw invalid;
    }
    if (user.status !== 'active') throw AppError.forbidden(user.status === 'pending' ? 'Compte non activé : consultez l’email d’invitation' : 'Compte suspendu');
    if (user.companyId && user.company?.status !== 'active') {
      throw AppError.forbidden(user.company?.status === 'suspended' ? 'Votre entreprise est suspendue. Contactez le support.' : companyBlockedMessage(user.company?.status));
    }
    if (req.body.scope === 'backoffice' && user.role === ROLES.CLIENT) throw AppError.forbidden('Ce compte client ne peut pas accéder au Web Admin');

    await user.update({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    audit.log(req, 'auth.login', { userId: user.id, companyId: user.companyId, entityType: 'user', entityId: user.id, description: 'Connexion' });
    await respondWithSession(res, req, user);
  })
);

/* ---------------- Inscription d'une entreprise (page publique du Web Admin) ---------------- */
router.post(
  '/register-company',
  mailLimiter,
  validate(
    Joi.object({
      company: Joi.object({
        name: Joi.string().trim().min(2).max(150).required(),
        email: Joi.string().email().lowercase().required(),
        phone: Joi.string().trim().min(6).max(40).required(),
        whatsapp: Joi.string().trim().max(40).allow('', null),
        city: Joi.string().trim().min(2).max(100).required(),
        country: Joi.string().trim().max(100).allow('', null),
        address: Joi.string().trim().max(255).allow('', null),
        taxId: Joi.string().trim().max(80).allow('', null),
      }).required(),
      admin: Joi.object({
        firstName: Joi.string().trim().min(2).max(80).required(),
        lastName: Joi.string().trim().min(2).max(80).required(),
        email: Joi.string().email().lowercase().required(),
        phone: Joi.string().trim().max(40).allow('', null),
        password,
      }).required(),
      acceptTerms: Joi.boolean().valid(true).required().messages({ 'any.only': 'Vous devez accepter les conditions d’utilisation' }),
      // Champ piège invisible : rempli uniquement par les robots.
      website: Joi.string().allow('').max(0).messages({ 'string.max': 'Requête refusée' }),
    })
  ),
  ah(async (req, res) => {
    const general = await settings.get('general');
    if (!general.allowCompanyRegistration) throw AppError.forbidden('Les inscriptions d’entreprises sont momentanément fermées');
    const { company: c, admin: a } = req.body;
    if (await User.findOne({ where: { email: a.email } })) throw AppError.conflict('Un compte existe déjà avec l’email de l’administrateur', [{ field: 'admin.email', message: 'Email déjà utilisé' }]);
    const pending = Boolean(general.requireCompanyApproval);

    let slug = slugify(c.name) || 'entreprise';
    while (await Company.findOne({ where: { slug } })) slug = `${slugify(c.name) || 'entreprise'}-${randomToken(2)}`;

    const { company, user } = await sequelize.transaction(async (t) => {
      const company = await Company.create({ ...c, country: c.country || 'RD Congo', whatsapp: c.whatsapp || c.phone, slug, status: pending ? 'pending' : 'active' }, { transaction: t });
      const user = await User.create(
        { ...a, passwordHash: await auth.hashPassword(a.password), role: ROLES.COMPANY_ADMIN, companyId: company.id, status: 'active', emailVerifiedAt: null },
        { transaction: t }
      );
      return { company, user };
    });

    email.queue('companyRegistered', [...new Set([company.email, user.email])].join(','), { company, user, pending }, { companyId: company.id });
    await notifications.notifySuperAdmins({
      type: 'company.registered',
      title: pending ? 'Nouvelle entreprise à valider' : 'Nouvelle entreprise inscrite',
      message: `${company.name} (${company.city}) — ${user.firstName} ${user.lastName}, ${user.email}, ${company.phone}.${pending ? ' Validez ou refusez l’inscription.' : ''}`,
      link: `/admin/companies/${company.id}`,
      companyId: company.id,
      dedupeKey: `company.registered:${company.id}`,
    });
    audit.log(req, 'company.register', { userId: user.id, companyId: company.id, entityType: 'company', entityId: company.id, description: `Inscription de l'entreprise ${company.name}${pending ? ' (en attente de validation)' : ''}` });

    if (pending) return res.status(201).json({ pending: true, company: { name: company.name, status: company.status } });
    const fresh = await User.findByPk(user.id, withCompany);
    res.status(201);
    await respondWithSession(res, req, fresh);
  })
);

/* ---------------- Inscription client (application mobile) ---------------- */
router.post(
  '/register',
  loginLimiter,
  validate(
    Joi.object({
      firstName: Joi.string().trim().min(2).max(80).required(),
      lastName: Joi.string().trim().min(2).max(80).required(),
      email: Joi.string().email().lowercase().required(),
      phone: Joi.string().trim().max(40).allow('', null),
      password,
    })
  ),
  ah(async (req, res) => {
    const general = await settings.get('general');
    if (!general.allowClientRegistration) throw AppError.forbidden('Les inscriptions sont momentanément fermées');
    if (await User.findOne({ where: { email: req.body.email } })) throw AppError.conflict('Un compte existe déjà avec cet email');
    const user = await User.create({ ...req.body, passwordHash: await auth.hashPassword(req.body.password), role: ROLES.CLIENT, status: 'active' });
    const token = await auth.createActionToken(user.id, 'verify_email', 7 * 86400000);
    email.queue('welcome', user.email, { user });
    email.queue('accountConfirmation', user.email, { user, verifyUrl: `${config.apiUrl}/api/auth/verify-email?token=${token}` });
    audit.log(req, 'auth.register', { userId: user.id, entityType: 'user', entityId: user.id, description: 'Inscription client' });
    res.status(201);
    await respondWithSession(res, req, user);
  })
);

router.get(
  '/verify-email',
  ah(async (req, res) => {
    let ok = true;
    try {
      const row = await auth.consumeActionToken(String(req.query.token || ''), ['verify_email']);
      await User.update({ emailVerifiedAt: new Date() }, { where: { id: row.userId } });
    } catch {
      ok = false;
    }
    const { platformName } = await settings.get('general');
    res.type('html').send(`<!DOCTYPE html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${platformName}</title>
<body style="font-family:system-ui;background:#f5f3ee;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="background:#fff;padding:40px;border-radius:16px;text-align:center;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
<div style="font-size:42px">${ok ? '✅' : '⚠️'}</div><h2 style="color:#16140f">${ok ? 'Email confirmé' : 'Lien invalide ou expiré'}</h2>
<p style="color:#6b675c">${ok ? 'Votre compte est confirmé. Vous pouvez retourner sur l’application.' : 'Demandez un nouveau lien depuis l’application.'}</p></div></body></html>`);
  })
);

/* ---------------- Sessions ---------------- */
router.post(
  '/refresh',
  ah(async (req, res) => {
    const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    if (!token) throw AppError.unauthorized('Session absente');
    const { user, tokens } = await auth.rotate(token, req);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts());
    res.json({ user: auth.profile(user), ...tokens });
  })
);

router.post(
  '/logout',
  ah(async (req, res) => {
    await auth.revoke(req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ ok: true });
  })
);

/* ---------------- Mot de passe ---------------- */
router.post(
  '/forgot-password',
  mailLimiter,
  validate(Joi.object({ email: Joi.string().email().required() })),
  ah(async (req, res) => {
    const user = await User.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (user && user.status !== 'suspended') {
      const token = await auth.createActionToken(user.id, 'reset_password', 3600000);
      email.queue('passwordReset', user.email, { user, resetUrl: `${config.webUrl}/reset-password?token=${token}` });
      audit.log(req, 'auth.forgot_password', { userId: user.id, companyId: user.companyId, entityType: 'user', entityId: user.id, description: 'Demande de réinitialisation' });
    }
    // Réponse identique que le compte existe ou non (pas d'énumération des comptes).
    res.json({ ok: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
  })
);

router.post(
  '/reset-password',
  loginLimiter,
  validate(Joi.object({ token: Joi.string().required(), password })),
  ah(async (req, res) => {
    const row = await auth.consumeActionToken(req.body.token, ['reset_password', 'invite']);
    const user = await User.findByPk(row.userId);
    if (!user || user.status === 'suspended') throw AppError.badRequest('Compte indisponible');
    await user.update({ passwordHash: await auth.hashPassword(req.body.password), status: 'active', emailVerifiedAt: user.emailVerifiedAt || new Date(), failedLogins: 0, lockedUntil: null });
    await auth.revokeAll(user.id);
    email.queue('passwordChanged', user.email, { user });
    audit.log(req, row.type === 'invite' ? 'auth.invite_accepted' : 'auth.reset_password', { userId: user.id, companyId: user.companyId, entityType: 'user', entityId: user.id, description: 'Mot de passe défini' });
    res.json({ ok: true });
  })
);

/* ---------------- Profil ---------------- */
router.get('/me', authenticate, (req, res) => res.json({ user: auth.profile(req.user) }));

router.patch(
  '/me',
  authenticate,
  validate(Joi.object({ firstName: Joi.string().trim().min(2).max(80), lastName: Joi.string().trim().min(2).max(80), phone: Joi.string().trim().max(40).allow('', null), jobTitle: Joi.string().trim().max(100).allow('', null) })),
  ah(async (req, res) => {
    await req.user.update(req.body);
    res.json({ user: auth.profile(req.user) });
  })
);

router.post(
  '/change-password',
  authenticate,
  validate(Joi.object({ currentPassword: Joi.string().required(), newPassword: password })),
  ah(async (req, res) => {
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await auth.checkPassword(req.body.currentPassword, user.passwordHash))) throw AppError.badRequest('Mot de passe actuel incorrect');
    await user.update({ passwordHash: await auth.hashPassword(req.body.newPassword) });
    await auth.revokeAll(user.id);
    email.queue('passwordChanged', user.email, { user });
    audit.log(req, 'auth.change_password', { entityType: 'user', entityId: user.id, description: 'Changement de mot de passe' });
    await respondWithSession(res, req, req.user);
  })
);

module.exports = router;
