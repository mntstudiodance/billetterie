import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatSeatLabel } from './seatMap';

// Palette du billet (mêmes tons que l'appli)
const INK = [21, 15, 16]; // fond
const GOLD = [201, 162, 75];
const CREAM = [243, 233, 218];
const BURGUNDY = [110, 20, 35];

// event: { eventName, eventDates, venueName }
// seats: [{ seatId, sectionName, row, number }]
// transactionId: string
export async function generateTicketsPdf({ event, seats, transactionId }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

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

    // Bandeau burgundy en haut
    doc.setFillColor(...BURGUNDY);
    doc.rect(4, 4, pageW - 8, 16, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...GOLD);
    doc.text('GALA MNT STUDIO DANCE', pageW / 2, 14, { align: 'center', maxWidth: pageW - 20 });

    // Infos évènement
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...CREAM);
    doc.text(event.eventDates || '', pageW / 2, 27, { align: 'center' });
    doc.setFontSize(9);
    doc.text(event.venueName || '', pageW / 2, 33, { align: 'center' });

    // Ligne séparatrice
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.2);
    doc.line(10, 38, pageW - 10, 38);

    // Catégorie / place
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...GOLD);
    doc.text(seat.sectionName || '', 12, 48);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...CREAM);
    doc.text(formatSeatLabel(seat), 12, 56);

    doc.setFontSize(8.5);
    doc.setTextColor(180, 170, 160);
    doc.text(`Transaction : ${transactionId}`, 12, pageH - 10);

    // QR code
    const qrPayload = `MNT-GALA|${transactionId}|${seat.seatId}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 0,
      width: 300,
      color: { dark: '#150F10', light: '#F3E9DA' },
    });
    const qrSize = 34;
    doc.setFillColor(...CREAM);
    doc.roundedRect(pageW - qrSize - 16, pageH / 2 - qrSize / 2, qrSize + 4, qrSize + 4, 2, 2, 'F');
    doc.addImage(qrDataUrl, 'PNG', pageW - qrSize - 14, pageH / 2 - qrSize / 2 + 2, qrSize, qrSize);
  }

  doc.save(`Billet-Gala-MNT-${transactionId}.pdf`);
}
