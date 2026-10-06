import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';

const GOLD = '#d4af37';
const CHAMPAGNE = '#f1e3b5';
const MAX_SCALE = 4.5;
const MIN_SELECT_SCALE = 0.55; // sous ce zoom, un tap zoome au lieu de sélectionner
const TAP_ZOOM_SCALE = 1.2;
const MINI_W = 140;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Seat visuals : v = 'available' | 'sold' | 'blocked' | 'dimmed'
// seat.tap = true si le siège est cliquable.

function glowSprite(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color + 'cc');
  g.addColorStop(0.35, color + '55');
  g.addColorStop(1, color + '00');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

const SeatCanvas = forwardRef(function SeatCanvas(
  { layout, seats, selectedIds, onTap, onBackgroundTap, shiftMinimap = false },
  ref
) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const S = useRef({
    w: 0, h: 0, dpr: 1, scale: 1, tx: 0, ty: 0, minScale: 0.3,
    dirty: true, hover: null, selected: new Set(), focusId: null,
    pointers: new Map(), vx: 0, vy: 0, lastT: 0, inertia: false,
    anim: null, down: null, pinch: null, mini: null, miniDrag: false,
  }).current;

  const cbRef = useRef({});
  cbRef.current = { onTap, onBackgroundTap };
  const seatsRef = useRef(seats); seatsRef.current = seats;
  const layoutRef = useRef(layout); layoutRef.current = layout;

  const model = useMemo(() => {
    const grid = new Map();
    const CELL = 60;
    for (const s of seats) {
      const k = Math.floor(s.x / CELL) + ',' + Math.floor(s.y / CELL);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(s);
    }
    return { grid, CELL };
  }, [seats]);
  const modelRef = useRef(model); modelRef.current = model;
  const sprites = useRef({}).current;
  const spriteFor = (c) => sprites[c] || (sprites[c] = glowSprite(c));
  const invalidate = useCallback(() => { S.dirty = true; }, [S]);

  // ---- caméra -------------------------------------------------------------------
  const fitScale = useCallback(() => {
    const L = layoutRef.current;
    return Math.min(S.w / L.width, S.h / L.height) * 0.98;
  }, [S]);
  const fit = useCallback(() => {
    if (!S.w) return;
    const L = layoutRef.current;
    const sc = fitScale();
    S.minScale = sc * 0.85;
    S.scale = sc;
    S.tx = (S.w - L.width * sc) / 2;
    S.ty = 6;
    invalidate();
  }, [S, fitScale, invalidate]);

  const constrain = useCallback(() => {
    const L = layoutRef.current;
    const cw = L.width * S.scale, ch = L.height * S.scale;
    const mx = Math.max(60, S.w * 0.25), my = Math.max(60, S.h * 0.25);
    S.tx = cw + 2 * mx < S.w ? (S.w - cw) / 2 : clamp(S.tx, S.w - cw - mx, mx);
    S.ty = ch + 2 * my < S.h ? (S.h - ch) / 2 : clamp(S.ty, S.h - ch - my, my);
  }, [S]);

  const zoomAt = useCallback((px, py, ns0) => {
    const ns = clamp(ns0, S.minScale, MAX_SCALE);
    const wx = (px - S.tx) / S.scale, wy = (py - S.ty) / S.scale;
    S.scale = ns; S.tx = px - wx * ns; S.ty = py - wy * ns;
    constrain(); invalidate();
  }, [S, constrain, invalidate]);

  const animateTo = useCallback((wx, wy, scale, offsetY = 0, dur = 450) => {
    const ns = clamp(scale, S.minScale, MAX_SCALE);
    S.anim = {
      t0: performance.now(), dur,
      from: { s: S.scale, tx: S.tx, ty: S.ty },
      to: { s: ns, tx: S.w / 2 - wx * ns, ty: S.h / 2 - offsetY - wy * ns },
    };
    S.inertia = false; invalidate();
  }, [S, invalidate]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(S.w / 2, S.h / 2, S.scale * 1.5),
    zoomOut: () => zoomAt(S.w / 2, S.h / 2, S.scale / 1.5),
    reset: () => {
      const L = layoutRef.current; const sc = fitScale();
      animateTo(L.width / 2, (S.h / 2 - 6) / sc, sc);
    },
    focusSeat: (seat, offset = 0) => animateTo(seat.x, seat.y, Math.max(S.scale, 1.5), offset),
  }), [S, zoomAt, animateTo, fitScale]);

  useEffect(() => { S.selected = selectedIds || new Set(); invalidate(); }, [selectedIds, S, invalidate]);
  useEffect(() => { invalidate(); }, [seats, invalidate]);
  useEffect(() => { fit(); }, [layout, fit]);

  const hitTest = useCallback((px, py) => {
    const wx = (px - S.tx) / S.scale, wy = (py - S.ty) / S.scale;
    const { grid, CELL } = modelRef.current;
    const cx = Math.floor(wx / CELL), cy = Math.floor(wy / CELL);
    const slop = (S.scale < 1 ? 7 : 4) / S.scale;
    let best = null, bd = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = grid.get((cx + i) + ',' + (cy + j));
      if (!arr) continue;
      for (const s of arr) {
        const d = Math.hypot(s.x - wx, s.y - wy);
        if (d < s.r + slop && d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }, [S]);

  // ---- minimap (pré-rendue) ---------------------------------------------------------
  useEffect(() => {
    const mh = Math.round((MINI_W * layout.height) / layout.width);
    const off = document.createElement('canvas');
    off.width = MINI_W * 2; off.height = mh * 2;
    const x = off.getContext('2d');
    const k = (MINI_W * 2) / layout.width;
    x.fillStyle = '#0d1119'; x.fillRect(0, 0, off.width, off.height);
    x.scale(k, k);
    x.fillStyle = 'rgba(212,175,55,0.55)';
    const st = layout.stage;
    x.fillRect(st.cx - st.hw, st.top, st.hw * 2, st.front - st.top);
    for (const s of seats) {
      x.fillStyle = s.v === 'available' ? s.color : s.v === 'blocked' ? '#6d5a90' : s.v === 'dimmed' ? '#2c3040' : '#3a3f4e';
      x.fillRect(s.x - 8, s.y - 8, 16, 16);
    }
    S.mini = { off, mh };
    const m = miniRef.current;
    if (m) { m.width = MINI_W * 2; m.height = mh * 2; m.style.width = MINI_W + 'px'; m.style.height = mh + 'px'; }
    invalidate();
  }, [layout, seats, S, invalidate]);

  // ---- rendu ------------------------------------------------------------------------
  const draw = useCallback((now) => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const L = layoutRef.current;
    const { w, h, dpr, scale, tx, ty } = S;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w / 2, 0, 20, w / 2, h * 0.3, Math.max(w, h) * 0.9);
    bg.addColorStop(0, '#171c2b'); bg.addColorStop(0.5, '#0d1119'); bg.addColorStop(1, '#0a0d14');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);

    // scène
    const st = L.stage;
    const halo = ctx.createRadialGradient(st.cx, st.front, 10, st.cx, st.front + 80, st.hw * 1.2);
    halo.addColorStop(0, 'rgba(212,175,55,0.22)'); halo.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, st.top - 40, L.width, 700);
    ctx.beginPath();
    ctx.moveTo(st.cx - st.hw, st.top); ctx.lineTo(st.cx + st.hw, st.top);
    ctx.lineTo(st.cx + st.hw, st.front - 8);
    ctx.quadraticCurveTo(st.cx, st.front + 26, st.cx - st.hw, st.front - 8);
    ctx.closePath();
    const sg = ctx.createLinearGradient(0, st.top, 0, st.front + 20);
    sg.addColorStop(0, '#1b2030'); sg.addColorStop(1, '#2a2a22');
    ctx.fillStyle = sg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(212,175,55,0.7)'; ctx.stroke();
    ctx.shadowColor = GOLD; ctx.shadowBlur = 24; ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(241,227,181,0.95)';
    ctx.beginPath(); ctx.moveTo(st.cx - st.hw + 20, st.front + 12);
    ctx.quadraticCurveTo(st.cx, st.front + 46, st.cx + st.hw - 20, st.front + 12); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = CHAMPAGNE; ctx.font = '600 34px "Playfair Display", Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
    ctx.fillText('SCÈNE', st.cx + 7, (st.top + st.front) / 2 - 6);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // blocs : fond à bords haut/bas légèrement incurvés + titre en pastille
    for (const b of L.blocks) {
      const steps = 12;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const px = b.x + (b.w * i) / steps;
        const py = b.y + L.curve(px);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      for (let i = steps; i >= 0; i--) {
        const px = b.x + (b.w * i) / steps;
        ctx.lineTo(px, b.y + b.h + L.curve(px));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.028)'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(212,175,55,0.26)'; ctx.stroke();
    }
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    for (const b of L.blocks) {
      const lx = b.x + b.w / 2, ly = b.y + 22 + L.curve(lx);
      const txt = b.name.toUpperCase();
      const tw = Math.min(b.w - 8, ctx.measureText(txt).width + 24);
      ctx.fillStyle = 'rgba(10,13,20,0.9)';
      ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly - 14, tw, 28, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(212,175,55,0.95)';
      ctx.fillText(txt, lx, ly, b.w - 16);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    if (scale > 0.5) {
      ctx.fillStyle = 'rgba(241,227,181,0.55)';
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      for (const r of L.rowLabels) ctx.fillText(r.text, r.x, r.y);
    }

    // sièges visibles
    const vx0 = -tx / scale - 20, vy0 = -ty / scale - 20;
    const vx1 = (w - tx) / scale + 20, vy1 = (h - ty) / scale + 20;
    const vis = [];
    for (const s of seatsRef.current) {
      if (s.x < vx0 || s.x > vx1 || s.y < vy0 || s.y > vy1) continue;
      vis.push(s);
    }
    const sel = S.selected;

    // sold : mat et discret ; blocked : violet ; dimmed : fantôme
    ctx.fillStyle = '#2a2e3a'; ctx.beginPath();
    for (const s of vis) if (s.v === 'sold') { ctx.moveTo(s.x + s.r * 0.8, s.y); ctx.arc(s.x, s.y, s.r * 0.8, 0, 6.2832); }
    ctx.fill();
    ctx.fillStyle = '#6d5a90'; ctx.beginPath();
    for (const s of vis) if (s.v === 'blocked') { ctx.moveTo(s.x + s.r * 0.85, s.y); ctx.arc(s.x, s.y, s.r * 0.85, 0, 6.2832); }
    ctx.fill();
    ctx.globalAlpha = 0.22;
    const byColor = {};
    for (const s of vis) if (s.v === 'dimmed') (byColor[s.color] ||= []).push(s);
    for (const [c, arr] of Object.entries(byColor)) {
      ctx.fillStyle = c; ctx.beginPath();
      for (const s of arr) { ctx.moveTo(s.x + s.r * 0.75, s.y); ctx.arc(s.x, s.y, s.r * 0.75, 0, 6.2832); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // halos des disponibles
    if (scale > 0.25) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of vis) {
        if (s.v !== 'available' || sel.has(s.id)) continue;
        const hov = s === S.hover;
        const sz = s.r * (hov ? 7 : 4.2);
        ctx.globalAlpha = hov ? 1 : 0.7;
        ctx.drawImage(spriteFor(s.color), s.x - sz / 2, s.y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const avail = {};
    for (const s of vis) if (s.v === 'available' && !sel.has(s.id)) (avail[s.color] ||= []).push(s);
    for (const [c, arr] of Object.entries(avail)) {
      ctx.fillStyle = c; ctx.beginPath();
      for (const s of arr) { const rr = s.r * (s === S.hover ? 1.3 : 0.85); ctx.moveTo(s.x + rr, s.y); ctx.arc(s.x, s.y, rr, 0, 6.2832); }
      ctx.fill();
    }

    // numéros si assez zoomé
    if (scale > 1.7) {
      ctx.font = '600 9px Inter, system-ui, sans-serif';
      for (const s of vis) {
        if (sel.has(s.id)) continue;
        ctx.fillStyle = s.v === 'available' ? '#0a0d14' : '#565c70';
        ctx.fillText(s.number, s.x, s.y + 0.5);
      }
    }

    // sièges sélectionnés : halo néon pulsé
    if (sel.size) {
      const p = 0.5 + 0.5 * Math.sin(now / 260);
      for (const s of vis) {
        if (!sel.has(s.id)) continue;
        ctx.globalCompositeOperation = 'lighter';
        const sz = s.r * (6 + p * 3.5);
        ctx.globalAlpha = 0.6 + p * 0.4;
        ctx.drawImage(spriteFor('#ffe27a'), s.x - sz / 2, s.y - sz / 2, sz, sz);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.2, 0, 6.2832);
        ctx.fillStyle = CHAMPAGNE; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = GOLD;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1.6 + p * 0.4), 0, 6.2832); ctx.stroke();
        if (scale > 1.7) { ctx.fillStyle = '#0a0d14'; ctx.font = '700 10px Inter, sans-serif'; ctx.fillText(s.number, s.x, s.y + 0.5); }
      }
    }

    // minimap
    const mc = miniRef.current;
    if (mc && S.mini) {
      const m = mc.getContext('2d'); const mh = S.mini.mh;
      m.setTransform(2, 0, 0, 2, 0, 0);
      m.clearRect(0, 0, MINI_W, mh);
      m.drawImage(S.mini.off, 0, 0, MINI_W, mh);
      const k = MINI_W / L.width;
      m.strokeStyle = GOLD; m.lineWidth = 1.5; m.fillStyle = 'rgba(212,175,55,0.12)';
      const rx = clamp(vx0 + 20, 0, L.width) * k, ry = clamp(vy0 + 20, 0, L.height) * k;
      const rw = clamp(vx1 - 20, 0, L.width) * k - rx, rh = clamp(vy1 - 20, 0, L.height) * k - ry;
      m.fillRect(rx, ry, rw, rh); m.strokeRect(rx, ry, rw, rh);
    }
  }, [S]);

  useEffect(() => {
    let raf;
    const loop = (now) => {
      if (S.anim) {
        const a = S.anim, t = clamp((now - a.t0) / a.dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
        S.scale = a.from.s + (a.to.s - a.from.s) * e;
        S.tx = a.from.tx + (a.to.tx - a.from.tx) * e;
        S.ty = a.from.ty + (a.to.ty - a.from.ty) * e;
        constrain(); S.dirty = true;
        if (t >= 1) S.anim = null;
      } else if (S.inertia) {
        S.tx += S.vx * 16; S.ty += S.vy * 16; S.vx *= 0.94; S.vy *= 0.94;
        constrain(); S.dirty = true;
        if (Math.abs(S.vx) < 0.01 && Math.abs(S.vy) < 0.01) S.inertia = false;
      }
      if (S.dirty || S.selected.size) { S.dirty = false; draw(now); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [S, draw, constrain]);

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const first = !S.w;
      S.w = r.width; S.h = r.height;
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = canvasRef.current;
      c.width = Math.round(S.w * S.dpr); c.height = Math.round(S.h * S.dpr);
      c.style.width = S.w + 'px'; c.style.height = S.h + 'px';
      if (first) fit(); else { constrain(); invalidate(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [S, fit, constrain, invalidate]);

  // ---- gestes -------------------------------------------------------------------------
  useEffect(() => {
    const c = canvasRef.current;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      S.pointers.set(e.pointerId, p); S.anim = null; S.inertia = false;
      if (S.pointers.size === 1) {
        S.down = { x: p.x, y: p.y, t: performance.now(), moved: false };
        S.lastT = performance.now(); S.vx = S.vy = 0;
      } else if (S.pointers.size === 2) {
        const [a, b] = [...S.pointers.values()];
        S.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.scale, m: null };
        if (S.down) S.down.moved = true;
      }
    };
    const onMove = (e) => {
      const p = pos(e); const prev = S.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') {
          const hs = hitTest(p.x, p.y);
          const h = hs && hs.tap ? hs : null;
          if (h !== S.hover) { S.hover = h; c.style.cursor = h ? 'pointer' : 'grab'; invalidate(); }
        }
        return;
      }
      S.pointers.set(e.pointerId, p);
      if (S.pointers.size === 2 && S.pinch) {
        const [a, b] = [...S.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        zoomAt(mx, my, S.pinch.s * d / S.pinch.d);
        if (S.pinch.m) { S.tx += mx - S.pinch.m.x; S.ty += my - S.pinch.m.y; constrain(); }
        S.pinch.m = { x: mx, y: my };
        return;
      }
      if (S.pointers.size === 1 && S.down) {
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (!S.down.moved && Math.hypot(p.x - S.down.x, p.y - S.down.y) > 6) S.down.moved = true;
        if (S.down.moved) {
          S.tx += dx; S.ty += dy;
          const now = performance.now(), dt = Math.max(1, now - S.lastT);
          S.vx = 0.7 * S.vx + 0.3 * (dx / dt); S.vy = 0.7 * S.vy + 0.3 * (dy / dt); S.lastT = now;
          constrain(); invalidate(); c.style.cursor = 'grabbing';
        }
      }
    };
    const onUp = (e) => {
      const p = pos(e);
      S.pointers.delete(e.pointerId);
      if (S.pointers.size < 2) S.pinch = null;
      const d = S.down;
      if (S.pointers.size === 0 && d) {
        S.down = null; c.style.cursor = 'grab';
        if (!d.moved && performance.now() - d.t < 450) {
          const hit = hitTest(p.x, p.y);
          if (S.scale < MIN_SELECT_SCALE && (!hit || hit.tap)) {
            animateTo((p.x - S.tx) / S.scale, (p.y - S.ty) / S.scale, TAP_ZOOM_SCALE);
          } else if (hit) {
            cbRef.current.onTap?.(hit);
          } else {
            cbRef.current.onBackgroundTap?.();
          }
        } else if (d.moved && (Math.abs(S.vx) > 0.05 || Math.abs(S.vy) > 0.05) && performance.now() - S.lastT < 80) {
          S.inertia = true;
        }
      }
    };
    const onWheel = (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, S.scale * Math.exp(-e.deltaY * 0.0016)); };
    const onLeave = () => { if (S.hover) { S.hover = null; invalidate(); } };
    c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp); c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', onLeave); c.addEventListener('wheel', onWheel, { passive: false });
    c.style.cursor = 'grab';
    return () => {
      c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp); c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('pointerleave', onLeave); c.removeEventListener('wheel', onWheel);
    };
  }, [S, hitTest, zoomAt, constrain, invalidate, animateTo]);

  const miniMove = (e) => {
    const L = layoutRef.current;
    const r = miniRef.current.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * L.width;
    const wy = ((e.clientY - r.top) / r.height) * L.height;
    S.tx = S.w / 2 - wx * S.scale; S.ty = S.h / 2 - wy * S.scale;
    S.anim = null; S.inertia = false; constrain(); invalidate();
  };

  return (
    <div ref={wrapRef} className="seatcanvas">
      <canvas ref={canvasRef} className="seatcanvas-cv" />
      <div className={'seatcanvas-mini' + (shiftMinimap ? ' is-shifted' : '')}>
        <canvas
          ref={miniRef}
          aria-label="Minimap"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); S.miniDrag = true; miniMove(e); }}
          onPointerMove={(e) => S.miniDrag && miniMove(e)}
          onPointerUp={() => { S.miniDrag = false; }}
        />
      </div>
    </div>
  );
});

export default SeatCanvas;
