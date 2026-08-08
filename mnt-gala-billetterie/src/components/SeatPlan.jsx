import './SeatPlan.css';
import { makeSeatId } from '../utils/seatMap';

// props:
// - config: venueConfig ({ sections: [...] })
// - seatsById: Map<seatId, { status, sectionId, transactionId }>
// - selectable: bool — si false, aucune interaction (mode aperçu admin)
// - allowedSectionId: si fourni, seuls les sièges de cette section sont cliquables
// - selectedIds: Set<seatId>
// - onToggleSeat: (seatId, sectionId) => void
export default function SeatPlan({
  config,
  seatsById,
  selectable = false,
  allowedSectionId = null,
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
        {config.sections.map((section) => (
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
            {(section.rows || []).map((row) => {
              const start = row.startNumber ?? 1;
              const numbers = Array.from({ length: row.seatCount }, (_, i) => start + i);
              return (
                <div className="seatplan-row" key={row.label}>
                  <span className="seatplan-row-label">{row.label}</span>
                  <div className="seatplan-seats">
                    {numbers.map((n) => {
                      const seatId = makeSeatId(section.id, row.label, n);
                      const seatInfo = seatsById.get(seatId);
                      const status = seatInfo?.status || 'available';
                      const isSold = status === 'sold';
                      const isSelected = selectedIds.has(seatId);
                      const isInteractable =
                        selectable &&
                        !isSold &&
                        (!allowedSectionId || section.id === allowedSectionId);

                      const classes = ['seat'];
                      if (isSold) classes.push('seat-sold');
                      else if (isSelected) classes.push('seat-selected');
                      else if (allowedSectionId && section.id !== allowedSectionId)
                        classes.push('seat-dimmed');
                      else classes.push('seat-available');
                      if (isInteractable) classes.push('seat-clickable');

                      return (
                        <button
                          key={seatId}
                          type="button"
                          className={classes.join(' ')}
                          title={`${section.name} — Rang ${row.label}, Siège ${n}`}
                          disabled={!isInteractable}
                          onClick={() => isInteractable && onToggleSeat?.(seatId, section.id)}
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
        ))}
      </div>
    </div>
  );
}
