export const EVENTS = [
  { id: 'samedi', label: 'Samedi 5 juin 2027', shortLabel: 'Samedi 5 juin' },
  { id: 'dimanche', label: 'Dimanche 6 juin 2027', shortLabel: 'Dimanche 6 juin' },
];

export function eventLabel(eventId) {
  return EVENTS.find((e) => e.id === eventId)?.label || eventId;
}

export function bookingDocId(eventId, transactionId) {
  return `${eventId}__${transactionId.trim()}`;
}
