import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase';
import AdminVenue from './AdminVenue';
import AdminBookings from './AdminBookings';
import AdminOverview from './AdminOverview';

const TABS = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'bookings', label: 'Transactions' },
  { id: 'venue', label: 'Plan de salle' },
];

export default function Admin() {
  const [user, setUser] = useState(undefined); // undefined = chargement, null = déconnecté
  const [tab, setTab] = useState('overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError('Identifiants incorrects.');
    }
    setLoading(false);
  }

  if (user === undefined) {
    return <div className="page">Chargement…</div>;
  }

  if (!user) {
    return (
      <div className="page">
        <form className="card" onSubmit={handleLogin}>
          <div className="eyebrow">Administration</div>
          <h2>Connexion</h2>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pwd">Mot de passe</label>
            <input
              id="pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          {loginError && <div className="error-box">{loginError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="page" style={{ alignItems: 'stretch', maxWidth: 1100, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div className="eyebrow">Administration</div>
          <h1 style={{ fontSize: '1.6rem' }}>Gala MNT Studio Dance — Billetterie</h1>
        </div>
        <button className="btn btn-small" onClick={() => signOut(auth)}>
          Déconnexion
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className="btn btn-small"
            style={
              tab === t.id
                ? { background: 'var(--gold)', color: 'var(--ink)' }
                : undefined
            }
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <AdminOverview />}
      {tab === 'bookings' && <AdminBookings />}
      {tab === 'venue' && <AdminVenue />}
    </div>
  );
}
