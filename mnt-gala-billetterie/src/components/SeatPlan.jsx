import './SeatPlan.css';
import { makeSeatId } from '../utils/seatMap';

// props:
// - eventId: 'samedi' | 'dimanche' — nécessaire pour générer des identifiants
//   de sièges cohérents avec ceux stockés dans Firestore
// - config: venueConfig ({ sections: [...] })
// - seatsById: Map<seatId, { status, sectionId, transactionId }>
// - selectable: bool — si false, aucune interaction (mode aperçu admin)
// - adminMode: bool — mode gestion admin : tous les sièges sont cliquables
//   (y compris vendus/bloqués), pour bloquer/débloquer ou consulter l'info
// - allowedCategoryName: si fourni, seuls les sièges des blocs portant ce NOM
//   sont cliquables — si plusieurs blocs partagent le même nom, ils sont tous
//   sélectionnables (le spectateur choisit lui-même entre eux)
// - selectedIds: Set<seatId>
// - onToggleSeat: (seatId, sectionId, status) => void
export default function SeatPlan({
  eventId,
  config,
  seatsById,
  selectable = false,
  adminMode = false,
  allowedCategoryName = null,
  selectedIds = new Set(),
  onToggleSeat,
}) {
  if (!config || !Array.isArray(config.sections) || config.sections.length === 0) {
    return <p className="seatplan-empty">Le plan de salle n'a pas encore été configuré.</p>;
  }

  const maxCol = Math.max(1, ...config.sections.map((s) => s.gridColumn || 1));
  const maxRow = Math.max(1, ...config.sections.map((s) => s.gridRow || 1));

  return (
    <div className="seatplan-wrap">
      <div className="seatplan-stage">SCÈNE</div>
      <div
        className="seatplan-grid"
        style={{
          gridTemplateColumns: `repeat(${maxCol}, auto)`,
          gridTemplateRows: `repeat(${maxRow}, auto)`,
        }}
      >
        {config.sections.map((section) => {
          const sectionAllowed = !allowedCategoryName || section.name === allowedCategoryName;
          return (
          <div
            key={section.id}
            className="seatplan-section"
            style={{
              gridColumn: section.gridColumn || 1,
              gridRow: section.gridRow || 1,
              '--section-color': section.color || '#c9a24b',
            }}
          >
            <div className="seatplan-section-name">{section.name}</div>
            <div className="seatplan-section-rows">
            {(section.rows || []).map((row) => {
              const start = row.startNumber ?? 1;
              const removed = new Set(row.removed || []);
              const numbers = Array.from({ length: row.seatCount }, (_, i) => start + i).filter(
                (n) => !removed.has(n)
              );
              return (
                <div className="seatplan-row" key={row.label}>
                  <span className="seatplan-row-label">{row.label}</span>
                  <div className="seatplan-seats">
                    {numbers.map((n) => {
                      const seatId = makeSeatId(eventId, section.id, row.label, n);
                      const seatInfo = seatsById.get(seatId);
                      const status = seatInfo?.status || 'available';
                      const isSold = status === 'sold';
                      const isBlocked = status === 'blocked';
                      const isUnavailable = isSold || isBlocked;
                      const isSelected = selectedIds.has(seatId);
                      const isInteractable = adminMode
                        ? true
                        : selectable && !isUnavailable && sectionAllowed;

                      const classes = ['seat'];
                      if (isSold) classes.push('seat-sold');
                      else if (isBlocked) classes.push(adminMode ? 'seat-blocked' : 'seat-sold');
                      else if (isSelected) classes.push('seat-selected');
                      else if (!adminMode && allowedCategoryName && !sectionAllowed)
                        classes.push('seat-dimmed');
                      else classes.push('seat-available');
                      if (isInteractable) classes.push('seat-clickable');

                      let title = `${section.name} — Rang ${row.label}, Siège ${n}`;
                      if (adminMode) {
                        if (isSold) title += ' — Vendu';
                        else if (isBlocked) title += ` — Bloqué${seatInfo?.blockedNote ? ` (${seatInfo.blockedNote})` : ''}`;
                        else title += ' — Disponible';
                      }

                      return (
                        <button
                          key={seatId}
                          type="button"
                          className={classes.join(' ')}
                          title={title}
                          disabled={!isInteractable}
                          onClick={() => isInteractable && onToggleSeat?.(seatId, section.id, status)}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
