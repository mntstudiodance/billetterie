import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { eventLabel } from '../utils/events';
import { formatSeatLabel } from '../utils/seatMap';

function extractSeatId(raw) {
  const text = raw.trim();
  const prefix = 'MNT-GALA|';
  if (text.startsWith(prefix)) return text.slice(prefix.length);
  return text;
}

// Accepte aussi la référence humaine affichée sous le QR ("SAMEDI · OR-A12")
// en la reconvertissant vers l'identifiant réel du document ("samedi__OR-A12").
function normalizeSeatId(input) {
  const cleaned = extractSeatId(input);
  if (cleaned.includes('__')) return cleaned;
  const parts = cleaned.split('·').map((p) => p.trim());
  if (parts.length === 2) return `${parts[0].toLowerCase()}__${parts[1]}`;
  return cleaned;
}

export default function ControlPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastScanRef = useRef({ code: '', at: 0 });

  const [cameraError, setCameraError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { ok: bool, title, detail, seat }

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (err) {
        setCameraError(
          "Impossible d'accéder à la caméra (vérifie les autorisations du navigateur). Utilise la saisie manuelle ci-dessous."
        );
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          const now = Date.now();
          const last = lastScanRef.current;
          // évite de re-déclencher en boucle sur le même QR pendant qu'il reste dans le champ
          if (code.data !== last.code || now - last.at > 4000) {
            lastScanRef.current = { code: code.data, at: now };
            handleScan(code.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    startCamera();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScan(rawValue) {
    if (checking) return;
    await checkSeat(normalizeSeatId(rawValue));
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await checkSeat(normalizeSeatId(manualInput));
    setManualInput('');
  }

  async function checkSeat(seatId) {
    setChecking(true);
    try {
      const seatRef = doc(db, 'seats', seatId);
      const snap = await getDoc(seatRef);

      if (!snap.exists()) {
        setResult({ ok: false, title: 'Billet introuvable', detail: `Référence inconnue : ${seatId}` });
        setChecking(false);
        return;
      }

      const seat = snap.data();

      if (seat.status !== 'sold') {
        setResult({
          ok: false,
          title: 'Ce billet ne semble pas valide',
          detail: "Cette place n'est pas enregistrée comme vendue.",
          seat,
        });
        setChecking(false);
        return;
      }

      if (seat.checkedIn) {
        const when = seat.checkedInAt?.toDate?.();
        setResult({
          ok: false,
          title: 'Billet déjà scanné',
          detail: when ? `Première entrée : ${when.toLocaleTimeString('fr-FR')}` : 'Ce billet a déjà été contrôlé.',
          seat,
        });
        setChecking(false);
        return;
      }

      await updateDoc(seatRef, { checkedIn: true, checkedInAt: serverTimestamp() });
      setResult({ ok: true, title: 'Billet valide — accès autorisé', detail: '', seat });
    } catch (err) {
      console.error(err);
      setResult({ ok: false, title: 'Erreur', detail: err.message });
    }
    setChecking(false);
  }

  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div className="eyebrow">Contrôle des billets</div>
        <h1 style={{ fontSize: '1.6rem' }}>Gala MNT Studio Dance</h1>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1',
            background: '#000',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: '1rem',
          }}
        >
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        {cameraError && <div className="error-box">{cameraError}</div>}

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Référence manuelle (sous le QR)"
            style={{ flex: 1 }}
          />
          <button className="btn btn-small" type="submit" disabled={checking}>
            Vérifier
          </button>
        </form>
      </div>

      {result && (
        <div
          className="card"
          style={{
            maxWidth: 420,
            marginTop: '1rem',
            textAlign: 'center',
            borderColor: result.ok ? 'var(--success)' : 'var(--danger)',
            background: result.ok ? 'rgba(91,140,90,0.1)' : 'rgba(193,85,74,0.1)',
          }}
        >
          <h2 style={{ color: result.ok ? '#9fd19e' : 'var(--danger)', fontSize: '1.3rem' }}>
            {result.ok ? '✅ ' : '❌ '}
            {result.title}
          </h2>
          {result.detail && <p style={{ color: 'var(--cream-dim)' }}>{result.detail}</p>}
          {result.seat && (
            <p style={{ color: 'var(--cream)' }}>
              {result.seat.sectionName} — {formatSeatLabel(result.seat)}
              <br />
              <span style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>
                {eventLabel(result.seat.eventId)}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
