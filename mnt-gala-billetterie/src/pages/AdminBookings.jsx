import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
        setCategory(data.sections?.[0]?.name || '');
      } else {
        setConfig(null);
        setCategory('');
      }
    });
  }, [eventId]);

  // Pas de tri Firestore (orderBy) ici volontairement : combiné à un "where",
  // il exige un index composite à créer manuellement dans la console, et tant
  // qu'il n'existe pas la requête échoue silencieusement — l'historique
  // paraissait alors vide. On trie côté client à la place, et on affiche
  // toute erreur Firestore pour ne plus jamais avoir ce problème en silence.
  useEffect(() => {
    const q = query(collection(db, 'bookings'), where('eventId', '==', eventId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setBookings(list);
      },
      (err) => {
        console.error(err);
        setMessage(`Erreur de chargement des transactions : ${err.message}`);
      }
    );
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

  // Libère les places déjà attribuées à une transaction validée (les remet
  // "available") et repasse la transaction en attente, pour que la personne
  // puisse resélectionner ses places depuis zéro sur le même lien.
  async function releaseSeats(booking) {
    if (!booking.seatIds || booking.seatIds.length === 0) return;
    const batch = writeBatch(db);
    for (const seatId of booking.seatIds) {
      batch.update(doc(db, 'seats', seatId), {
        status: 'available',
        transactionId: null,
        soldAt: null,
        checkedIn: false,
        checkedInAt: null,
      });
    }
    await batch.commit();
  }

  async function handleReset(booking) {
    if (
      !confirm(
        `Libérer les ${booking.seatCount} place(s) de la transaction "${booking.transactionNumber || booking.id}" ? La personne pourra resélectionner ses places depuis le même lien. Cette action est irréversible.`
      )
    )
      return;
    setMessage('');
    try {
      await releaseSeats(booking);
      await updateDoc(doc(db, 'bookings', booking.id), { status: 'pending', seatIds: [] });
      setMessage(`Places libérées pour la transaction "${booking.transactionNumber || booking.id}".`);
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de la libération des places.');
    }
  }

  async function handleDelete(booking) {
    const warning =
      booking.status === 'completed'
        ? `Supprimer la transaction "${booking.transactionNumber || booking.id}" ? Les ${booking.seatCount} place(s) déjà attribuées seront aussi libérées. Cette action est irréversible.`
        : `Supprimer la transaction "${booking.transactionNumber || booking.id}" ? Cette action est irréversible.`;
    if (!confirm(warning)) return;
    setMessage('');
    try {
      if (booking.status === 'completed') {
        await releaseSeats(booking);
      }
      await deleteDoc(doc(db, 'bookings', booking.id));
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de la suppression.');
    }
  }

  // Une catégorie = un nom. Plusieurs blocs peuvent partager le même nom
  // (le spectateur pourra alors choisir librement entre eux au moment de
  // sélectionner ses places) ; on ne les propose donc qu'une seule fois ici.
  const categoryNames = [...new Set((config?.sections || []).map((s) => s.name))];

  function blockCountFor(name) {
    return (config?.sections || []).filter((s) => s.name === name).length;
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
              {categoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {blockCountFor(name) > 1 ? ` (${blockCountFor(name)} blocs au choix)` : ''}
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
                <td>{b.category}</td>
                <td>{b.seatCount}</td>
                <td>
                  <span className={`tag ${b.status === 'completed' ? 'tag-completed' : 'tag-pending'}`}>
                    {b.status === 'completed' ? 'Billets émis' : 'En attente'}
                  </span>
                </td>
                <td>{(b.seatIds || []).map((sid) => sid.split('-').slice(1).join('-')).join(', ') || '—'}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  {b.status === 'completed' && (
                    <button className="btn btn-small" onClick={() => handleReset(b)}>
                      Réinitialiser
                    </button>
                  )}
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(b)}>
                    Supprimer
                  </button>
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
