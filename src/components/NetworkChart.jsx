import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildNetwork, forceLayout } from '../lib/network';
import { downloadPNG, downloadSVG } from '../lib/exportImage';

// Categorical palette for subscales.
const CAT = [
  '#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1',
  '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac',
];

const POS = '#2c7bb6'; // positive partial correlation
const NEG = '#d7191c'; // negative partial correlation
const NODE_R = 11;

// Short node label: keep compact codes as-is, abbreviate long names to V1, V2…
function shortLabel(name, idx) {
  const s = String(name);
  return s.length <= 10 ? s : `V${idx + 1}`;
}

export default function NetworkChart({
  rows,
  columns,
  valueMap,
  subscales,
  alpha,
  threshold,
  filename = 'partial-correlation-network',
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const [availW, setAvailW] = useState(760);
  useLayoutEffect(() => {
    if (wrapRef.current) setAvailW(Math.floor(wrapRef.current.clientWidth));
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAvailW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.max(320, availW);
  const height = Math.round(Math.min(680, Math.max(380, width * 0.66)));

  const net = useMemo(
    () => buildNetwork(rows, columns, { valueMap, alpha, threshold }),
    [rows, columns, valueMap, alpha, threshold]
  );

  const positions = useMemo(
    () => forceLayout(net.nodes.length, net.edges, { width, height }),
    [net, width, height]
  );

  // Map each node to its subscale color.
  const colToSub = useMemo(() => {
    const m = {};
    (subscales || []).forEach((s) => s.columns.forEach((c) => (m[c] = s.name)));
    return m;
  }, [subscales]);
  const subNames = useMemo(() => {
    const present = new Set(net.nodes.map((c) => colToSub[c]).filter(Boolean));
    return [...present];
  }, [net.nodes, colToSub]);
  const subColor = (name) => {
    const i = subNames.indexOf(name);
    return i >= 0 ? CAT[i % CAT.length] : '#9aa3ad';
  };

  const maxAbs = useMemo(
    () => net.edges.reduce((m, e) => Math.max(m, Math.abs(e.weight)), 0) || 1,
    [net.edges]
  );
  const edgeWidth = (w) => 1 + (Math.abs(w) / maxAbs) * 8;

  const labelFor = (name, i) => shortLabel(name, i);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-toolbar">
        <button className="dl-btn" onClick={() => svgRef.current && downloadPNG(svgRef.current, `${filename}.png`)}>
          ⬇ PNG
        </button>
        <button className="dl-btn" onClick={() => svgRef.current && downloadSVG(svgRef.current, `${filename}.svg`)}>
          ⬇ SVG
        </button>
      </div>

      {net.nodes.length < 2 ? (
        <div className="placeholder">Select at least two Likert items to build a network.</div>
      ) : (
        <>
          <svg ref={svgRef} width={width} height={height} className="likert-svg network-svg" role="img">
            {/* Edges */}
            {net.edges.map((e, idx) => {
              const a = positions[e.i];
              const b = positions[e.j];
              if (!a || !b) return null;
              const isHover = hover?.type === 'edge' && hover.idx === idx;
              return (
                <line
                  key={idx}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.weight >= 0 ? POS : NEG}
                  strokeWidth={edgeWidth(e.weight)}
                  strokeOpacity={hover && !isHover ? 0.25 : Math.min(0.9, 0.35 + Math.abs(e.weight) / maxAbs * 0.6)}
                  strokeLinecap="round"
                  onMouseMove={(ev) =>
                    setHover({
                      type: 'edge',
                      idx,
                      text: `${labelFor(net.nodes[e.i], e.i)} — ${labelFor(net.nodes[e.j], e.j)}`,
                      sub: `partial r = ${e.weight.toFixed(3)}`,
                      x: ev.nativeEvent.offsetX,
                      y: ev.nativeEvent.offsetY,
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}

            {/* Nodes */}
            {net.nodes.map((name, i) => {
              const p = positions[i];
              if (!p) return null;
              const isHover = hover?.type === 'node' && hover.idx === i;
              return (
                <g
                  key={name}
                  transform={`translate(${p.x},${p.y})`}
                  onMouseMove={(ev) =>
                    setHover({
                      type: 'node',
                      idx: i,
                      text: name,
                      sub: colToSub[name] || 'unassigned',
                      x: p.x,
                      y: p.y - NODE_R,
                      _raw: ev,
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'default' }}
                >
                  <circle
                    r={NODE_R}
                    fill={subColor(colToSub[name])}
                    stroke={isHover ? '#111' : '#fff'}
                    strokeWidth={isHover ? 2.5 : 1.5}
                  />
                  <text
                    y={NODE_R + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="node-label"
                  >
                    {labelFor(name, i)}
                  </text>
                  <title>{name}</title>
                </g>
              );
            })}
          </svg>

          {hover && (
            <div
              className="tooltip-floating"
              style={{
                left: Math.min(hover.x + 14, width - 190),
                top: Math.max(hover.y - 6, 4),
              }}
            >
              <strong>{hover.text}</strong>
              <br />
              <span className="tt-cat">{hover.sub}</span>
            </div>
          )}
        </>
      )}

      {/* Legends + diagnostics */}
      <div className="net-footer">
        <div className="net-legend">
          <span className="net-legend-title">Edges</span>
          <span className="net-legend-item">
            <span className="edge-swatch" style={{ background: POS }} /> positive
          </span>
          <span className="net-legend-item">
            <span className="edge-swatch" style={{ background: NEG }} /> negative
          </span>
          <span className="muted small">width ∝ |partial r|</span>
        </div>

        {subNames.length > 0 && (
          <div className="net-legend">
            <span className="net-legend-title">Subscales</span>
            {subNames.map((s) => (
              <span key={s} className="net-legend-item">
                <span className="node-swatch" style={{ background: subColor(s) }} /> {s}
              </span>
            ))}
          </div>
        )}

        {net.nodes.some((n, i) => labelFor(n, i) !== n) && (
          <details className="net-nodemap">
            <summary>Node labels ({net.nodes.length})</summary>
            <div className="net-nodemap-grid">
              {net.nodes.map((n, i) => (
                <div key={n}>
                  <code>{labelFor(n, i)}</code> {n}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="net-diag muted small">
          {net.nodes.length} nodes · {net.edges.length} edges · n={net.completeN} complete cases
          {net.effectiveAlpha != null && ` · shrinkage λ=${net.effectiveAlpha.toFixed(2)}`}
          {net.dropped.length > 0 && ` · dropped ${net.dropped.length} constant item(s)`}
          {net.completeN < net.nodes.length && (
            <span className="net-warn"> · few cases relative to items — interpret with caution</span>
          )}
        </div>
      </div>
    </div>
  );
}
