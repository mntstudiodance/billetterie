import { useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './SeatPlan.css';
import SeatCanvas from './SeatCanvas';
import { layoutVenue } from '../utils/venueLayout';

// Plan de salle Canvas (zoom / déplacement / minimap). Mêmes props que l'ancienne
// version DOM, donc ClientFlow et AdminSeats fonctionnent sans changement.
// props:
// - eventId: 'samedi' | 'dimanche'
// - config: venueConfig ({ sections: [...] })
// - seatsById: Map<seatId, { status, sectionId, transactionId, blockedNote }>
// - selectable: si false, aucune interaction (aperçu)
// - adminMode: tous les sièges cliquables (bloquer / débloquer) ; le clic appelle directement onToggleSeat
// - allowedCategoryName: seuls les blocs de ce NOM sont sélectionnables, les autres sont estompés
// - selectedIds: Set<seatId>
// - maxSelectable: nombre max de places (sinon le bouton « Choisir » est désactivé une fois atteint)
// - onToggleSeat: (seatId, sectionId, status) => void
export default function SeatPlan({
  eventId,
  config,
  seatsById,
  selectable = false,
  adminMode = false,
  allowedCategoryName = null,
  selectedIds = new Set(),
  maxSelectable = null,
  onToggleSeat,
}) {
  const canvasRef = useRef(null);
  const [tapped, setTapped] = useState(null);

  const layout = useMemo(() => (config?.sections?.length ? layoutVenue(eventId, config) : null), [eventId, config]);

  // état visuel de chaque siège (recalculé quand les ventes / blocages changent)
  const seats = useMemo(() => {
    if (!layout) return [];
    return layout.seats.map((s) => {
      const info = seatsById?.get(s.id);
      const status = info?.status || 'available';
      const allowed = !allowedCategoryName || s.sectionName === allowedCategoryName;
      let v = 'available';
      if (status === 'sold') v = 'sold';
      else if (status === 'blocked') v = adminMode ? 'blocked' : 'sold';
      else if (!adminMode && allowedCategoryName && !allowed) v = 'dimmed';
      const tap = adminMode ? true : selectable && v === 'available';
      return { ...s, status, v, tap, note: info?.blockedNote };
    });
  }, [layout, seatsById, adminMode, selectable, allowedCategoryName]);

  const onTap = useCallback((seat) => {
    if (!seat.tap) return;
    if (adminMode) { onToggleSeat?.(seat.id, seat.sectionId, seat.status); return; }
    setTapped(seat);
    canvasRef.current?.focusSeat(seat, 90);
  }, [adminMode, onToggleSeat]);

  if (!layout) {
    return <p className="seatplan-empty">Le plan de salle n'a pas encore été configuré.</p>;
  }

  const isSelected = tapped && selectedIds.has(tapped.id);
  const full = maxSelectable != null && selectedIds.size >= maxSelectable && !isSelected;
  const close = () => setTapped(null);

  return (
    <div className="seatplan-wrap">
      <SeatCanvas
        ref={canvasRef}
        layout={layout}
        seats={seats}
        selectedIds={selectedIds}
        onTap={onTap}
        onBackgroundTap={close}
        shiftMinimap={!!tapped}
      />
      <div className="seatplan-zoom">
        <button type="button" aria-label="Zoomer" onClick={() => canvasRef.current?.zoomIn()}>+</button>
        <button type="button" aria-label="Dézoomer" onClick={() => canvasRef.current?.zoomOut()}>−</button>
        <button type="button" aria-label="Vue d'ensemble" onClick={() => canvasRef.current?.reset()}>⤢</button>
      </div>

      <AnimatePresence>
        {tapped && (
          <motion.div
            key="sheet"
            className="seatplan-sheet"
            role="dialog"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) close(); }}
          >
            <div className="seatplan-sheet-grip" />
            <div className="seatplan-sheet-top">
              <div>
                <p className="seatplan-sheet-bloc">{tapped.sectionName}</p>
                <h3 className="seatplan-sheet-title">Rangée {tapped.row}, Place {tapped.number}</h3>
              </div>
              {tapped.price != null && (
                <div className="seatplan-sheet-price" style={{ color: tapped.color }}>{tapped.price} €</div>
              )}
            </div>
            {maxSelectable != null && (
              <p className="seatplan-sheet-note">{selectedIds.size}/{maxSelectable} place{maxSelectable > 1 ? 's' : ''} choisie{selectedIds.size > 1 ? 's' : ''}</p>
            )}
            <div className="seatplan-sheet-actions">
              <button type="button" className="seatplan-sheet-cancel" onClick={close}>Fermer</button>
              <button
                type="button"
                className={'seatplan-sheet-btn' + (isSelected ? ' is-remove' : '')}
                disabled={full}
                onClick={() => { onToggleSeat?.(tapped.id, tapped.sectionId, tapped.status); close(); }}
              >
                {isSelected ? 'Retirer cette place' : full ? 'Maximum atteint' : 'Choisir cette place'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
