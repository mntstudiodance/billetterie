import { useNavigate } from 'react-router-dom';
import { EVENTS } from '../utils/events';

export default function EventChooser() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div className="eyebrow">Billetterie</div>
        <h1 style={{ fontSize: '2rem' }}>Gala MNT Studio Dance</h1>
        <p style={{ color: 'var(--cream-dim)', margin: 0 }}>Théâtre de Sénart, Lieusaint</p>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ marginTop: 0, color: 'var(--cream-dim)' }}>
          Pour quelle représentation avez-vous acheté vos places ?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {EVENTS.map((ev) => (
            <button key={ev.id} className="btn btn-primary" onClick={() => navigate(`/${ev.id}`)}>
              {ev.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
