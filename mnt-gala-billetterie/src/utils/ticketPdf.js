import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { ticketReference } from './seatMap';
import { LOGO_DATA_URL, LOGO_ASPECT_RATIO } from '../assets/logo';
import { THEATRE_LOGO_URL, THEATRE_LOGO_RATIO, GPS_LOGO_URL, GPS_LOGO_RATIO } from '../assets/partnerLogos';

// ---------------------------------------------------------------------------
// Billet « Pass Gala » premium : format paysage 210 × 90 mm, fond sombre,
// filets dorés, corps du billet à gauche et souche de contrôle (QR) à droite,
// séparés par une ligne de découpe pointillée.
// ---------------------------------------------------------------------------

// Infos facultatives imprimées sur le billet : laissez vide pour ne pas les afficher.
const DOORS_OPEN = ''; // ex. '19h00'
const DRESS_CODE = ''; // ex. 'Tenue de soirée'

const INK = [11, 15, 23]; // #0b0f17
const PANEL = [18, 24, 39];
const GOLD = [212, 175, 55]; // #d4af37
const CHAMPAGNE = [241, 227, 181];
const MUTED = [143, 151, 168];
const WHITE = [255, 255, 255];
const CREAM = [243, 233, 218];

const W = 210;
const H = 90;
const CUT_X = 150; // ligne de découpe

// Le contenu du QR code reste volontairement minimal et inchangé : l'identifiant
// du siège. La page /controle retrouve ensuite le siège dans Firestore.
function qrPayload(seatId) {
  return `MNT-GALA|${seatId}`;
}

function label(doc, text, x, y) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.setCharSpace(0.6);
  doc.text(text.toUpperCase(), x, y);
  doc.setCharSpace(0);
}

// Réduit la taille de police jusqu'à ce que le texte tienne dans maxW
function fitText(doc, text, x, y, maxW, size, minSize = 7) {
  let sz = size;
  doc.setFontSize(sz);
  while (sz > minSize && doc.getTextWidth(text) > maxW) {
    sz -= 0.5;
    doc.setFontSize(sz);
  }
  doc.text(text, x, y);
}

// event: { eventName, eventDates, venueName }
// seats: [{ seatId, sectionName, row, number, holder }]  (holder = nom et prénom du titulaire)
// transactionId: numéro de transaction saisi par le client
async function buildTicketsDoc({ event, seats, transactionId }) {
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape', compress: true });

  const logoH = 13;
  const logoW = logoH * LOGO_ASPECT_RATIO;
  const partnerLogoH = 10;
  const theatreW = partnerLogoH * THEATRE_LOGO_RATIO;
  const gpsW = partnerLogoH * GPS_LOGO_RATIO;

  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    if (i > 0) doc.addPage([W, H], 'landscape');
    const x0 = 11;

    // Fond, panneau principal, double filet doré
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...PANEL);
    doc.roundedRect(4, 4, CUT_X - 6, H - 8, 3, 3, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.roundedRect(2.5, 2.5, W - 5, H - 5, 3.5, 3.5, 'S');
    doc.setLineWidth(0.15);
    doc.roundedRect(4.2, 4.2, W - 8.4, H - 8.4, 2.6, 2.6, 'S');

    // Filigrane de sécurité (très discret)
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.045 }));
    doc.setTextColor(...GOLD);
    doc.setFont('times', 'bold');
    doc.setFontSize(46);
    doc.text('MNT', 48, 64, { angle: 18 });
    doc.text('MNT', 98, 42, { angle: 18 });
    doc.restoreGraphicsState();

    // En-tête : logo MNT, titre, sous-titre
    doc.addImage(LOGO_DATA_URL, 'PNG', x0, 8, logoW, logoH);
    const tx = x0 + logoW + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GOLD);
    doc.setCharSpace(1.4);
    doc.text('PASS OFFICIEL', tx, 11.5);
    doc.setCharSpace(0);
    doc.setFont('times', 'bold');
    doc.setTextColor(...CHAMPAGNE);
    fitText(doc, (event.eventName || 'GALA MNT STUDIO DANCE').toUpperCase(), tx, 17.8, CUT_X - 9 - tx, 17, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Billet d’accès officiel', tx, 22);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(x0, 26.5, CUT_X - 9, 26.5);

    // Détails : date, lieu, (portes, dress code si renseignés)
    const details = [
      seat.holder ? ['Titulaire', seat.holder.toUpperCase(), 1.4] : null,
      ['Date', event.eventDates || '', 1],
      ['Lieu', event.venueName || 'Théâtre de Sénart, Lieusaint', 1.3],
      DOORS_OPEN ? ['Portes', DOORS_OPEN, 0.7] : null,
      DRESS_CODE ? ['Dress code', DRESS_CODE, 0.9] : null,
    ].filter(Boolean);
    const totalW = CUT_X - 9 - x0;
    const weightSum = details.reduce((a, d) => a + d[2], 0);
    let cx = x0;
    details.forEach(([l, v, wgt]) => {
      const colW = (totalW * wgt) / weightSum;
      label(doc, l, cx, 31);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...WHITE);
      doc.text(doc.splitTextToSize(String(v), colW - 3).slice(0, 2), cx, 35.5);
      cx += colW;
    });

    // Bloc siège mis en valeur
    const by = 44;
    const bh = 19;
    doc.setFillColor(...INK);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.45);
    doc.roundedRect(x0, by, CUT_X - 2 * x0 + 2, bh, 2.5, 2.5, 'FD');
    label(doc, 'Bloc', x0 + 4, by + 6);
    doc.setFont('times', 'bold');
    doc.setTextColor(...CHAMPAGNE);
    fitText(doc, seat.sectionName || '', x0 + 4, by + 14.5, 62, 13, 8);
    label(doc, 'Rangée', x0 + 78, by + 6);
    doc.setFont('times', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(...GOLD);
    doc.text(String(seat.row), x0 + 78, by + 15.5);
    label(doc, 'Place', x0 + 104, by + 6);
    doc.setFont('times', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(...GOLD);
    doc.text(String(seat.number), x0 + 104, by + 15.5);

    // Logos partenaires (théâtre + agglomération), même hauteur, côte à côte,
    // au-dessus du numéro de transaction, à gauche
    const partnerY = 67.5;
    doc.setFillColor(...CREAM);
    doc.roundedRect(x0 - 1.5, partnerY - 1.5, theatreW + 3, partnerLogoH + 3, 1.5, 1.5, 'F');
    doc.addImage(THEATRE_LOGO_URL, 'PNG', x0, partnerY, theatreW, partnerLogoH);
    const gpsX = x0 + theatreW + 3 + 5;
    doc.setFillColor(...CREAM);
    doc.roundedRect(gpsX - 1.5, partnerY - 1.5, gpsW + 3, partnerLogoH + 3, 1.5, 1.5, 'F');
    doc.addImage(GPS_LOGO_URL, 'PNG', gpsX, partnerY, gpsW, partnerLogoH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Transaction : ${transactionId}`, x0, H - 7);

    // Ligne de découpe pointillée + encoches
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.6, 1.4], 0);
    doc.line(CUT_X, 5, CUT_X, H - 5);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...INK);
    doc.circle(CUT_X, 2.5, 2, 'F');
    doc.circle(CUT_X, H - 2.5, 2, 'F');

    // Souche : QR code haute résolution sur plaque blanche (meilleur contraste de scan)
    const qrDataUrl = await QRCode.toDataURL(qrPayload(seat.seatId), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 700,
      color: { dark: '#0b0f17', light: '#ffffff' },
    });
    const stubCx = CUT_X + (W - CUT_X) / 2;
    const qs = 38;
    const qx = stubCx - qs / 2;
    const qy = 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.setCharSpace(0.6);
    doc.text('SCANNEZ À L’ENTRÉE', stubCx, 10, { align: 'center' });
    doc.setCharSpace(0);
    doc.setFillColor(...WHITE);
    doc.roundedRect(qx - 2.5, qy - 2.5, qs + 5, qs + 5, 2.5, 2.5, 'F');
    doc.addImage(qrDataUrl, 'PNG', qx, qy, qs, qs);

    // Référence sous le QR, pour un contrôle manuel si le scan échoue
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GOLD);
    doc.text(ticketReference(seat.seatId), stubCx, qy + qs + 8, { align: 'center', maxWidth: W - CUT_X - 8 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(`${seat.sectionName} · ${seat.row}${seat.number}`, stubCx, qy + qs + 13, { align: 'center', maxWidth: W - CUT_X - 8 });
    doc.text('Billet nominatif – une seule entrée', stubCx, H - 7, { align: 'center' });
  }

  return doc;
}

// Génère le PDF et déclenche son téléchargement (bouton "Télécharger").
export async function generateTicketsPdf({ event, seats, transactionId }) {
  const doc = await buildTicketsDoc({ event, seats, transactionId });
  doc.save(`Billet-Gala-MNT-${transactionId}.pdf`);
}

// Génère le PDF et le renvoie en data URI base64 (pour l'envoi par email),
// sans déclencher de téléchargement.
export async function getTicketsPdfDataUri({ event, seats, transactionId }) {
  const doc = await buildTicketsDoc({ event, seats, transactionId });
  return doc.output('datauristring', { filename: `Billet-Gala-MNT-${transactionId}.pdf` });
}
