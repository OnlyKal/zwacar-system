/**
 * Génère toutes les déclinaisons du logo à partir de src/assets/logo.js :
 *   - Web Admin : favicon.svg, logo.svg, apple-touch-icon.png, logo-512.png
 *   - Emails    : src/assets/logo-email.png (pièce jointe intégrée)
 *   - Mobile    : icônes iOS (AppIcon) et Android (mipmap)
 *
 * Usage : npm run brand
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { svg, COLORS } = require('../assets/logo');

const ROOT = path.resolve(__dirname, '../../..');
const out = (...p) => path.join(ROOT, ...p);

async function png(file, size, { radius = 6, opaque = false } = {}) {
  let img = sharp(Buffer.from(svg({ radius })), { density: Math.max(72, Math.ceil((size / 64) * 72 * 2)) }).resize(size, size);
  // Icônes iOS : pas de transparence autorisée.
  if (opaque) img = img.flatten({ background: COLORS.gold }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(file);
}

async function main() {
  const done = [];
  // Web
  fs.writeFileSync(out('web/public/favicon.svg'), svg());
  fs.writeFileSync(out('web/public/logo.svg'), svg());
  await png(out('web/public/apple-touch-icon.png'), 180, { radius: 0, opaque: true });
  await png(out('web/public/logo-512.png'), 512);
  done.push('web/public (favicon.svg, logo.svg, apple-touch-icon.png, logo-512.png)');

  // Emails
  await png(path.join(__dirname, '../assets/logo-email.png'), 96);
  done.push('server/src/assets/logo-email.png');

  // iOS : tailles déduites des noms de fichiers existants (Icon-App-WxH@Nx.png)
  const iosDir = out('mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset');
  if (fs.existsSync(iosDir)) {
    for (const f of fs.readdirSync(iosDir).filter((n) => n.endsWith('.png'))) {
      const m = f.match(/(\d+(?:\.\d+)?)x\d+(?:\.\d+)?@(\d)x/);
      if (m) await png(path.join(iosDir, f), Math.round(Number(m[1]) * Number(m[2])), { radius: 0, opaque: true });
    }
    done.push('mobile/ios AppIcon');
  }

  // Android
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, s] of Object.entries(sizes)) {
    const dir = out(`mobile/android/app/src/main/res/mipmap-${d}`);
    if (fs.existsSync(dir)) await png(path.join(dir, 'ic_launcher.png'), s);
  }
  done.push('mobile/android mipmap');

  console.log('[brand] fichiers générés :\n  - ' + done.join('\n  - '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
