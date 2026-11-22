/**
 * Génération de documents PDF professionnels (factures, reçus, rapports).
 *
 * Chaque document comporte : logo et en-tête de la plateforme, coordonnées de l'entreprise
 * concernée, référence unique, date de génération, contenu détaillé, pied de page et pagination.
 */
const PDFDocument = require('pdfkit');
const settings = require('./settings.service');
const { makeReference } = require('../utils/helpers');

const C = { gold: '#947A26', goldSoft: '#f4efdf', dark: '#16140f', text: '#2b2820', muted: '#8a8577', line: '#e8e2d2', soft: '#faf8f3', green: '#067647', red: '#b42318', amber: '#b54708' };

const fmtDate = (d, withTime = false) =>
  d
    ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
    : '—';
const money = (v, cur = 'USD') => `${Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ')} ${cur}`;
const int = (v) => Number(v || 0).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** Logo vectoriel ZwaCar (même tracé que le Web Admin et l'application). */
function drawLogo(doc, x, y, size = 34) {
  const logo = require('../assets/logo');
  const k = size / 64;
  doc.save().translate(x, y).scale(k);
  doc.roundedRect(0, 0, 64, 64, 6).fill(logo.COLORS.gold);
  doc.path(logo.CAR).fill(logo.COLORS.white, 'even-odd');
  doc.path(logo.Z).fill(logo.COLORS.white);
  for (const [cx, cy] of logo.WHEELS) {
    doc.circle(cx, cy, 4.7).fill(logo.COLORS.ink);
    doc.circle(cx, cy, 1.7).fill(logo.COLORS.white);
  }
  doc.restore();
}

class Builder {
  constructor(doc, meta) {
    this.doc = doc;
    this.meta = meta;
    this.left = doc.page.margins.left;
    this.width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  }

  get bottomLimit() {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  ensure(h) {
    if (this.doc.y + h > this.bottomLimit) this.doc.addPage();
  }

  /** En-tête complet (première page). */
  header() {
    const { doc, meta } = this;
    const g = meta.general;
    doc.rect(0, 0, doc.page.width, 92).fill(C.dark);
    drawLogo(doc, this.left, 29);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text(g.platformName, this.left + 46, 33, { lineBreak: false });
    doc.fillColor('#c9c3b2').font('Helvetica').fontSize(8).text('Plateforme de location de véhicules', this.left + 46, 56, { lineBreak: false });
    doc
      .fillColor('#d9d4c5')
      .fontSize(8)
      .text([g.address, g.supportEmail, g.supportPhone].filter(Boolean).join('\n'), this.left, 30, { width: this.width, align: 'right', lineGap: 2 });

    doc.y = 118;
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(8).text(meta.kicker || 'DOCUMENT', this.left, doc.y, { characterSpacing: 1.5 });
    doc.moveDown(0.3);
    doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(20).text(meta.title, this.left, doc.y, { width: this.width * 0.7 });
    const yTitleEnd = doc.y;
    // Bloc référence à droite
    doc
      .fillColor(C.muted)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`Référence : `, this.left, 120, { width: this.width, align: 'right', continued: false });
    doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(10).text(meta.reference, this.left, 132, { width: this.width, align: 'right' });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(`Généré le ${fmtDate(new Date(), true)}`, this.left, 148, { width: this.width, align: 'right' });
    if (meta.period) doc.text(`Période : ${meta.period}`, this.left, 160, { width: this.width, align: 'right' });
    doc.y = Math.max(yTitleEnd, meta.period ? 172 : 162) + 14;
    doc.moveTo(this.left, doc.y).lineTo(this.left + this.width, doc.y).lineWidth(1).strokeColor(C.line).stroke();
    doc.y += 16;
  }

  /** En-tête réduit des pages suivantes. */
  miniHeader() {
    const { doc, meta } = this;
    drawLogo(doc, this.left, 22, 20);
    doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(10).text(meta.general.platformName, this.left + 28, 27, { lineBreak: false });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`${meta.title} — ${meta.reference}`, this.left, 28, { width: this.width, align: 'right' });
    doc.moveTo(this.left, 52).lineTo(this.left + this.width, 52).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.y = 68;
  }

  /** Bloc de coordonnées de l'entreprise concernée. */
  party(label, company, right) {
    if (!company) return;
    const { doc } = this;
    const w = right ? this.width / 2 - 8 : this.width;
    const y0 = doc.y;
    const lines = [company.email, company.phone, [company.address, company.city, company.country].filter(Boolean).join(', '), company.taxId ? `N° fiscal : ${company.taxId}` : null].filter(Boolean);
    // Hauteur de chaque ligne de détail : les valeurs longues passent à la ligne sans chevauchement.
    const valueW = w * 0.64 - 14;
    doc.font('Helvetica-Bold').fontSize(8.5);
    const rowH = right ? right.rows.map(([, v]) => Math.max(14, doc.heightOfString(String(v ?? '—'), { width: valueW, align: 'right' }) + 4)) : [];
    const h = Math.max(40 + lines.length * 12, right ? 32 + rowH.reduce((a, b) => a + b, 0) + 6 : 0);
    doc.roundedRect(this.left, y0, w, h, 4).fill(C.soft);
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), this.left + 14, y0 + 12, { characterSpacing: 1 });
    doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(11).text(company.name, this.left + 14, y0 + 24, { width: w - 28 });
    doc.fillColor(C.text).font('Helvetica').fontSize(8.5).text(lines.join('\n'), this.left + 14, y0 + 39, { width: w - 28, lineGap: 2.5 });
    if (right) {
      const x = this.left + w + 16;
      doc.roundedRect(x, y0, w, h, 4).fill(C.soft);
      doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(7.5).text(right.label.toUpperCase(), x + 14, y0 + 12, { characterSpacing: 1 });
      let yy = y0 + 26;
      right.rows.forEach(([k, v], i) => {
        doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(k, x + 14, yy, { width: w * 0.36, lineBreak: false });
        doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5).text(String(v ?? '—'), x + w * 0.36, yy, { width: valueW, align: 'right' });
        yy += rowH[i];
      });
    }
    doc.y = y0 + h + 18;
  }

  section(title) {
    this.ensure(40);
    const { doc } = this;
    doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(12).text(title, this.left, doc.y);
    doc.rect(this.left, doc.y + 3, 28, 2).fill(C.gold);
    doc.y += 14;
  }

  paragraph(text, opts = {}) {
    const { doc } = this;
    this.ensure(30);
    doc.fillColor(opts.color || C.text).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9).text(text, this.left, doc.y, { width: this.width, lineGap: 2.5 });
    doc.y += 8;
  }

  /** Cartes de statistiques (KPI). */
  stats(items) {
    const { doc } = this;
    const perRow = Math.min(4, items.length);
    const gap = 10;
    const w = (this.width - gap * (perRow - 1)) / perRow;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(64);
      const y = doc.y;
      items.slice(i, i + perRow).forEach((it, j) => {
        const x = this.left + j * (w + gap);
        doc.roundedRect(x, y, w, 56, 4).fill(C.soft);
        doc.rect(x, y + 10, 3, 36).fill(it.color || C.gold);
        doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(it.label.toUpperCase(), x + 12, y + 11, { width: w - 20, characterSpacing: 0.5 });
        doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(15).text(String(it.value), x + 12, y + 27, { width: w - 20, lineBreak: false });
      });
      doc.y = y + 56 + gap;
    }
    doc.y += 8;
  }

  /**
   * Tableau paginé.
   * @param {Array<{label:string,width:number,align?:string}>} cols largeurs relatives
   * @param {Array<Array<string|number>>} rows
   */
  table(cols, rows, { totals } = {}) {
    const { doc } = this;
    const sum = cols.reduce((a, c) => a + (c.width || 1), 0);
    const widths = cols.map((c) => ((c.width || 1) / sum) * this.width);
    const pad = 6;

    const drawHead = () => {
      const y = doc.y;
      doc.rect(this.left, y, this.width, 22).fill(C.dark);
      let x = this.left;
      cols.forEach((c, i) => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.8).text(c.label, x + pad, y + 7, { width: widths[i] - pad * 2, align: c.align || 'left', lineBreak: false });
        x += widths[i];
      });
      doc.y = y + 22;
    };

    const rowHeight = (cells, font) => {
      doc.font(font).fontSize(8.2);
      return Math.max(20, ...cells.map((v, i) => doc.heightOfString(String(v ?? '—'), { width: widths[i] - pad * 2 }) + 11));
    };

    this.ensure(50);
    drawHead();
    if (!rows.length) {
      doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(8.5).text('Aucune donnée pour cette sélection.', this.left, doc.y + 10, { width: this.width, align: 'center' });
      doc.y += 26;
      return;
    }
    const drawRow = (cells, idx, bold) => {
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      const h = rowHeight(cells, font);
      if (doc.y + h > this.bottomLimit) {
        doc.addPage();
        drawHead();
      }
      const y = doc.y;
      if (bold) doc.rect(this.left, y, this.width, h).fill(C.goldSoft);
      else if (idx % 2) doc.rect(this.left, y, this.width, h).fill(C.soft);
      let x = this.left;
      cells.forEach((v, i) => {
        doc.fillColor(C.text).font(font).fontSize(8.2).text(String(v ?? '—'), x + pad, y + 6, { width: widths[i] - pad * 2, align: cols[i].align || 'left' });
        x += widths[i];
      });
      doc.moveTo(this.left, y + h).lineTo(this.left + this.width, y + h).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.y = y + h;
    };
    rows.forEach((r, i) => drawRow(r, i, false));
    if (totals) drawRow(totals, 0, true);
    doc.y += 16;
  }

  /** Bloc des totaux aligné à droite (factures). */
  totals(rows) {
    const { doc } = this;
    this.ensure(rows.length * 22 + 20);
    const w = 230;
    const x = this.left + this.width - w;
    rows.forEach(([k, v, strong]) => {
      const y = doc.y;
      if (strong) doc.roundedRect(x, y - 2, w, 26, 4).fill(C.gold);
      doc.fillColor(strong ? '#ffffff' : C.muted).font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 10.5 : 9).text(k, x + 12, y + (strong ? 6 : 2), { width: w / 2 });
      doc.fillColor(strong ? '#ffffff' : C.dark).font('Helvetica-Bold').fontSize(strong ? 11 : 9).text(v, x + w / 2, y + (strong ? 5 : 2), { width: w / 2 - 12, align: 'right' });
      doc.y = y + (strong ? 30 : 18);
    });
    doc.y += 10;
  }

  badge(text, color) {
    const { doc } = this;
    doc.font('Helvetica-Bold').fontSize(8);
    const w = doc.widthOfString(text) + 18;
    const x = this.left + this.width - w;
    const y = doc.y;
    doc.roundedRect(x, y, w, 18, 4).fill(color);
    doc.fillColor('#ffffff').text(text, x, y + 5, { width: w, align: 'center' });
    doc.y = y + 28;
  }

  /** Pied de page + pagination sur toutes les pages, puis clôture du document. */
  finalize() {
    const { doc, meta } = this;
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = range.start; i < range.start + total; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 48;
      doc.moveTo(this.left, y).lineTo(this.left + this.width, y).lineWidth(0.6).strokeColor(C.line).stroke();
      doc
        .fillColor(C.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text(`${meta.general.platformName} — ${[meta.general.address, meta.general.supportEmail].filter(Boolean).join(' — ')}`, this.left, y + 10, { width: this.width * 0.75, lineBreak: false });
      doc.text(`Page ${i + 1} / ${total}`, this.left, y + 10, { width: this.width, align: 'right', lineBreak: false });
      doc.fontSize(6.5).text(`Document généré électroniquement — Réf. ${meta.reference}`, this.left, y + 22, { width: this.width, lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    return doc;
  }
}

/** Crée un document avec en-tête. `meta` : { title, kicker, reference?, period?, landscape? } */
async function createDocument(meta) {
  const general = await settings.get('general');
  const doc = new PDFDocument({
    size: 'A4',
    layout: meta.landscape ? 'landscape' : 'portrait',
    margins: { top: 60, bottom: 70, left: 45, right: 45 },
    bufferPages: true,
    info: { Title: meta.title, Author: general.platformName, Creator: general.platformName },
  });
  const b = new Builder(doc, { ...meta, general, reference: meta.reference || makeReference('DOC') });
  doc.on('pageAdded', () => b.miniHeader());
  b.header();
  return b;
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** Envoie un PDF en réponse HTTP (affichage navigateur ou téléchargement). */
function send(res, doc, filename, download) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
}

const PAY_STATUS = { pending: ['EN ATTENTE', C.amber], completed: ['PAYÉ', C.green], failed: ['ÉCHOUÉ', C.red], cancelled: ['ANNULÉ', C.muted] };

/** Facture ou reçu d'un rechargement. kind = 'invoice' | 'receipt' */
async function paymentDocument(payment, company, kind = 'invoice') {
  const isInvoice = kind === 'invoice';
  const b = await createDocument({
    title: isInvoice ? 'Facture de rechargement' : 'Reçu de paiement',
    kicker: isInvoice ? 'FACTURE' : 'REÇU',
    reference: isInvoice ? payment.invoiceNumber : `RCU-${payment.reference.replace(/^PAY-/, '')}`,
  });
  const [label, color] = PAY_STATUS[payment.status] || ['—', C.muted];
  b.badge(label, color);
  b.party(isInvoice ? 'Facturé à' : 'Reçu de', company, {
    label: 'Détails',
    rows: [
      ['Réf. paiement', payment.reference],
      ['Date d’émission', fmtDate(payment.createdAt)],
      ['Date de paiement', fmtDate(payment.paidAt, true)],
      ['Moyen de paiement', payment.methodName || '—'],
      ['Réf. transaction', payment.providerReference || '—'],
      ...(payment.operatorReference ? [['Réf. opérateur', payment.operatorReference]] : []),
    ],
  });
  b.section('Désignation');
  b.table(
    [
      { label: 'Description', width: 5 },
      { label: 'Crédits', width: 1.3, align: 'right' },
      { label: 'Montant', width: 1.7, align: 'right' },
    ],
    [[`Rechargement du wallet ${b.meta.general.platformName} — crédits de publication de véhicules`, int(payment.credits), money(payment.amount, payment.currency)]]
  );
  b.totals([
    ['Sous-total', money(payment.amount, payment.currency)],
    ['Taxes', money(0, payment.currency)],
    [isInvoice ? 'Total' : 'Montant reçu', money(payment.amount, payment.currency), true],
  ]);
  b.paragraph(
    isInvoice
      ? `Les crédits sont ajoutés au wallet de l'entreprise dès confirmation du paiement. Chaque publication de véhicule consomme des crédits selon la tarification en vigueur.`
      : `Nous confirmons avoir reçu la somme de ${money(payment.amount, payment.currency)} au titre du rechargement de ${int(payment.credits)} crédits. Merci pour votre confiance.`,
    { color: C.muted, size: 8.5 }
  );
  if (payment.payerNote) b.paragraph(`Note : ${payment.payerNote}`, { color: C.muted, size: 8.5 });
  return b.finalize();
}

const TX_LABELS = { topup: 'Rechargement', publish: 'Publication de véhicule', renewal: 'Renouvellement automatique', refund: 'Remboursement', adjustment: 'Ajustement administratif' };

/** Reçu d'une opération de crédits (débit ou crédit). */
async function transactionReceipt(tx, company) {
  const b = await createDocument({ title: `Reçu d'opération — ${TX_LABELS[tx.type]}`, kicker: 'REÇU D’OPÉRATION', reference: tx.reference });
  b.badge(tx.amount < 0 ? 'DÉBIT' : 'CRÉDIT', tx.amount < 0 ? C.red : C.green);
  b.party('Entreprise', company, {
    label: 'Opération',
    rows: [
      ['Type', TX_LABELS[tx.type]],
      ['Date', fmtDate(tx.createdAt, true)],
      ['Réf. paiement', tx.payment?.reference || '—'],
      ['Véhicule', tx.vehicle ? `${tx.vehicle.brand} ${tx.vehicle.model}` : '—'],
    ],
  });
  b.section('Mouvement de crédits');
  b.table(
    [
      { label: 'Description', width: 4.5 },
      { label: 'Solde avant', width: 1.4, align: 'right' },
      { label: 'Mouvement', width: 1.4, align: 'right' },
      { label: 'Solde après', width: 1.4, align: 'right' },
    ],
    [[tx.description || TX_LABELS[tx.type], int(tx.balanceBefore), `${tx.amount > 0 ? '+' : ''}${int(tx.amount)}`, int(tx.balanceAfter)]]
  );
  b.paragraph('Cette opération est enregistrée de manière définitive dans le grand livre des crédits de la plateforme.', { color: C.muted, size: 8.5 });
  return b.finalize();
}

module.exports = { createDocument, toBuffer, send, paymentDocument, transactionReceipt, fmtDate, money, int, TX_LABELS, C };
