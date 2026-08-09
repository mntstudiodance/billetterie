import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { EVENTS } from '../utils/events';

export default function AdminOverview() {
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const [config, setConfig] = useState(null);
  const [seats, setSeats] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    getDoc(doc(db, 'venueConfig', eventId)).then((snap) => {
      setConfig(snap.exists() ? snap.data() : null);
    });
  }, [eventId]);

  useEffect(() => {
    const seatsQuery = query(collection(db, 'seats'), where('eventId', '==', eventId));
    const unsub1 = onSnapshot(seatsQuery, (snap) => setSeats(snap.docs.map((d) => d.data())));
    const bookingsQuery = query(collection(db, 'bookings'), where('eventId', '==', eventId));
    const unsub2 = onSnapshot(bookingsQuery, (snap) => setBookings(snap.docs.map((d) => d.data())));
    return () => {
      unsub1();
      unsub2();
    };
  }, [eventId]);

  const totalSeats = seats.length;
  const soldSeats = seats.filter((s) => s.status === 'sold').length;
  const pendingBookings = bookings.filter((b) => b.status === 'pending').length;
  const completedBookings = bookings.filter((b) => b.status === 'completed').length;

  const bySection = (config?.sections || []).map((section) => {
    const sectionSeats = seats.filter((s) => s.sectionId === section.id);
    const sold = sectionSeats.filter((s) => s.status === 'sold').length;
    return { section, total: sectionSeats.length, sold };
  });

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard label="Places vendues" value={`${soldSeats} / ${totalSeats}`} />
        <StatCard label="Transactions — billets émis" value={completedBookings} />
        <StatCard label="Transactions en attente" value={pendingBookings} />
      </div>

      <div className="card" style={{ maxWidth: 'none' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Par catégorie</h2>
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Vendues</th>
              <th>Total</th>
              <th>Remplissage</th>
            </tr>
          </thead>
          <tbody>
            {bySection.map(({ section, total, sold }) => (
              <tr key={section.id}>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: section.color,
                      marginRight: 8,
                    }}
                  />
                  {section.name}
                </td>
                <td>{sold}</td>
                <td>{total}</td>
                <td>{total ? Math.round((sold / total) * 100) : 0}%</td>
              </tr>
            ))}
            {bySection.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--cream-dim)' }}>
                  Aucune catégorie configurée pour cette date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ maxWidth: 'none', textAlign: 'center' }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--gold-soft)' }}>
        {value}
      </div>
    </div>
  );
}
