import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatSeatLabel, ticketReference } from './seatMap';
import { LOGO_DATA_URL, LOGO_ASPECT_RATIO } from '../assets/logo';
import { THEATRE_LOGO_URL, THEATRE_LOGO_RATIO, GPS_LOGO_URL, GPS_LOGO_RATIO } from '../assets/partnerLogos';

// Palette du billet (mêmes tons que l'appli)
const INK = [21, 15, 16]; // fond
const GOLD = [201, 162, 75];
const CREAM = [243, 233, 218];
const BURGUNDY = [110, 20, 35];

// Le contenu du QR code est volontairement minimal : juste l'identifiant du
// siège (déjà unique tous évènements confondus). La page /controle regarde
// ensuite le document Firestore correspondant pour retrouver la catégorie,
// la date, et le statut de contrôle.
function qrPayload(seatId) {
  return `MNT-GALA|${seatId}`;
}

// event: { eventName, eventDates, venueName }
// seats: [{ seatId, sectionName, row, number }]
// transactionId: string (numéro de transaction saisi par le client)
export async function generateTicketsPdf({ event, seats, transactionId }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const logoW = 20;
  const logoH = logoW / LOGO_ASPECT_RATIO;

  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    if (i > 0) doc.addPage();

    // Fond
    doc.setFillColor(...INK);
    doc.rect(0, 0, pageW, pageH, 'F');

    // Cadre doré (clin d'œil au rideau de scène)
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.8);
    doc.rect(4, 4, pageW - 8, pageH - 8);

    // Bandeau burgundy en haut (agrandi pour accueillir le logo)
    const bandHeight = 20;
    doc.setFillColor(...BURGUNDY);
    doc.rect(4, 4, pageW - 8, bandHeight, 'F');

    // Logo à gauche du bandeau
    doc.addImage(LOGO_DATA_URL, 'PNG', 9, 4 + (bandHeight - logoH) / 2, logoW, logoH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...GOLD);
    doc.text('GALA MNT STUDIO DANCE', 9 + logoW + 6, 4 + bandHeight / 2 + 2, { maxWidth: pageW - 20 - logoW });

    // Infos évènement
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...CREAM);
    doc.text(event.eventDates || '', pageW / 2, 30, { align: 'center' });
    doc.setFontSize(9);
    doc.text(event.venueName || '', pageW / 2, 36, { align: 'center' });

    // Ligne séparatrice
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.2);
    doc.line(10, 41, pageW - 10, 41);

    // Catégorie / place
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...GOLD);
    doc.text(seat.sectionName || '', 12, 51);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...CREAM);
    doc.text(formatSeatLabel(seat), 12, 59);

    doc.setFontSize(8.5);
    doc.setTextColor(180, 170, 160);
    doc.text(`Transaction : ${transactionId}`, 12, pageH - 10);

    // Logos partenaires (théâtre + agglomération), même hauteur, côte à côte,
    // au-dessus du numéro de transaction, à gauche
    const partnerLogoH = 12;
    const theatreW = partnerLogoH * THEATRE_LOGO_RATIO;
    const gpsW = partnerLogoH * GPS_LOGO_RATIO;
    const partnerGap = 5;
    const partnerY = pageH - 10 - 5 - partnerLogoH;

    doc.setFillColor(...CREAM);
    doc.roundedRect(12 - 1.5, partnerY - 1.5, theatreW + 3, partnerLogoH + 3, 1.5, 1.5, 'F');
    doc.addImage(THEATRE_LOGO_URL, 'PNG', 12, partnerY, theatreW, partnerLogoH);

    const gpsX = 12 + theatreW + 3 + partnerGap;
    doc.setFillColor(...CREAM);
    doc.roundedRect(gpsX - 1.5, partnerY - 1.5, gpsW + 3, partnerLogoH + 3, 1.5, 1.5, 'F');
    doc.addImage(GPS_LOGO_URL, 'PNG', gpsX, partnerY, gpsW, partnerLogoH);

    // QR code
    const qrDataUrl = await QRCode.toDataURL(qrPayload(seat.seatId), {
      margin: 0,
      width: 300,
      color: { dark: '#150F10', light: '#F3E9DA' },
    });
    const qrSize = 32;
    const qrX = pageW - qrSize - 16;
    const qrY = pageH / 2 - qrSize / 2 - 4;
    doc.setFillColor(...CREAM);
    doc.roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 2, 2, 'F');
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    // Référence sous le QR, pour un contrôle manuel si le scan échoue
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...CREAM);
    doc.text(ticketReference(seat.seatId), qrX + qrSize / 2 - 2, qrY + qrSize + 8, { align: 'center' });
  }

  doc.save(`Billet-Gala-MNT-${transactionId}.pdf`);
}
