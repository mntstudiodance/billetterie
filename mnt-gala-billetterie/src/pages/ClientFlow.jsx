import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import SeatPlan from '../components/SeatPlan';
import Legend from '../components/Legend';
import { generateTicketsPdf } from '../utils/ticketPdf';
import { emailTickets, isEmailDeliveryConfigured } from '../utils/emailTickets';
import { bookingDocId, eventLabel } from '../utils/events';

const ERROR_MESSAGES = {
  BOOKING_NOT_FOUND: 'Ce numéro de transaction est introuvable pour cette date.',
  ALREADY_COMPLETED: 'Ces billets ont déjà été émis. Rafraîchissez la page pour les retélécharger.',
  COUNT_MISMATCH: 'Le nombre de places sélectionnées ne correspond pas à votre réservation.',
  SEAT_MISSING: "Une des places sélectionnées n'existe plus, merci de recommencer.",
  SEAT_TAKEN: "Une des places choisies vient tout juste d'être prise par quelqu'un d'autre. Merci de resélectionner.",
  WRONG_CATEGORY: "Une des places sélectionnées ne correspond pas à votre catégorie.",
};

export default function ClientFlow({ eventId }) {
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
  const [emailAddress, setEmailAddress] = useState('');
  const [emailStatus, setEmailStatus] = useState('idle'); // idle | sending | sent | error
  const [emailErrorMsg, setEmailErrorMsg] = useState('');

  // Charge le plan de salle de cette date (lecture publique)
  useEffect(() => {
    getDoc(doc(db, 'venueConfig', eventId)).then((snap) => {
      if (snap.exists()) setConfig(snap.data());
    });
  }, [eventId]);

  // Écoute en direct les sièges de cette date pendant la sélection
  useEffect(() => {
    if (step !== 'selecting') return undefined;
    const seatsQuery = query(collection(db, 'seats'), where('eventId', '==', eventId));
    const unsub = onSnapshot(seatsQuery, (snap) => {
      const map = new Map();
      snap.forEach((d) => map.set(d.id, d.data()));
      setSeatsById(map);
    });
    return () => unsub();
  }, [step, eventId]);

  const allowedSection = useMemo(
    () => config?.sections?.find((s) => s.name === booking?.category),
    [config, booking]
  );

  async function handleEntrySubmit(e) {
    e.preventDefault();
    setError('');
    const idText = inputId.trim();
    if (!idText) return;
    setLoading(true);
    try {
      const docId = bookingDocId(eventId, idText);
      const snap = await getDoc(doc(db, 'bookings', docId));
      if (!snap.exists()) {
        setError(ERROR_MESSAGES.BOOKING_NOT_FOUND);
        setLoading(false);
        return;
      }
      const data = snap.data();
      setTransactionId(idText);
      setBooking(data);

      if (data.status === 'completed') {
        const seatDocs = await Promise.all(
          (data.seatIds || []).map((sid) => getDoc(doc(db, 'seats', sid)))
        );
        const seats = seatDocs.filter((d) => d.exists()).map((d) => ({ seatId: d.id, ...d.data() }));
        setTicketSeats(seats);
        setStep('success');
      } else {
        setStep('selecting');
      }
    } catch (err) {
      console.error(err);
      setError('Une erreur est survenue, merci de réessayer.');
    }
    setLoading(false);
  }

  function toggleSeat(seatId) {
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
    const docId = bookingDocId(eventId, transactionId);
    try {
      await runTransaction(db, async (tx) => {
        const bookingRef = doc(db, 'bookings', docId);
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
          if (data.sectionName !== currentBooking.category) throw new Error('WRONG_CATEGORY');
        });

        seatRefs.forEach((ref) => {
          tx.update(ref, { status: 'sold', transactionId: docId, soldAt: serverTimestamp() });
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
        eventDates: eventLabel(eventId),
        venueName: config?.venueName,
      },
      seats: ticketSeats,
      transactionId,
    });
  }

  async function handleEmailSend(e) {
    e.preventDefault();
    if (!emailAddress.trim()) return;
    setEmailStatus('sending');
    setEmailErrorMsg('');
    try {
      await emailTickets({
        toEmail: emailAddress.trim(),
        event: {
          eventName: config?.eventName,
          eventDates: eventLabel(eventId),
          venueName: config?.venueName,
        },
        seats: ticketSeats,
        transactionId,
      });
      setEmailStatus('sent');
    } catch (err) {
      console.error(err);
      setEmailStatus('error');
      setEmailErrorMsg(
        err.message === 'EMAIL_NOT_CONFIGURED'
          ? "L'envoi par email n'est pas configuré pour ce site."
          : "L'envoi a échoué, merci de réessayer ou de télécharger le PDF directement."
      );
    }
  }

  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div className="eyebrow">Billetterie — {eventLabel(eventId)}</div>
        <h1 style={{ fontSize: '2rem' }}>{config?.eventName || 'Gala MNT Studio Dance'}</h1>
        <p style={{ color: 'var(--cream-dim)', margin: 0 }}>{config?.venueName}</p>
        {step === 'entry' && (
          <p style={{ marginTop: '0.6rem' }}>
            <Link to="/" style={{ fontSize: '0.85rem' }}>
              ← Ce n'est pas la bonne date ?
            </Link>
          </p>
        )}
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
              Catégorie <strong style={{ color: 'var(--gold-soft)' }}>{booking.category}</strong> —
              sélectionnez <strong>{booking.seatCount}</strong> place
              {booking.seatCount > 1 ? 's' : ''} ({selectedIds.size}/{booking.seatCount} choisies)
            </p>
          </div>

          <SeatPlan
            eventId={eventId}
            config={config}
            seatsById={seatsById}
            selectable
            allowedCategoryName={booking.category}
            selectedIds={selectedIds}
            maxSelectable={booking.seatCount}
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

          {isEmailDeliveryConfigured() && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #3a2c30' }}>
              <p style={{ color: 'var(--cream-dim)', fontSize: '0.88rem', marginTop: 0 }}>
                Vous pouvez aussi recevoir vos billets par email :
              </p>
              {emailStatus === 'sent' ? (
                <p className="success-box">Billets envoyés à {emailAddress} ✓</p>
              ) : (
                <form onSubmit={handleEmailSend} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="email"
                    required
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="votre@email.com"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-small" type="submit" disabled={emailStatus === 'sending'}>
                    {emailStatus === 'sending' ? 'Envoi…' : 'Envoyer'}
                  </button>
                </form>
              )}
              {emailStatus === 'error' && <div className="error-box">{emailErrorMsg}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
