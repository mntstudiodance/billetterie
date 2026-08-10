import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import SeatPlan from '../components/SeatPlan';
import { formatSeatLabel } from '../utils/seatMap';
import { EVENTS } from '../utils/events';

export default function AdminSeats() {
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const [config, setConfig] = useState(null);
  const [seatsById, setSeatsById] = useState(new Map());
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage('');
    getDoc(doc(db, 'venueConfig', eventId)).then((snap) => {
      setConfig(snap.exists() ? snap.data() : null);
    });
  }, [eventId]);

  useEffect(() => {
    const q = query(collection(db, 'seats'), where('eventId', '==', eventId));
    const unsub = onSnapshot(q, (snap) => {
      const map = new Map();
      snap.forEach((d) => map.set(d.id, d.data()));
      setSeatsById(map);
    });
    return () => unsub();
  }, [eventId]);

  async function handleToggle(seatId, sectionId, status) {
    setMessage('');
    if (status === 'sold') {
      setMessage(
        "Cette place est déjà vendue. Pour la libérer, passe par l'onglet Transactions (bouton « Réinitialiser » sur la transaction concernée) plutôt que de la débloquer ici."
      );
      return;
    }

    const seatRef = doc(db, 'seats', seatId);

    if (status === 'blocked') {
      if (!confirm('Débloquer cette place et la remettre disponible à la vente ?')) return;
      await updateDoc(seatRef, { status: 'available', blockedNote: null });
      return;
    }

    // status === 'available'
    const note = prompt(
      'Bloquer cette place (invitation, presse, technique…). Tu peux ajouter une note (optionnel) :',
      ''
    );
    if (note === null) return; // annulé
    await updateDoc(seatRef, { status: 'blocked', blockedNote: note.trim() || null, transactionId: null });
  }

  const blockedSeats = [...seatsById.entries()]
    .filter(([, s]) => s.status === 'blocked')
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (a.sectionName + a.row).localeCompare(b.sectionName + b.row));

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {EVENTS.map((ev) => (
          <button
            key={ev.id}
            className="btn btn-small"
            style={eventId === ev.id ? { background: 'var(--gold)', color: 'var(--ink)' } : undefined}
            onClick={() => setEventId(ev.id)}
          >
            {ev.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, color: 'var(--cream-dim)' }}>
          Clique sur une place <strong style={{ color: 'var(--cream)' }}>disponible</strong> pour la bloquer
          (invitation, presse, réservation technique…) — elle ne sera alors plus proposée à la vente. Clique
          sur une place <strong style={{ color: '#d8cbe8' }}>bloquée</strong> (violette) pour la débloquer.
          Les places déjà <strong style={{ color: 'var(--cream)' }}>vendues</strong> ne sont pas modifiables
          ici, direction l'onglet Transactions.
        </p>
      </div>

      {message && <div className="error-box" style={{ maxWidth: 'none' }}>{message}</div>}

      <SeatPlan
        eventId={eventId}
        config={config}
        seatsById={seatsById}
        adminMode
        onToggleSeat={handleToggle}
      />
      <div className="seatplan-legend">
        <span className="seatplan-legend-item">
          <span
            className="seatplan-legend-swatch"
            style={{ background: 'transparent', border: '1px solid #c9a24b' }}
          />
          Disponible
        </span>
        <span className="seatplan-legend-item">
          <span className="seatplan-legend-swatch" style={{ background: '#5b4a7a' }} />
          Bloquée
        </span>
        <span className="seatplan-legend-item">
          <span className="seatplan-legend-swatch" style={{ background: 'var(--sold)' }} />
          Vendue
        </span>
      </div>

      <div className="card" style={{ maxWidth: 'none', marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Places bloquées ({blockedSeats.length})</h2>
        {blockedSeats.length === 0 ? (
          <p style={{ color: 'var(--cream-dim)' }}>Aucune place bloquée pour cette date.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Place</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blockedSeats.map((seat) => (
                <tr key={seat.id}>
                  <td>{seat.sectionName}</td>
                  <td>{formatSeatLabel(seat)}</td>
                  <td>{seat.blockedNote || '—'}</td>
                  <td>
                    <button
                      className="btn btn-small"
                      onClick={() => handleToggle(seat.id, seat.sectionId, 'blocked')}
                    >
                      Débloquer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
