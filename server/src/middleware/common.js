/**
 * Validation Joi, gestion centralisée des erreurs, upload de fichiers.
 */
const os = require('os');
const path = require('path');
const multer = require('multer');
const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } = require('sequelize');
const config = require('../config');
const { AppError, randomToken } = require('../utils/helpers');

/** Valide body/query/params avec un schéma Joi et remplace les valeurs par les valeurs nettoyées. */
const validate = (schema, source = 'body') => (req, res, next) => {
  const { value, error } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
    return next(AppError.badRequest('Données invalides', details));
  }
  if (source === 'query') {
    // req.query est en lecture seule dans Express 5 : on expose la version validée.
    req.validQuery = value;
  } else {
    req[source] = value;
  }
  next();
};

function notFound(req, res, next) {
  next(AppError.notFound(`Route introuvable : ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let body = { error: { code: err.code || 'INTERNAL_ERROR', message: err.message } };

  if (err instanceof AppError) {
    if (err.details) body.error.details = err.details;
  } else if (err instanceof UniqueConstraintError) {
    status = 409;
    body = { error: { code: 'CONFLICT', message: 'Cette valeur existe déjà', details: err.errors?.map((e) => ({ field: e.path, message: e.message })) } };
  } else if (err instanceof ForeignKeyConstraintError) {
    status = 409;
    body = { error: { code: 'CONFLICT', message: 'Opération impossible : des données liées existent' } };
  } else if (err instanceof ValidationError) {
    status = 400;
    body = { error: { code: 'BAD_REQUEST', message: 'Données invalides', details: err.errors.map((e) => ({ field: e.path, message: e.message })) } };
  } else if (err instanceof multer.MulterError) {
    status = 400;
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux' : `Erreur d'upload : ${err.message}`;
    body = { error: { code: 'UPLOAD_ERROR', message: msg } };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'BAD_JSON', message: 'JSON invalide' } };
  } else {
    status = 500;
    console.error('[error]', err);
    body = { error: { code: 'INTERNAL_ERROR', message: config.isProd ? 'Erreur interne du serveur' : err.message } };
  }
  res.status(status).json(body);
}

/** Upload temporaire : les fichiers sont ensuite validés, traités puis déplacés par le service média. */
const tmpStorage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => cb(null, `zwacar-${randomToken(12)}${path.extname(file.originalname).toLowerCase()}`),
});

const uploadMedia = multer({
  storage: tmpStorage,
  limits: { fileSize: config.media.maxVideoBytes, files: config.media.maxPhotos + 1 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype) || /^video\/(mp4|quicktime|webm)$/.test(file.mimetype);
    if (!ok) return cb(AppError.badRequest(`Format non supporté : ${file.originalname} (JPG, PNG, WEBP, MP4, MOV, WEBM)`));
    cb(null, true);
  },
});

const uploadImage = multer({
  storage: tmpStorage,
  limits: { fileSize: config.media.maxPhotoBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(AppError.badRequest('Image JPG, PNG ou WEBP requise'));
    cb(null, true);
  },
});

const uploadBackup = multer({ storage: tmpStorage, limits: { fileSize: 200 * 1024 * 1024, files: 1 } });

module.exports = { validate, notFound, errorHandler, uploadMedia, uploadImage, uploadBackup };
