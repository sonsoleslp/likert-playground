import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildNetwork, forceLayout } from '../lib/network';
import { downloadPNG, downloadSVG } from '../lib/exportImage';

const CAT = [
  '#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1',
  '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac',
];
const POS = '#2c7bb6';
const NEG = '#d7191c';
const NODE_R = 11;
const PANEL_GAP = 18;
const TITLE_H = 22;

function shortLabel(name, idx) {
  const s = String(name);
  return s.length <= 10 ? s : `V${idx + 1}`;
}

// Group value key (matches buildPlotData's handling).
function groupKey(v) {
  return v === null || v === undefined || v === '' ? '(missing)' : String(v);
}

export default function NetworkChart({
  rows,
  columns,
  valueMap,
  subscales,
  type,
  corr,
  estimator,
  alpha,
  threshold,
  ebicGamma,
  splitBy,
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
  const relPos = (e) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const width = Math.max(320, availW);

  // Panel groups.
  const groups = useMemo(() => {
    if (!splitBy) return [{ label: null, rows }];
    const order = [];
    const seen = new Set();
    for (const row of rows) {
      const key = groupKey(row[splitBy]);
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
    order.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return order.map((key) => ({
      label: key,
      rows: rows.filter((r) => groupKey(r[splitBy]) === key),
    }));
  }, [rows, splitBy]);

  const cols = splitBy && groups.length > 1 && width >= 680 ? 2 : 1;
  const panelW = Math.floor((width - PANEL_GAP * (cols - 1)) / cols);
  const panelH = Math.round(
    splitBy ? Math.min(520, Math.max(300, panelW * 0.82)) : Math.min(680, Math.max(380, panelW * 0.66))
  );

  const opts = { valueMap, type, corr, estimator, alpha, threshold, ebicGamma };

  // Networks per panel.
  const nets = useMemo(
    () => groups.map((g) => ({ label: g.label, net: buildNetwork(g.rows, columns, opts) })),
    [groups, columns, valueMap, type, corr, estimator, alpha, threshold, ebicGamma]
  );

  // Reference network + layout (shared across panels for comparability).
  const layoutRefNet = useMemo(() => {
    if (!splitBy) return nets[0]?.net;
    return buildNetwork(rows, columns, {
      valueMap,
      corr: 'pearson',
      estimator: 'shrinkage',
      alpha: 0.15,
      threshold: 0,
    });
  }, [splitBy, nets, rows, columns, valueMap]);

  const refNodes = layoutRefNet ? layoutRefNet.nodes : [];
  const positionsByName = useMemo(() => {
    if (!layoutRefNet) return {};
    const pos = forceLayout(refNodes.length, layoutRefNet.edges, { width: panelW, height: panelH });
    const map = {};
    refNodes.forEach((name, i) => (map[name] = pos[i]));
    return map;
  }, [layoutRefNet, panelW, panelH]);

  // Global label / color maps keyed by node name (consistent across panels).
  const labelByName = useMemo(() => {
    const m = {};
    refNodes.forEach((name, i) => (m[name] = shortLabel(name, i)));
    return m;
  }, [refNodes]);
  const colToSub = useMemo(() => {
    const m = {};
    (subscales || []).forEach((s) => s.columns.forEach((c) => (m[c] = s.name)));
    return m;
  }, [subscales]);
  const subNames = useMemo(() => [...new Set(refNodes.map((c) => colToSub[c]).filter(Boolean))], [refNodes, colToSub]);
  const subColor = (name) => {
    const i = subNames.indexOf(name);
    return i >= 0 ? CAT[i % CAT.length] : '#9aa3ad';
  };

  // Global max |weight| across panels so edge widths are comparable.
  const maxAbs = useMemo(
    () => Math.max(1e-6, ...nets.flatMap((p) => p.net.edges.map((e) => Math.abs(e.weight)))) || 1,
    [nets]
  );
  const edgeWidth = (w) => 1 + (Math.abs(w) / maxAbs) * 8;

  const abbreviated = refNodes.some((n) => labelByName[n] !== n);
  const nRows = Math.ceil(nets.length / cols);
  const titled = !!splitBy;
  const rowH = panelH + (titled ? TITLE_H : 0);
  const svgW = cols * panelW + (cols - 1) * PANEL_GAP;
  const svgH = nRows * rowH + (nRows - 1) * PANEL_GAP;

  function renderPanel(panel, gi) {
    const { net } = panel;
    const c = gi % cols;
    const r = Math.floor(gi / cols);
    const ox = c * (panelW + PANEL_GAP);
    const oy = r * (rowH + PANEL_GAP) + (titled ? TITLE_H : 0);

    return (
      <g key={gi} transform={`translate(${ox},${oy})`}>
        {titled && (
          <text x={panelW / 2} y={-8} textAnchor="middle" className="panel-title">
            {panel.label} (n={net.completeN})
          </text>
        )}
        {splitBy && <rect x={0} y={0} width={panelW} height={panelH} className="panel-frame" />}

        {net.edges.map((e, idx) => {
          const a = positionsByName[net.nodes[e.i]];
          const b = positionsByName[net.nodes[e.j]];
          if (!a || !b) return null;
          const isHover = hover?.type === 'edge' && hover.gi === gi && hover.idx === idx;
          return (
            <line
              key={idx}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={e.weight >= 0 ? POS : NEG}
              strokeWidth={edgeWidth(e.weight)}
              strokeOpacity={hover && !isHover ? 0.22 : Math.min(0.9, 0.32 + (Math.abs(e.weight) / maxAbs) * 0.6)}
              strokeLinecap="round"
              onMouseMove={(ev) =>
                setHover({
                  type: 'edge',
                  gi,
                  idx,
                  text: `${labelByName[net.nodes[e.i]]} — ${labelByName[net.nodes[e.j]]}`,
                  sub: `${type === 'correlation' ? 'r' : 'partial r'} = ${e.weight.toFixed(3)}`,
                  ...relPos(ev),
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {net.nodes.map((name) => {
          const p = positionsByName[name];
          if (!p) return null;
          const isHover = hover?.type === 'node' && hover.gi === gi && hover.name === name;
          return (
            <g key={name} transform={`translate(${p.x},${p.y})`}>
              <circle
                r={NODE_R}
                fill={subColor(colToSub[name])}
                stroke={isHover ? '#111' : '#fff'}
                strokeWidth={isHover ? 2.5 : 1.5}
                onMouseMove={(ev) =>
                  setHover({ type: 'node', gi, name, text: name, sub: colToSub[name] || 'unassigned', ...relPos(ev) })
                }
                onMouseLeave={() => setHover(null)}
              />
              <text y={NODE_R + 10} textAnchor="middle" dominantBaseline="middle" className="node-label">
                {labelByName[name]}
              </text>
              <title>{name}</title>
            </g>
          );
        })}
      </g>
    );
  }

  const corrLabel = corr === 'polychoric' ? 'Polychoric' : 'Pearson';
  const methodLabel =
    type === 'correlation'
      ? `${corrLabel} correlations (zero-order)`
      : `${corrLabel} partial correlations · ${estimator === 'glasso' ? 'EBICglasso' : 'shrinkage'}`;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-toolbar">
        <span className="method-tag">{methodLabel}</span>
        <button className="dl-btn" onClick={() => svgRef.current && downloadPNG(svgRef.current, `${filename}.png`)}>
          ⬇ PNG
        </button>
        <button className="dl-btn" onClick={() => svgRef.current && downloadSVG(svgRef.current, `${filename}.svg`)}>
          ⬇ SVG
        </button>
      </div>

      {refNodes.length < 2 ? (
        <div className="placeholder">Select at least two Likert items to build a network.</div>
      ) : (
        <>
          <svg ref={svgRef} width={svgW} height={svgH} className="likert-svg network-svg" role="img">
            {nets.map(renderPanel)}
          </svg>

          {hover && (
            <div
              className="tooltip-floating"
              style={{ left: Math.min(hover.x + 14, width - 190), top: Math.max(hover.y - 6, 4) }}
            >
              <strong>{hover.text}</strong>
              <br />
              <span className="tt-cat">{hover.sub}</span>
            </div>
          )}
        </>
      )}

      <div className="net-footer">
        <div className="net-legend">
          <span className="net-legend-title">Edges</span>
          <span className="net-legend-item">
            <span className="edge-swatch" style={{ background: POS }} /> positive
          </span>
          <span className="net-legend-item">
            <span className="edge-swatch" style={{ background: NEG }} /> negative
          </span>
          <span className="muted small">width ∝ |{type === 'correlation' ? 'r' : 'partial r'}|</span>
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

        {abbreviated && (
          <details className="net-nodemap">
            <summary>Node labels ({refNodes.length})</summary>
            <div className="net-nodemap-grid">
              {refNodes.map((n) => (
                <div key={n}>
                  <code>{labelByName[n]}</code> {n}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="net-diag muted small">
          {methodLabel} ·{' '}
          {splitBy
            ? `${nets.length} groups by ${splitBy}`
            : `${nets[0]?.net.edges.length ?? 0} edges · n=${nets[0]?.net.completeN ?? 0}`}
          {!splitBy && type === 'partial' && nets[0]?.net.lambda != null && ` · λ=${nets[0].net.lambda.toFixed(3)}`}
          {!splitBy && type === 'partial' && estimator === 'glasso' && nets[0]?.net.estimator === 'shrinkage' && ' · glasso failed, used shrinkage'}
          {refNodes.length > 0 && layoutRefNet?.dropped?.length > 0 && ` · dropped ${layoutRefNet.dropped.length} constant item(s)`}
          {!splitBy && nets[0]?.net.completeN < refNodes.length && (
            <span className="net-warn"> · few cases relative to items — interpret with caution</span>
          )}
        </div>
      </div>
    </div>
  );
}
