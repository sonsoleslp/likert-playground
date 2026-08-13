import { useMemo, useState } from 'react';
import DataLoader from './components/DataLoader';
import ConfigPanel from './components/ConfigPanel';
import LikertChart from './components/LikertChart';
import NetworkChart from './components/NetworkChart';
import Legend from './components/Legend';
import QualityWarning from './components/QualityWarning';
import { buildPlotData, analyzeQuality } from './lib/likert';
import './App.css';

export default function App() {
  const [config, setConfig] = useState(null);
  const [view, setView] = useState({
    mode: 'bars',
    unit: 'items',
    showPercentLabels: true,
    netThreshold: 0.05,
    netAlpha: 0.15,
  });

  const plotData = useMemo(() => {
    if (!config) return null;
    return buildPlotData(
      { rows: config.rows, points: config.points, valueMap: config.valueMap },
      {
        unit: view.unit,
        groupBy: config.groupBy,
        likertColumns: config.likertColumns,
        subscales: config.subscales,
      }
    );
  }, [config, view.unit]);

  const quality = useMemo(() => {
    if (!config || config.likertColumns.length === 0) return null;
    const q = analyzeQuality(
      config.rows,
      config.likertColumns,
      config.points,
      config.valueMap
    );
    return { ...q, points: config.points };
  }, [config]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Likert Playground</h1>
          <p className="tagline">
            Upload survey data, map your Likert items and subscales, and plot diverging stacked
            bars — all in the browser.
          </p>
        </div>
        {config && (
          <button className="reset-btn" onClick={() => setConfig(null)}>
            ← Load different data
          </button>
        )}
      </header>

      {!config ? (
        <DataLoader onLoad={setConfig} />
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="dataset-badge">
              <span className="badge-name">{config.name}</span>
              <span className="badge-meta">
                {config.rows.length} rows · {config.likertColumns.length} items
              </span>
            </div>
            <ConfigPanel config={config} setConfig={setConfig} view={view} setView={setView} />
          </aside>

          <main className="plot-area">
            <QualityWarning quality={quality} parseErrors={config.parseErrors} />
            {config.likertColumns.length === 0 ? (
              <div className="placeholder">
                Select at least one Likert column in the sidebar to begin.
              </div>
            ) : view.mode === 'network' ? (
              <>
                <div className="plot-header">
                  <h2>Partial correlation network</h2>
                  <p className="plot-sub muted small">
                    Nodes are items; edges are partial correlations (each pair controlling for all
                    other items). Computed over the whole sample.
                  </p>
                </div>
                <NetworkChart
                  rows={config.rows}
                  columns={config.likertColumns}
                  valueMap={config.valueMap}
                  subscales={config.subscales}
                  alpha={view.netAlpha}
                  threshold={view.netThreshold}
                  filename={`${config.name} - network`
                    .replace(/[^a-z0-9]+/gi, '_')
                    .toLowerCase()}
                />
              </>
            ) : view.unit === 'subscales' &&
              config.subscales.every((s) => s.columns.length === 0) ? (
              <div className="placeholder">
                Assign columns to subscales, or switch “Plot unit” to Individual items.
              </div>
            ) : (
              <>
                <div className="plot-header">
                  <h2>
                    {view.unit === 'subscales' ? 'Subscales' : 'Items'}
                    {config.groupBy ? ` by ${config.groupBy}` : ''}
                  </h2>
                  <Legend points={config.points} labels={config.labels} />
                </div>
                <LikertChart
                  plotData={plotData}
                  points={config.points}
                  labels={config.labels}
                  grouped={!!config.groupBy}
                  showPercentLabels={view.showPercentLabels}
                  filename={`${config.name} - ${view.unit}${config.groupBy ? ' by ' + config.groupBy : ''}`
                    .replace(/[^a-z0-9]+/gi, '_')
                    .toLowerCase()}
                />
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
