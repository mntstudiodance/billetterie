import emailjs from '@emailjs/browser';
import { getTicketsPdfDataUri } from './ticketPdf';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export function isEmailDeliveryConfigured() {
  return Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);
}

// event: { eventName, eventDates, venueName }
// seats: [{ seatId, sectionName, row, number }]
export async function emailTickets({ toEmail, event, seats, transactionId }) {
  if (!isEmailDeliveryConfigured()) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const pdfDataUri = await getTicketsPdfDataUri({ event, seats, transactionId });
  const seatsSummary = seats.map((s) => `${s.row}${s.number}`).join(', ');

  await emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    {
      to_email: toEmail,
      event_name: event.eventName || 'Gala MNT Studio Dance',
      event_dates: event.eventDates || '',
      venue_name: event.venueName || '',
      transaction_id: transactionId,
      seats_summary: seatsSummary,
      seats_count: seats.length,
      pdf_attachment: pdfDataUri,
    },
    { publicKey: PUBLIC_KEY }
  );
}
