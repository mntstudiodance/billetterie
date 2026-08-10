export default function Legend({ sectionColor }) {
  return (
    <div className="seatplan-legend">
      <span className="seatplan-legend-item">
        <span
          className="seatplan-legend-swatch"
          style={{ background: 'transparent', border: `1px solid ${sectionColor || '#c9a24b'}` }}
        />
        Disponible
      </span>
      <span className="seatplan-legend-item">
        <span className="seatplan-legend-swatch" style={{ background: 'var(--gold)' }} />
        Sélectionné
      </span>
      <span className="seatplan-legend-item">
        <span className="seatplan-legend-swatch" style={{ background: 'var(--sold)' }} />
        Déjà pris
      </span>
      <span className="seatplan-legend-item">
        <span
          className="seatplan-legend-swatch"
          style={{ background: 'transparent', border: '1px solid #3a2c30' }}
        />
        Autre catégorie
      </span>
    </div>
  );
}
