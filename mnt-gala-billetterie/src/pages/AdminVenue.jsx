import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import SeatPlan from '../components/SeatPlan';
import { buildSeatList, chunk, countSeatsInSection, generateCenterOutNumbers, generateSequentialNumbers, parseSeatNumberList, rowSeatNumbers } from '../utils/seatMap';
import { EVENTS } from '../utils/events';

const EMPTY_CONFIG = {
  eventName: 'Gala MNT Studio Dance',
  venueName: 'Théâtre de Sénart, Lieusaint',
  sections: [],
};

function newSectionId(existing) {
  let n = existing.length + 1;
  while (existing.some((s) => s.id === `SEC${n}`)) n++;
  return `SEC${n}`;
}

export default function AdminVenue() {
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setMessage('');
    getDoc(doc(db, 'venueConfig', eventId)).then((snap) => {
      setConfig(snap.exists() ? { ...EMPTY_CONFIG, ...snap.data() } : EMPTY_CONFIG);
    });
  }, [eventId]);

  function updateField(field, value) {
    setConfig((c) => ({ ...c, [field]: value }));
  }

  function addSection() {
    setConfig((c) => ({
      ...c,
      sections: [
        ...c.sections,
        {
          id: newSectionId(c.sections),
          name: `Catégorie ${c.sections.length + 1}`,
          color: '#c9a24b',
          price: 0,
          gridColumn: c.sections.length + 1,
          gridRow: 1,
          rows: [],
        },
      ],
    }));
  }

  function updateSection(id, field, value) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  }

  function removeSection(id) {
    setConfig((c) => ({ ...c, sections: c.sections.filter((s) => s.id !== id) }));
  }

  function addRow(sectionId) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              rows: [...s.rows, { label: String.fromCharCode(65 + s.rows.length), seats: [] }],
            }
          : s
      ),
    }));
  }

  function updateRow(sectionId, index, field, value) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId
          ? { ...s, rows: s.rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)) }
          : s
      ),
    }));
  }

  function fillRowSeats(sectionId, index, numbers) {
    updateRow(sectionId, index, 'seats', numbers);
  }

  function handleGenerateSequential(sectionId, index) {
    const countStr = prompt('Combien de sièges dans cette rangée ?', '10');
    if (countStr === null) return;
    const count = parseInt(countStr, 10);
    if (!count || count < 1) return;
    const startStr = prompt('Numéro de départ ?', '1');
    if (startStr === null) return;
    const start = parseInt(startStr, 10) || 1;
    fillRowSeats(sectionId, index, generateSequentialNumbers(count, start));
  }

  function handleGenerateCenterOut(sectionId, index) {
    const leftStr = prompt('Combien de sièges à GAUCHE du centre (numéros pairs) ?', '6');
    if (leftStr === null) return;
    const left = parseInt(leftStr, 10) || 0;
    const rightStr = prompt('Combien de sièges à DROITE du centre (numéros impairs) ?', '6');
    if (rightStr === null) return;
    const right = parseInt(rightStr, 10) || 0;
    fillRowSeats(sectionId, index, generateCenterOutNumbers(left, right));
  }

  function removeRow(sectionId, index) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId ? { ...s, rows: s.rows.filter((_, i) => i !== index) } : s
      ),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'venueConfig', eventId), config);
      setMessage('Plan de salle enregistré.');
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'enregistrement.");
    }
    setSaving(false);
  }

  async function handleCopyFromOtherDate() {
    const other = EVENTS.find((e) => e.id !== eventId);
    if (!other) return;
    if (
      !confirm(
        `Copier la structure du plan de "${other.label}" ici ? Cela remplacera les catégories et rangées actuelles de "${EVENTS.find((e) => e.id === eventId).label}" (les places déjà générées/vendues ne sont pas affectées, seule la structure est copiée).`
      )
    )
      return;
    const snap = await getDoc(doc(db, 'venueConfig', other.id));
    if (!snap.exists()) {
      setMessage(`Aucun plan trouvé pour "${other.label}".`);
      return;
    }
    setConfig({ ...EMPTY_CONFIG, ...snap.data() });
    setMessage(`Structure copiée depuis "${other.label}" — pense à cliquer sur Enregistrer puis Générer les places.`);
  }

  async function handleGenerateSeats() {
    setGenerating(true);
    setMessage('');
    try {
      const wanted = buildSeatList(eventId, config);
      const existingSnap = await getDocs(query(collection(db, 'seats'), where('eventId', '==', eventId)));
      const existingIds = new Set();
      existingSnap.forEach((d) => existingIds.add(d.id));

      const toCreate = wanted.filter((seat) => !existingIds.has(seat.seatId));

      if (toCreate.length === 0) {
        setMessage('Aucune nouvelle place à créer — le plan est déjà à jour.');
        setGenerating(false);
        return;
      }

      for (const group of chunk(toCreate, 400)) {
        const batch = writeBatch(db);
        for (const seat of group) {
          batch.set(doc(db, 'seats', seat.seatId), {
            eventId,
            sectionId: seat.sectionId,
            sectionName: seat.sectionName,
            row: seat.row,
            number: seat.number,
            status: 'available',
            transactionId: null,
            checkedIn: false,
            checkedInAt: null,
            blockedNote: null,
          });
        }
        await batch.commit();
      }
      setMessage(`${toCreate.length} nouvelle(s) place(s) créée(s) dans la base pour "${eventLabelOf(eventId)}".`);
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de la génération des places.');
    }
    setGenerating(false);
  }

  function eventLabelOf(id) {
    return EVENTS.find((e) => e.id === id)?.label || id;
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.sections)) throw new Error('bad shape');
        setConfig({ ...EMPTY_CONFIG, ...parsed });
        setMessage('Plan importé — vérifie les rangées puis clique sur Enregistrer.');
      } catch (err) {
        setMessage('Ce fichier ne ressemble pas à un plan valide (JSON attendu).');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${eventId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalSeats = config.sections.reduce((sum, s) => sum + countSeatsInSection(s), 0);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Informations de l'évènement</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-small" onClick={handleCopyFromOtherDate}>
            Copier le plan de l'autre date
          </button>
          <button className="btn btn-small" onClick={handleImportClick}>
            Importer un plan (.json)
          </button>
          <button className="btn btn-small" onClick={handleExport}>
            Exporter en JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          </div>
        </div>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label>Nom de l'évènement</label>
          <input value={config.eventName} onChange={(e) => updateField('eventName', e.target.value)} />
        </div>
        <div className="field">
          <label>Lieu</label>
          <input value={config.venueName} onChange={(e) => updateField('venueName', e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Catégories &amp; rangées</h2>
          <button className="btn btn-small" onClick={addSection}>
            + Ajouter une catégorie
          </button>
        </div>

        {config.sections.length === 0 && (
          <p style={{ color: 'var(--cream-dim)' }}>
            Aucune catégorie pour l'instant. Ajoutez-en une pour commencer à dessiner le plan (ex : Balcon
            Gauche Haut, Orchestre Centre Bas…). Utilisez « Colonne » et « Rangée (plan) » pour placer les
            blocs les uns par rapport aux autres, comme sur le vrai plan de la salle.
          </p>
        )}
        <p style={{ color: 'var(--cream-dim)', fontSize: '0.82rem' }}>
          Astuce : si deux blocs portent exactement le même nom (ex : « Orchestre Gauche » et « Orchestre
          Droit » tous les deux nommés « Orchestre »), ils forment une seule catégorie à la vente — le
          spectateur pourra alors choisir librement entre les deux blocs au moment de sélectionner ses
          places.
        </p>

        {config.sections.map((section) => (
          <div key={section.id} style={{ border: '1px solid #3a2c30', borderRadius: 10, padding: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.6rem' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Nom</label>
                <input value={section.name} onChange={(e) => updateSection(section.id, 'name', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Couleur</label>
                <input
                  type="color"
                  value={section.color}
                  onChange={(e) => updateSection(section.id, 'color', e.target.value)}
                  style={{ padding: '0.2em', height: '2.6em' }}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Prix (€)</label>
                <input
                  type="number"
                  value={section.price}
                  onChange={(e) => updateSection(section.id, 'price', Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Colonne (plan)</label>
                <input
                  type="number"
                  min={1}
                  value={section.gridColumn}
                  onChange={(e) => updateSection(section.id, 'gridColumn', Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Rangée (plan)</label>
                <input
                  type="number"
                  min={1}
                  value={section.gridRow}
                  onChange={(e) => updateSection(section.id, 'gridRow', Number(e.target.value))}
                />
              </div>
              <button className="btn btn-small btn-danger" style={{ alignSelf: 'end' }} onClick={() => removeSection(section.id)}>
                Supprimer
              </button>
            </div>

            <div style={{ marginTop: '0.8rem', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Rangée</th>
                    <th>Numéros des sièges (de gauche à droite)</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, i) => {
                    const numbers = rowSeatNumbers(row);
                    return (
                    <tr key={i}>
                      <td>
                        <input style={{ width: 60 }} value={row.label} onChange={(e) => updateRow(section.id, i, 'label', e.target.value)} />
                      </td>
                      <td>
                        <input
                          key={i + '-' + numbers.join(',')}
                          style={{ width: 340 }}
                          placeholder="ex : 12,10,8,6,4,2,1,3,5,7,9,11"
                          defaultValue={numbers.join(', ')}
                          onBlur={(e) => updateRow(section.id, i, 'seats', parseSeatNumberList(e.target.value))}
                        />
                        <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => handleGenerateSequential(section.id, i)}
                          >
                            Suite 1,2,3…
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => handleGenerateCenterOut(section.id, i)}
                          >
                            Pair/impair depuis le centre
                          </button>
                        </div>
                      </td>
                      <td>{numbers.length}</td>
                      <td>
                        <button className="btn btn-small btn-danger" onClick={() => removeRow(section.id, i)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn btn-small" style={{ marginTop: '0.6rem' }} onClick={() => addRow(section.id)}>
                + Ajouter une rangée
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 'none', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le plan'}
        </button>
        <button className="btn" onClick={handleGenerateSeats} disabled={generating}>
          {generating ? 'Génération…' : 'Générer les places manquantes dans la base'}
        </button>
        <span style={{ color: 'var(--cream-dim)', fontSize: '0.85rem' }}>
          {totalSeats} place{totalSeats > 1 ? 's' : ''} définie{totalSeats > 1 ? 's' : ''} pour {eventLabelOf(eventId)}
        </span>
      </div>
      {message && <p style={{ color: 'var(--gold-soft)' }}>{message}</p>}

      <h2 style={{ marginTop: '2rem' }}>Aperçu du plan — {eventLabelOf(eventId)}</h2>
      <SeatPlan eventId={eventId} config={config} seatsById={new Map()} selectable={false} />
    </div>
  );
}
