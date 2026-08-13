import { useState } from 'react';

// Assign a column to exactly one subscale (or none when name is '').
function assignColumn(subscales, column, subscaleName) {
  const cleaned = subscales.map((s) => ({
    ...s,
    columns: s.columns.filter((c) => c !== column),
  }));
  if (subscaleName) {
    const target = cleaned.find((s) => s.name === subscaleName);
    if (target) target.columns = [...target.columns, column];
  }
  return cleaned;
}

function subscaleOf(subscales, column) {
  const s = subscales.find((x) => x.columns.includes(column));
  return s ? s.name : '';
}

export default function ConfigPanel({ config, setConfig, view, setView }) {
  const [newSub, setNewSub] = useState('');

  const patch = (p) => setConfig({ ...config, ...p });

  // --- Scale ---
  function setPoints(n) {
    n = Math.max(2, Math.min(11, n | 0));
    const labels = Array.from({ length: n }, (_, i) => config.labels[i] || String(i + 1));
    patch({ points: n, labels });
  }
  function setLabel(i, val) {
    const labels = config.labels.slice();
    labels[i] = val;
    patch({ labels });
  }

  // --- Likert columns ---
  function toggleLikert(col, on) {
    let likertColumns;
    let subscales = config.subscales;
    if (on) {
      likertColumns = [...config.likertColumns, col].filter((c, i, a) => a.indexOf(c) === i);
    } else {
      likertColumns = config.likertColumns.filter((c) => c !== col);
      subscales = assignColumn(config.subscales, col, ''); // drop from subscales too
    }
    // keep column order stable per original columns order
    likertColumns = config.columns.filter((c) => likertColumns.includes(c));
    patch({ likertColumns, subscales });
  }

  // --- Subscales ---
  function addSubscale() {
    const name = newSub.trim();
    if (!name || config.subscales.some((s) => s.name === name)) return;
    patch({ subscales: [...config.subscales, { name, columns: [] }] });
    setNewSub('');
  }
  function removeSubscale(name) {
    patch({ subscales: config.subscales.filter((s) => s.name !== name) });
  }
  function setColumnSubscale(col, name) {
    patch({ subscales: assignColumn(config.subscales, col, name) });
  }

  return (
    <div className="config">
      {/* Scale */}
      <section className="cfg-section">
        <h3>Scale</h3>
        <label className="field">
          <span>Points</span>
          <input
            type="number"
            min={2}
            max={11}
            value={config.points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </label>
        <div className="labels-editor">
          {config.labels.map((lab, i) => (
            <label key={i} className="label-row">
              <span className="label-code">{i + 1}</span>
              <input
                value={lab}
                onChange={(e) => setLabel(i, e.target.value)}
                placeholder={`Level ${i + 1}`}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Grouping + view */}
      <section className="cfg-section">
        <h3>Grouping & view</h3>
        <label className="field">
          <span>Chart type</span>
          <select value={view.mode} onChange={(e) => setView({ ...view, mode: e.target.value })}>
            <option value="bars">Diverging bars</option>
            <option value="network">Partial correlation network</option>
          </select>
        </label>

        {view.mode === 'bars' ? (
          <>
            <label className="field">
              <span>Group by</span>
              <select
                value={config.groupBy || ''}
                onChange={(e) => patch({ groupBy: e.target.value || null })}
              >
                <option value="">— none —</option>
                {config.columns
                  .filter((c) => !config.likertColumns.includes(c))
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Plot unit</span>
              <select value={view.unit} onChange={(e) => setView({ ...view, unit: e.target.value })}>
                <option value="items">Individual items</option>
                <option value="subscales">Subscales (pooled)</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={view.showPercentLabels}
                onChange={(e) => setView({ ...view, showPercentLabels: e.target.checked })}
              />
              <span>Show % labels on bars</span>
            </label>
          </>
        ) : (
          <>
            <label className="field slider">
              <span>Edge threshold</span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={view.netThreshold}
                onChange={(e) => setView({ ...view, netThreshold: Number(e.target.value) })}
              />
              <span className="slider-val">{view.netThreshold.toFixed(2)}</span>
            </label>
            <label className="field slider">
              <span>Regularization</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={view.netAlpha}
                onChange={(e) => setView({ ...view, netAlpha: Number(e.target.value) })}
              />
              <span className="slider-val">{view.netAlpha.toFixed(2)}</span>
            </label>
            <div className="muted small">
              Hide edges below the threshold; regularization shrinks the correlation matrix toward
              the identity (higher = sparser, more stable for small samples).
            </div>
          </>
        )}
      </section>

      {/* Subscales */}
      <section className="cfg-section">
        <h3>Subscales</h3>
        <div className="subscale-list">
          {config.subscales.map((s) => (
            <div key={s.name} className="subscale-chip">
              <span>{s.name}</span>
              <span className="subscale-count">{s.columns.length}</span>
              <button className="x" onClick={() => removeSubscale(s.name)} title="Remove">
                ×
              </button>
            </div>
          ))}
          {config.subscales.length === 0 && <div className="muted">No subscales yet.</div>}
        </div>
        <div className="add-subscale">
          <input
            value={newSub}
            placeholder="New subscale name"
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubscale()}
          />
          <button onClick={addSubscale}>Add</button>
        </div>
      </section>

      {/* Column assignment */}
      <section className="cfg-section">
        <h3>Columns</h3>
        <div className="muted small">
          Check the columns that hold Likert responses, then assign each to a subscale.
        </div>
        <div className="col-table">
          {config.columns.map((col) => {
            const isLikert = config.likertColumns.includes(col);
            return (
              <div key={col} className={`col-row${isLikert ? ' active' : ''}`}>
                <label className="col-check">
                  <input
                    type="checkbox"
                    checked={isLikert}
                    onChange={(e) => toggleLikert(col, e.target.checked)}
                  />
                  <span className="col-name">{col}</span>
                </label>
                {isLikert && (
                  <select
                    className="col-sub"
                    value={subscaleOf(config.subscales, col)}
                    onChange={(e) => setColumnSubscale(col, e.target.value)}
                  >
                    <option value="">— unassigned —</option>
                    {config.subscales.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
