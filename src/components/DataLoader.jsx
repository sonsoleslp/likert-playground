import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { exampleDatasets, datasetToState } from '../data';
import { guessLikertColumns, detectPoints } from '../lib/likert';

// Build working state from parsed CSV rows.
function csvToState(name, columns, rows, parseErrors) {
  const likertColumns = guessLikertColumns(rows, columns);
  const points = detectPoints(rows, likertColumns, 5);
  // Non-likert columns are candidate grouping columns.
  const groupingColumns = columns.filter((c) => !likertColumns.includes(c));
  const labels = Array.from({ length: points }, (_, i) => String(i + 1));
  return {
    source: 'upload',
    name,
    columns,
    rows,
    points,
    labels,
    valueMap: null,
    likertColumns,
    // Start with a single subscale containing all detected items.
    subscales: [{ name: 'All items', columns: likertColumns.slice() }],
    groupingColumns,
    groupBy: null,
    parseErrors: parseErrors || [],
  };
}

// Summarize papaparse row-level errors (malformed / ragged rows).
function summarizeParseErrors(errors) {
  if (!errors || !errors.length) return [];
  return errors.slice(0, 20).map((e) => ({
    row: typeof e.row === 'number' ? e.row + 1 : null,
    message: e.message,
    code: e.code,
  }));
}

export default function DataLoader({ onLoad }) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [infoOf, setInfoOf] = useState(null); // dataset whose info modal is open

  function handleFile(file) {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (res) => {
        try {
          const columns = res.meta.fields || [];
          const rows = res.data;
          if (!columns.length || !rows.length) {
            setError('Could not find any rows/columns in that file.');
            return;
          }
          onLoad(
            csvToState(
              file.name.replace(/\.[^.]+$/, ''),
              columns,
              rows,
              summarizeParseErrors(res.errors)
            )
          );
        } catch (e) {
          setError(String(e));
        }
      },
      error: (e) => setError(String(e)),
    });
  }

  return (
    <div className="loader">
      <div
        className={`dropzone${dragOver ? ' drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) handleFile(f);
          }}
        />
        <div className="dz-icon">⬆</div>
        <div className="dz-text">
          <strong>Drop a CSV file</strong> or click to browse
        </div>
        <div className="dz-sub">Rows = respondents · columns = items. First row is a header.</div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="examples">
        <div className="examples-title">…or load an example dataset</div>
        <div className="example-grid">
          {exampleDatasets.map((ds) => (
            <div
              key={ds.id}
              className="example-card"
              role="button"
              tabIndex={0}
              onClick={() => onLoad(datasetToState(ds))}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onLoad(datasetToState(ds))}
            >
              <div className="example-top">
                <span
                  className={`tag ${ds.info?.synthetic ? 'tag-synthetic' : 'tag-real'}`}
                >
                  {ds.info?.synthetic ? 'Synthetic' : 'Real data'}
                </span>
                {ds.info && (
                  <button
                    className="info-btn"
                    title="About this dataset"
                    aria-label={`About ${ds.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoOf(ds);
                    }}
                  >
                    i
                  </button>
                )}
              </div>
              <div className="example-name">{ds.name}</div>
              <div className="example-desc">{ds.description}</div>
              <div className="example-meta">
                {ds.rows.length} respondents · {ds.likertColumns.length} items ·{' '}
                {ds.points}-point
              </div>
            </div>
          ))}
        </div>
      </div>

      {infoOf && <DatasetInfoModal ds={infoOf} onClose={() => setInfoOf(null)} />}
    </div>
  );
}

function DatasetInfoModal({ ds, onClose }) {
  const info = ds.info || {};
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{ds.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <span className={`tag ${info.synthetic ? 'tag-synthetic' : 'tag-real'}`}>
          {info.synthetic ? 'Synthetic demo data' : 'Real published data'}
        </span>
        <p className="modal-context">{info.context}</p>
        <dl className="modal-facts">
          <dt>Structure</dt>
          <dd>
            {ds.rows.length} respondents · {ds.likertColumns.length} Likert items ·{' '}
            {ds.subscales.length} subscales · {ds.points}-point scale
          </dd>
          {info.license && (
            <>
              <dt>License</dt>
              <dd>{info.license}</dd>
            </>
          )}
          {info.citation && (
            <>
              <dt>Citation</dt>
              <dd>{info.citation}</dd>
            </>
          )}
        </dl>
        {info.sourceUrl && (
          <a className="modal-source" href={info.sourceUrl} target="_blank" rel="noreferrer">
            {info.sourceLabel || 'Open source ↗'} ↗
          </a>
        )}
        <div className="modal-actions">
          <button className="btn-primary" onClick={() => onClose()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
