// Construit l'identifiant unique et stable d'un siège, préfixé par la date
// pour éviter toute collision entre le plan du samedi et celui du dimanche
// (deux blocs de même nom/id sur les deux dates ne doivent jamais partager
// le même document Firestore).
// Ex: "samedi", section "OR", rangée "A", numéro 12 -> "samedi__OR-A12"
export function makeSeatId(eventId, sectionId, rowLabel, number) {
  return `${eventId}__${sectionId}-${rowLabel}${number}`;
}

// À partir d'une config de plan de salle (venueConfig) pour une date donnée,
// génère la liste complète et à plat de tous les sièges qui doivent exister.
// Chaque entrée : { seatId, sectionId, sectionName, row, number }
export function buildSeatList(eventId, config) {
  if (!config || !Array.isArray(config.sections)) return [];
  const seats = [];
  for (const section of config.sections) {
    for (const row of section.rows || []) {
      const start = row.startNumber ?? 1;
      const removed = new Set(row.removed || []);
      for (let n = start; n < start + row.seatCount; n++) {
        if (removed.has(n)) continue;
        seats.push({
          seatId: makeSeatId(eventId, section.id, row.label, n),
          sectionId: section.id,
          sectionName: section.name,
          row: row.label,
          number: n,
        });
      }
    }
  }
  return seats;
}

// Compte le nombre total de sièges définis dans une section (avant même
// que les documents Firestore existent) — utile pour l'aperçu admin.
export function countSeatsInSection(section) {
  return (section.rows || []).reduce(
    (sum, r) => sum + Math.max(0, (r.seatCount || 0) - (r.removed || []).length),
    0
  );
}

// Convertit "3, 7,9" -> [3, 7, 9]
export function parseRemovedList(text) {
  return text
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

// Découpe un tableau en paquets de taille n (pour les batched writes Firestore,
// limitées à 500 opérations par batch).
export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

export function formatSeatLabel(seat) {
  return `Rang ${seat.row} — Siège ${seat.number}`;
}

// Référence courte et lisible à afficher sous le QR code du billet, utile
// pour un contrôle manuel si le scan échoue.
export function ticketReference(seatId) {
  return seatId.replace('__', ' · ').toUpperCase();
}
