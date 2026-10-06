import { makeSeatId, rowSeatNumbers } from './seatMap';

// Transforme une configuration de salle (venueConfig : sections → rangées → liste
// de numéros dans l'ordre gauche→droite) en coordonnées de dessin pour le plan
// Canvas. Aucune donnée n'est inventée : tout vient de la config de l'admin
// (sections, gridColumn/gridRow, rangées, numérotation manuelle).

export const SP = 30; // pas entre deux sièges
export const RG = 38; // pas entre deux rangées
export const SEAT_R = 11;
const GUTTER = 36; // marge pour les lettres de rangée
const HEAD = 44; // hauteur du titre de bloc
const COL_GAP = 64;
const ROW_GAP = 76;
const MARGIN = 70;
const TOP = 230; // début des blocs sous la scène
const CURVE = 4e-5; // légère courbure des rangées

// Alignement des rangées dans un bloc quand elles n'ont pas toutes le même nombre
// de places : les blocs « gauche » sont calés à droite (côté allée centrale), les
// blocs « droit » calés à gauche, les autres centrés. Peut être forcé par
// section.align = 'left' | 'right' | 'center' dans la configuration.
function alignOf(section) {
  if (['left', 'right', 'center'].includes(section.align)) return section.align;
  const n = (section.name || '').toLowerCase();
  if (/\bgauche\b/.test(n)) return 'right';
  if (/\bdroit(e)?\b/.test(n)) return 'left';
  return 'center';
}

export function layoutVenue(eventId, config) {
  const sections = config?.sections || [];
  const maxCol = Math.max(1, ...sections.map((s) => s.gridColumn || 1));
  const maxRow = Math.max(1, ...sections.map((s) => s.gridRow || 1));

  const info = sections.map((s) => {
    const rows = (s.rows || []).map((r) => ({ label: r.label, numbers: rowSeatNumbers(r) }));
    const maxLen = Math.max(6, ...rows.map((r) => r.numbers.length));
    return {
      section: s,
      rows,
      col: (s.gridColumn || 1) - 1,
      row: (s.gridRow || 1) - 1,
      w: maxLen * SP + 2 * GUTTER,
      h: HEAD + Math.max(1, rows.length) * RG + 18,
    };
  });

  const colW = Array(maxCol).fill(0);
  const rowH = Array(maxRow).fill(0);
  for (const i of info) {
    colW[i.col] = Math.max(colW[i.col], i.w);
    rowH[i.row] = Math.max(rowH[i.row], i.h);
  }
  const colX = [];
  let x = MARGIN;
  for (let c = 0; c < maxCol; c++) { colX[c] = x; x += colW[c] + COL_GAP; }
  const rowY = [];
  let y = TOP;
  for (let r = 0; r < maxRow; r++) { rowY[r] = y; y += rowH[r] + ROW_GAP; }

  const width = Math.max(900, x - COL_GAP + MARGIN);
  const height = y - ROW_GAP + 70;
  const cx = width / 2;
  const curve = (px) => -CURVE * (px - cx) ** 2;

  const seats = [];
  const blocks = [];
  const rowLabels = [];
  for (const i of info) {
    const { section } = i;
    const sx = colX[i.col] + (colW[i.col] - i.w) / 2;
    const sy = rowY[i.row];
    blocks.push({ id: section.id, name: section.name, color: section.color || '#c9a24b', x: sx, y: sy, w: i.w, h: i.h });
    i.rows.forEach((r, ri) => {
      const n = r.numbers.length;
      const align = alignOf(section);
      const x0 =
        align === 'right' ? sx + i.w - GUTTER - n * SP
        : align === 'left' ? sx + GUTTER
        : sx + (i.w - n * SP) / 2;
      const baseY = sy + HEAD + ri * RG + RG / 2;
      if (n > 0) {
        rowLabels.push({ text: r.label, x: x0 - 16, y: baseY + curve(x0) });
        rowLabels.push({ text: r.label, x: x0 + n * SP + 16, y: baseY + curve(x0 + n * SP) });
      }
      r.numbers.forEach((num, k) => {
        const px = x0 + SP * (k + 0.5);
        seats.push({
          id: makeSeatId(eventId, section.id, r.label, num),
          x: Math.round(px * 10) / 10,
          y: Math.round((baseY + curve(px)) * 10) / 10,
          r: SEAT_R,
          sectionId: section.id,
          sectionName: section.name,
          color: section.color || '#c9a24b',
          price: section.price,
          row: r.label,
          number: num,
        });
      });
    });
  }

  return {
    width, height, cx, curve, seats, blocks, rowLabels,
    stage: { cx, hw: Math.min(width * 0.42, 640), top: 36, front: 150 },
  };
}
