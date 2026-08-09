import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { EVENTS, bookingDocId } from '../utils/events';

export default function AdminBookings() {
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const [config, setConfig] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [txId, setTxId] = useState('');
  const [category, setCategory] = useState('');
  const [seatCount, setSeatCount] = useState(1);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'venueConfig', eventId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConfig(data);
        setCategory(data.sections?.[0]?.id || '');
      } else {
        setConfig(null);
        setCategory('');
      }
    });
  }, [eventId]);

  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      where('eventId', '==', eventId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [eventId]);

  async function handleAdd(e) {
    e.preventDefault();
    setMessage('');
    const rawId = txId.trim();
    if (!rawId || !category || !seatCount) return;
    setSaving(true);
    try {
      const docId = bookingDocId(eventId, rawId);
      const existing = await getDoc(doc(db, 'bookings', docId));
      if (existing.exists()) {
        setMessage('Ce numéro de transaction existe déjà pour cette date.');
        setSaving(false);
        return;
      }
      await setDoc(doc(db, 'bookings', docId), {
        eventId,
        transactionNumber: rawId,
        category,
        seatCount: Number(seatCount),
        status: 'pending',
        seatIds: [],
        createdAt: serverTimestamp(),
      });
      setTxId('');
      setSeatCount(1);
      setMessage(`Transaction ${rawId} enregistrée.`);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'enregistrement.");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm(`Supprimer cette transaction ? Cette action est irréversible.`)) return;
    await deleteDoc(doc(db, 'bookings', id));
  }

  function sectionName(id) {
    return config?.sections?.find((s) => s.id === id)?.name || id;
  }

  const shareBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const visible = bookings.filter((b) =>
    (b.transactionNumber || b.id).toLowerCase().includes(filter.toLowerCase())
  );

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

      <form className="card" style={{ maxWidth: 'none' }} onSubmit={handleAdd}>
        <h2 style={{ fontSize: '1.15rem' }}>Nouvelle transaction — {EVENTS.find((e) => e.id === eventId)?.label}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr auto', gap: '0.8rem', alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Numéro de transaction (Assoconnect)</label>
            <input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="ex : ASC-2027-00123" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Catégorie</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {config?.sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Places</label>
            <input type="number" min={1} value={seatCount} onChange={(e) => setSeatCount(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || !config?.sections?.length}>
            Ajouter
          </button>
        </div>
        {!config?.sections?.length && (
          <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem' }}>
            Configure d'abord au moins une catégorie pour cette date dans l'onglet « Plan de salle ».
          </p>
        )}
        {message && <p style={{ color: 'var(--gold-soft)' }}>{message}</p>}
      </form>

      <div className="card" style={{ maxWidth: 'none', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Transactions ({bookings.length})</h2>
          <input placeholder="Filtrer par numéro…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }} />
        </div>
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Catégorie</th>
              <th>Places</th>
              <th>Statut</th>
              <th>Sièges attribués</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.id}>
                <td>{b.transactionNumber || b.id}</td>
                <td>{sectionName(b.category)}</td>
                <td>{b.seatCount}</td>
                <td>
                  <span className={`tag ${b.status === 'completed' ? 'tag-completed' : 'tag-pending'}`}>
                    {b.status === 'completed' ? 'Billets émis' : 'En attente'}
                  </span>
                </td>
                <td>{(b.seatIds || []).map((sid) => sid.split('-').slice(1).join('-')).join(', ') || '—'}</td>
                <td>
                  {b.status !== 'completed' && (
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(b.id)}>
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--cream-dim)' }}>
                  Aucune transaction pour cette date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem', marginTop: '1rem' }}>
        Lien à transmettre au client : <code>{shareBaseUrl}/{eventId}/r/&lt;numéro de transaction&gt;</code>
      </p>
    </div>
  );
}
