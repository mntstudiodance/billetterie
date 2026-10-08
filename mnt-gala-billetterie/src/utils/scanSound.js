// Sons de contrôle générés par le navigateur (Web Audio) : aucun fichier audio à charger.
// Les navigateurs exigent un geste de l'utilisateur (toucher l'écran) avant d'autoriser
// le son : on appelle unlockAudio() depuis un clic / toucher.

let ctx = null;

export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.state !== 'closed';
  } catch {
    return false;
  }
}

export function isAudioReady() {
  return !!ctx && ctx.state === 'running';
}

function tone(freq, start, dur, type = 'sine', gain = 0.35) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

// Billet valide : « ding-ding » aigu et montant
export function playSuccess() {
  if (ctx && ctx.state === 'running') {
    tone(880, 0, 0.16, 'sine');
    tone(1320, 0.13, 0.28, 'sine');
  }
  try { navigator.vibrate?.(80); } catch { /* ignoré */ }
}

// Billet déjà scanné / inconnu : buzzer grave et descendant
export function playError() {
  if (ctx && ctx.state === 'running') {
    tone(220, 0, 0.22, 'sawtooth', 0.3);
    tone(165, 0.24, 0.4, 'sawtooth', 0.3);
  }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignoré */ }
}
