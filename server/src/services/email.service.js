/**
 * Envoi d'emails via Gmail SMTP (configuration chiffrée gérée par le Super Administrateur).
 * Chaque envoi est tracé dans `email_logs`. Les envois métier sont non bloquants.
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const settings = require('./settings.service');
const { templates } = require('./email.templates');
const { EmailLog } = require('../models');

// Logo intégré aux emails (référencé par cid:zwacar-logo dans les modèles).
const LOGO_ATTACHMENT = { filename: 'zwacar-logo.png', path: require('path').join(__dirname, '../assets/logo-email.png'), cid: 'zwacar-logo' };

function buildTransport(smtp) {
  const port = Number(smtp.port) || 587;
  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: smtp.secure === 'ssl', // SSL implicite (465)
    requireTLS: smtp.secure === 'tls', // STARTTLS obligatoire (587)
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
}

async function platformName() {
  const g = await settings.get('general');
  return g.platformName || config.appName;
}

/**
 * Envoie un email à partir d'un modèle.
 * @param {string} template  nom du modèle (voir email.templates.js)
 * @param {string} to        destinataire
 * @param {object} data      variables du modèle
 * @param {object} [opts]    { attachments, companyId, throwOnError }
 */
async function send(template, to, data = {}, opts = {}) {
  if (config.isTest) return { status: 'skipped' };
  const p = await platformName();
  const tpl = templates[template];
  if (!tpl) throw new Error(`Modèle d'email inconnu : ${template}`);
  const { subject, html } = tpl({ ...data, p });

  const smtp = await settings.getSmtpSecret();
  const log = (status, error) =>
    EmailLog.create({ to, subject, template, status, error: error ? String(error).slice(0, 500) : null, companyId: opts.companyId || null }).catch(() => {});

  if (!smtp.enabled || !smtp.user || !smtp.password) {
    await log('skipped', 'SMTP non configuré ou désactivé');
    if (opts.throwOnError) throw new Error('Le service SMTP n’est pas configuré ou est désactivé');
    return { status: 'skipped' };
  }

  try {
    const transport = buildTransport(smtp);
    const info = await transport.sendMail({
      from: { name: smtp.fromName || p, address: smtp.user },
      replyTo: smtp.replyTo || undefined,
      to,
      subject,
      html,
      attachments: [LOGO_ATTACHMENT, ...(opts.attachments || [])],
    });
    await log('sent');
    return { status: 'sent', messageId: info.messageId };
  } catch (e) {
    await log('failed', e.message);
    if (opts.throwOnError) throw e;
    console.error('[email] échec envoi', template, to, e.message);
    return { status: 'failed', error: e.message };
  }
}

/** Version « fire and forget » pour ne pas ralentir les réponses API. */
function queue(template, to, data, opts) {
  setImmediate(() => send(template, to, data, opts).catch((e) => console.error('[email]', e.message)));
}

/** Teste une configuration SMTP (connexion + envoi d'un email de test). */
async function testSmtp(to, override) {
  const current = await settings.getSmtpSecret();
  const smtp = { ...current, ...(override || {}) };
  if (!override?.password) smtp.password = current.password;
  if (!smtp.user || !smtp.password) throw new Error('Adresse Gmail et mot de passe d’application requis');
  const transport = buildTransport(smtp);
  await transport.verify();
  const p = await platformName();
  const { subject, html } = templates.smtpTest({ p });
  await transport.sendMail({ from: { name: smtp.fromName || p, address: smtp.user }, replyTo: smtp.replyTo || undefined, to, subject, html, attachments: [LOGO_ATTACHMENT] });
  await EmailLog.create({ to, subject, template: 'smtpTest', status: 'sent' }).catch(() => {});
  return true;
}

module.exports = { send, queue, testSmtp };
