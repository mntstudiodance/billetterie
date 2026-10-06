// Construit l'identifiant unique et stable d'un siège, préfixé par la date
// pour éviter toute collision entre le plan du samedi et celui du dimanche
// (deux blocs de même nom/id sur les deux dates ne doivent jamais partager
// le même document Firestore).
// Ex: "samedi", section "OR", rangée "A", numéro 12 -> "samedi__OR-A12"
export function makeSeatId(eventId, sectionId, rowLabel, number) {
  return `${eventId}__${sectionId}-${rowLabel}${number}`;
}

// Renvoie la liste ordonnée des numéros de sièges d'une rangée, tels qu'ils
// doivent apparaître de gauche à droite sur le plan. Chaque rangée porte
// désormais sa propre liste explicite (row.seats), saisie à la main par
// l'admin — ce qui permet une numérotation non séquentielle (ex : rangée qui
// commence au centre avec les pairs à gauche et les impairs à droite, comme
// dans beaucoup de vraies salles). Les anciennes rangées générées avec
// seatCount/startNumber/removed restent lisibles (repli automatique).
export function rowSeatNumbers(row) {
  if (Array.isArray(row.seats)) return row.seats;
  // Repli pour les rangées créées avant l'ajout de la numérotation manuelle
  const start = row.startNumber ?? 1;
  const removed = new Set(row.removed || []);
  const numbers = [];
  for (let n = start; n < start + (row.seatCount || 0); n++) {
    if (!removed.has(n)) numbers.push(n);
  }
  return numbers;
}

// À partir d'une config de plan de salle (venueConfig) pour une date donnée,
// génère la liste complète et à plat de tous les sièges qui doivent exister.
// Chaque entrée : { seatId, sectionId, sectionName, row, number }
export function buildSeatList(eventId, config) {
  if (!config || !Array.isArray(config.sections)) return [];
  const seats = [];
  for (const section of config.sections) {
    for (const row of section.rows || []) {
      for (const n of rowSeatNumbers(row)) {
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
  return (section.rows || []).reduce((sum, r) => sum + rowSeatNumbers(r).length, 0);
}

// Convertit "12, 10, 8, 6, 4, 2, 1, 3, 5, 7, 9, 11" -> [12,10,8,6,4,2,1,3,5,7,9,11]
// L'ordre est conservé tel quel : c'est lui qui détermine l'ordre gauche-droite
// affiché sur le plan, donc rien n'est trié.
export function parseSeatNumberList(text) {
  return text
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

// Génère une suite classique : 1,2,3,4… (ou à partir d'un autre départ)
export function generateSequentialNumbers(count, start = 1) {
  return Array.from({ length: count }, (_, i) => start + i);
}

// Génère une numérotation qui part du centre : pairs décroissants à gauche,
// impairs croissants à droite — convention courante dans les salles de
// spectacle (ex, pour 6 à gauche / 6 à droite : 12,10,8,6,4,2,1,3,5,7,9,11).
export function generateCenterOutNumbers(leftCount, rightCount) {
  const left = Array.from({ length: leftCount }, (_, i) => 2 * (leftCount - i));
  const right = Array.from({ length: rightCount }, (_, i) => 2 * i + 1);
  return [...left, ...right];
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
