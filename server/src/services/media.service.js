/**
 * Gestion sécurisée des médias :
 *  - Les images sont décodées puis ré-encodées par sharp (WEBP) : tout fichier qui n'est pas
 *    une vraie image est rejeté et les métadonnées (EXIF/GPS) sont supprimées.
 *  - Les vidéos sont validées par leur signature binaire (magic bytes), pas par l'extension.
 *  - Noms de fichiers aléatoires, stockage hors de la racine du code.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { AppError, randomToken } = require('../utils/helpers');

const UPLOADS = config.paths.uploads;

async function ensureDir(rel) {
  const dir = path.join(UPLOADS, rel);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

const safeUnlink = (p) => fsp.unlink(p).catch(() => {});

/** Compresse et optimise une photo : version principale (1600px) + miniature (640px). */
async function processPhoto(tmpPath, relDir) {
  try {
    const meta = await sharp(tmpPath).metadata();
    if (!meta.width || !meta.height) throw new Error('image illisible');
    if (meta.width < 400 || meta.height < 300) {
      throw AppError.badRequest('Photo trop petite : 400×300 pixels minimum');
    }
    const dir = await ensureDir(relDir);
    const name = randomToken(10);
    const main = `${name}.webp`;
    const thumb = `${name}_thumb.webp`;
    const out = await sharp(tmpPath).rotate().resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, main));
    await sharp(tmpPath).rotate().resize({ width: 640, height: 480, fit: 'cover' }).webp({ quality: 70 }).toFile(path.join(dir, thumb));
    return { path: `${relDir}/${main}`, thumbPath: `${relDir}/${thumb}`, mimeType: 'image/webp', sizeBytes: out.size, width: out.width, height: out.height };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw AppError.badRequest('Fichier image invalide ou corrompu');
  } finally {
    await safeUnlink(tmpPath);
  }
}

/** Détecte le format vidéo réel à partir des premiers octets. */
async function sniffVideo(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
      const brand = buf.slice(8, 12).toString('ascii');
      return brand.startsWith('qt') ? { ext: 'mov', mime: 'video/quicktime' } : { ext: 'mp4', mime: 'video/mp4' };
    }
    if (buf.readUInt32BE(0) === 0x1a45dfa3) return { ext: 'webm', mime: 'video/webm' };
    return null;
  } finally {
    await fh.close();
  }
}

async function processVideo(tmpPath, size, relDir) {
  try {
    if (size > config.media.maxVideoBytes) throw AppError.badRequest('Vidéo trop volumineuse : 20 Mo maximum');
    const kind = await sniffVideo(tmpPath);
    if (!kind) throw AppError.badRequest('Format vidéo invalide (MP4, MOV ou WEBM)');
    const dir = await ensureDir(relDir);
    const name = `${randomToken(10)}.${kind.ext}`;
    await fsp.copyFile(tmpPath, path.join(dir, name));
    return { path: `${relDir}/${name}`, mimeType: kind.mime, sizeBytes: size };
  } finally {
    await safeUnlink(tmpPath);
  }
}

/** Logo d'entreprise : carré 400×400 WEBP. */
async function processLogo(tmpPath, companyId) {
  try {
    const rel = `companies/${companyId}`;
    const dir = await ensureDir(rel);
    const name = `logo_${randomToken(6)}.webp`;
    await sharp(tmpPath).rotate().resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 85 }).toFile(path.join(dir, name));
    return `${rel}/${name}`;
  } catch {
    throw AppError.badRequest('Image de logo invalide');
  } finally {
    await safeUnlink(tmpPath);
  }
}

async function removeFiles(...relPaths) {
  await Promise.all(relPaths.filter(Boolean).map((p) => safeUnlink(path.join(UPLOADS, p))));
}

async function removeDir(rel) {
  await fsp.rm(path.join(UPLOADS, rel), { recursive: true, force: true }).catch(() => {});
}

module.exports = { processPhoto, processVideo, processLogo, removeFiles, removeDir, safeUnlink };
