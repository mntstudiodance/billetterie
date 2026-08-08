import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import SeatPlan from '../components/SeatPlan';
import Legend from '../components/Legend';
import { generateTicketsPdf } from '../utils/ticketPdf';

const ERROR_MESSAGES = {
  BOOKING_NOT_FOUND: "Ce numéro de transaction est introuvable.",
  ALREADY_COMPLETED: 'Ces billets ont déjà été émis. Rafraîchissez la page pour les retélécharger.',
  COUNT_MISMATCH: 'Le nombre de places sélectionnées ne correspond pas à votre réservation.',
  SEAT_MISSING: "Une des places sélectionnées n'existe plus, merci de recommencer.",
  SEAT_TAKEN: 'Une des places choisies vient tout juste d\'être prise par quelqu\'un d\'autre. Merci de resélectionner.',
  WRONG_CATEGORY: "Une des places sélectionnées ne correspond pas à votre catégorie.",
};

export default function ClientFlow() {
  const { transactionId: paramId } = useParams();
  const [inputId, setInputId] = useState(paramId || '');
  const [step, setStep] = useState('entry'); // entry | selecting | success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [booking, setBooking] = useState(null);
  const [transactionId, setTransactionId] = useState(paramId || '');
  const [seatsById, setSeatsById] = useState(new Map());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [ticketSeats, setTicketSeats] = useState([]);

  // Charge le plan de salle une fois (lecture publique)
  useEffect(() => {
    getDoc(doc(db, 'venueConfig', 'main')).then((snap) => {
      if (snap.exists()) setConfig(snap.data());
    });
  }, []);

  // Écoute en direct les sièges pendant la sélection
  useEffect(() => {
    if (step !== 'selecting') return undefined;
    const unsub = onSnapshot(collection(db, 'seats'), (snap) => {
      const map = new Map();
      snap.forEach((d) => map.set(d.id, d.data()));
      setSeatsById(map);
    });
    return () => unsub();
  }, [step]);

  const allowedSection = useMemo(
    () => config?.sections?.find((s) => s.id === booking?.category),
    [config, booking]
  );

  async function handleEntrySubmit(e) {
    e.preventDefault();
    setError('');
    const id = inputId.trim();
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'bookings', id));
      if (!snap.exists()) {
        setError(ERROR_MESSAGES.BOOKING_NOT_FOUND);
        setLoading(false);
        return;
      }
      const data = snap.data();
      setTransactionId(id);
      setBooking(data);

      if (data.status === 'completed') {
        // Reconstruit les billets à partir des sièges déjà attribués
        const seatDocs = await Promise.all(
          (data.seatIds || []).map((sid) => getDoc(doc(db, 'seats', sid)))
        );
        const seats = seatDocs
          .filter((d) => d.exists())
          .map((d) => ({ seatId: d.id, ...d.data() }));
        setTicketSeats(seats);
        setStep('success');
      } else {
        setStep('selecting');
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue, merci de réessayer.");
    }
    setLoading(false);
  }

  function toggleSeat(seatId, sectionId) {
    setError('');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) {
        next.delete(seatId);
        return next;
      }
      if (next.size >= (booking?.seatCount || 0)) return prev;
      next.add(seatId);
      return next;
    });
  }

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      await runTransaction(db, async (tx) => {
        const bookingRef = doc(db, 'bookings', transactionId);
        const bookingSnap = await tx.get(bookingRef);
        if (!bookingSnap.exists()) throw new Error('BOOKING_NOT_FOUND');
        const currentBooking = bookingSnap.data();
        if (currentBooking.status === 'completed') throw new Error('ALREADY_COMPLETED');
        if (selectedIds.size !== currentBooking.seatCount) throw new Error('COUNT_MISMATCH');

        const ids = [...selectedIds];
        const seatRefs = ids.map((id) => doc(db, 'seats', id));
        const seatSnaps = await Promise.all(seatRefs.map((ref) => tx.get(ref)));

        seatSnaps.forEach((snap) => {
          if (!snap.exists()) throw new Error('SEAT_MISSING');
          const data = snap.data();
          if (data.status !== 'available') throw new Error('SEAT_TAKEN');
          if (data.sectionId !== currentBooking.category) throw new Error('WRONG_CATEGORY');
        });

        seatRefs.forEach((ref) => {
          tx.update(ref, { status: 'sold', transactionId, soldAt: serverTimestamp() });
        });
        tx.update(bookingRef, {
          status: 'completed',
          seatIds: ids,
          completedAt: serverTimestamp(),
        });
      });

      const seats = [...selectedIds].map((id) => ({ seatId: id, ...seatsById.get(id) }));
      setTicketSeats(seats);
      setStep('success');
    } catch (err) {
      const msg = ERROR_MESSAGES[err.message] || 'Une erreur est survenue, merci de réessayer.';
      setError(msg);
    }
    setLoading(false);
  }

  async function handleDownload() {
    await generateTicketsPdf({
      event: {
        eventName: config?.eventName,
        eventDates: config?.eventDates,
        venueName: config?.venueName,
      },
      seats: ticketSeats,
      transactionId,
    });
  }

  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div className="eyebrow">Billetterie</div>
        <h1 style={{ fontSize: '2rem' }}>{config?.eventName || 'Gala MNT Studio Dance'}</h1>
        <p style={{ color: 'var(--cream-dim)', margin: 0 }}>
          {config?.eventDates} {config?.venueName ? `— ${config.venueName}` : ''}
        </p>
      </div>

      {step === 'entry' && (
        <form className="card" onSubmit={handleEntrySubmit}>
          <div className="field">
            <label htmlFor="tx">Numéro de transaction</label>
            <input
              id="tx"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="Reçu par email après votre achat"
              autoFocus
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Vérification…' : 'Choisir mes places'}
          </button>
          {error && <div className="error-box">{error}</div>}
        </form>
      )}

      {step === 'selecting' && booking && (
        <div style={{ width: '100%', maxWidth: 900 }}>
          <div className="card" style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
            <p style={{ margin: 0 }}>
              Catégorie <strong style={{ color: 'var(--gold-soft)' }}>{allowedSection?.name}</strong> —
              sélectionnez <strong>{booking.seatCount}</strong> place
              {booking.seatCount > 1 ? 's' : ''} ({selectedIds.size}/{booking.seatCount} choisies)
            </p>
          </div>

          <SeatPlan
            config={config}
            seatsById={seatsById}
            selectable
            allowedSectionId={booking.category}
            selectedIds={selectedIds}
            onToggleSeat={toggleSeat}
          />
          <Legend sectionColor={allowedSection?.color} />

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              disabled={selectedIds.size !== booking.seatCount || loading}
              onClick={handleConfirm}
            >
              {loading ? 'Confirmation…' : 'Valider mes places et émettre mes billets'}
            </button>
            {error && <div className="error-box">{error}</div>}
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Vos places sont confirmées 🎭</h2>
          <p style={{ color: 'var(--cream-dim)' }}>
            {ticketSeats.length} place{ticketSeats.length > 1 ? 's' : ''} —{' '}
            {ticketSeats.map((s) => `${s.row}${s.number}`).join(', ')}
          </p>
          <button className="btn btn-primary" onClick={handleDownload} style={{ marginTop: '1rem' }}>
            Télécharger mes billets (PDF)
          </button>
        </div>
      )}
    </div>
  );
}
