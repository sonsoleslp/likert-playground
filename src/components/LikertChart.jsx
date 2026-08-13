import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { divergingColors, textOn } from '../lib/colors';
import { downloadPNG, downloadSVG } from '../lib/exportImage';

// Layout constants.
const ROW_H = 26; // bar height
const ROW_GAP = 6; // gap between bars within a unit
const UNIT_GAP = 18; // gap between units
const HEADER_H = 22; // subscale/unit header height when grouped
const BASE = { top: 10, right: 62, bottom: 44 }; // left is computed from labels
const MIN_INNER = 260; // minimum bar-area width (below this the chart scrolls)
const MIN_LEFT = 90;
const MAX_LEFT = 320; // beyond this the label column wraps instead of widening
const CHAR_W = 0.62; // rough px-per-char factor at a given font size
const LINE_H = 14; // wrapped-line height
const LABEL_PAD = 12; // gap between label column and bars
const MAX_LINES = 5; // cap wrapped lines (excess is truncated with an ellipsis)

function fmtPct(x) {
  return x >= 0.5 || x === 0 ? `${Math.round(x)}%` : `${x.toFixed(1)}%`;
}

// Greedy word-wrap a label to fit maxWidth px at the given font size, returning
// an array of lines. Over-long single words are hard-broken; the whole thing is
// capped at MAX_LINES with an ellipsis so pathological labels can't explode the
// chart height (the full text stays available via a <title>).
function wrapLabel(text, maxWidth, fontPx) {
  const s = String(text ?? '');
  if (!s.trim()) return [s];
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontPx * CHAR_W)));
  const lines = [];
  let cur = '';
  const flush = () => {
    if (cur) {
      lines.push(cur);
      cur = '';
    }
  };
  for (let word of s.split(/\s+/).filter(Boolean)) {
    while (word.length > maxChars) {
      flush();
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const cand = cur ? `${cur} ${word}` : word;
    if (cand.length <= maxChars) cur = cand;
    else {
      flush();
      cur = word;
    }
  }
  flush();
  if (lines.length === 0) return [''];
  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES);
    kept[MAX_LINES - 1] = kept[MAX_LINES - 1].slice(0, Math.max(1, maxChars - 1)) + '…';
    return kept;
  }
  return lines;
}

export default function LikertChart({
  plotData,
  points,
  labels,
  grouped,
  showPercentLabels,
  filename = 'likert-chart',
}) {
  const colors = useMemo(() => divergingColors(points), [points]);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  // Track the available width so the bar area fills the container instead of the
  // whole SVG being scaled down (which would shrink the height and the text).
  const [availW, setAvailW] = useState(760);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el) setAvailW(Math.floor(el.clientWidth));
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

  // Mouse position relative to the chart wrapper, for the floating tooltip.
  function relPos(e) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Size the left margin to the widest y-axis label so nothing gets clipped.
  // In grouped mode both the per-bar group labels and the subscale/unit
  // headers live in the left gutter, so account for both.
  const marginLeft = useMemo(() => {
    const strings = plotData.map((u) => String(u.label));
    if (grouped) {
      for (const u of plotData) {
        for (const b of u.bars) {
          if (b.groupLabel != null) strings.push(String(b.groupLabel));
        }
      }
    }
    const maxChars = strings.reduce((m, s) => Math.max(m, s.length), 0);
    const est = Math.round(maxChars * 12 * CHAR_W) + 24;
    return Math.max(MIN_LEFT, Math.min(MAX_LEFT, est));
  }, [plotData, grouped]);
  const margin = { ...BASE, left: marginLeft };

  // Overall horizontal domain: symmetric around 0.
  const maxExtent = useMemo(() => {
    let m = 0;
    for (const unit of plotData) {
      for (const bar of unit.bars) {
        m = Math.max(m, bar.leftSum, bar.rightSum);
      }
    }
    return Math.max(10, Math.ceil(m / 10) * 10);
  }, [plotData]);

  // Compute vertical positions, wrapping labels and growing rows/headers to fit.
  const layout = useMemo(() => {
    const labelW = marginLeft - LABEL_PAD;
    let y = BASE.top;
    const rows = [];
    const headers = {};
    for (const unit of plotData) {
      const unitTop = y;
      if (grouped) {
        const hlines = wrapLabel(unit.label, marginLeft - 16, 12);
        headers[unit.key] = { top: unitTop, lines: hlines };
        y += Math.max(HEADER_H, hlines.length * LINE_H + 4);
      }
      unit.bars.forEach((bar, bi) => {
        const labelText = grouped ? bar.groupLabel : unit.label;
        const lines = wrapLabel(labelText, labelW, grouped ? 11 : 12);
        const slotH = Math.max(ROW_H, lines.length * LINE_H);
        rows.push({
          unit,
          bar,
          lines,
          slotH,
          barY: y + (slotH - ROW_H) / 2, // bar vertically centered in its slot
          centerY: y + slotH / 2,
        });
        y += slotH;
        if (bi < unit.bars.length - 1) y += ROW_GAP;
      });
      unit._top = unitTop;
      unit._bottom = y;
      y += UNIT_GAP;
    }
    return { rows, headers, height: y - UNIT_GAP + BASE.bottom };
  }, [plotData, grouped, marginLeft]);

  // Bar area fills the available width; floors at MIN_INNER (then the container
  // scrolls horizontally). svgW == availW when it fits, so no CSS downscaling.
  const innerW = Math.max(MIN_INNER, availW - margin.left - margin.right);
  const svgW = margin.left + innerW + margin.right;
  const svgH = layout.height;

  // x scale: value in [-maxExtent, maxExtent] -> pixels in [0, innerW].
  const xScale = (v) => ((v + maxExtent) / (2 * maxExtent)) * innerW;
  const centerX = margin.left + xScale(0);

  // Axis ticks every 20%.
  const ticks = [];
  for (let t = -maxExtent; t <= maxExtent + 0.001; t += 20) {
    ticks.push(Math.round(t));
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-toolbar">
        <button
          className="dl-btn"
          onClick={() => svgRef.current && downloadPNG(svgRef.current, `${filename}.png`)}
        >
          ⬇ PNG
        </button>
        <button
          className="dl-btn"
          onClick={() => svgRef.current && downloadSVG(svgRef.current, `${filename}.svg`)}
        >
          ⬇ SVG
        </button>
      </div>
      <svg ref={svgRef} width={svgW} height={svgH} className="likert-svg" role="img">
        {/* Grid + axis */}
        {ticks.map((t) => {
          const x = margin.left + xScale(t);
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={margin.top}
                y2={svgH - margin.bottom}
                stroke={t === 0 ? '#888' : '#e6e6e6'}
                strokeWidth={t === 0 ? 1.5 : 1}
              />
              <text x={x} y={svgH - margin.bottom + 16} textAnchor="middle" className="tick-label">
                {Math.abs(t)}%
              </text>
            </g>
          );
        })}
        <text
          x={margin.left + innerW / 2}
          y={svgH - margin.bottom + 34}
          textAnchor="middle"
          className="axis-title"
        >
          Percentage of responses
        </text>

        {/* Unit headers (when grouped) */}
        {grouped &&
          plotData.map((unit) => {
            const h = layout.headers[unit.key];
            return (
              <text key={`h-${unit.key}`} className="unit-header">
                {h.lines.map((ln, i) => (
                  <tspan key={i} x={8} y={h.top + 13 + i * LINE_H} dominantBaseline="central">
                    {ln}
                  </tspan>
                ))}
                <title>{unit.label}</title>
              </text>
            );
          })}

        {/* Bars */}
        {layout.rows.map(({ unit, bar, lines, barY, centerY }) => {
          const rowLabel = grouped ? bar.groupLabel : unit.label;
          const firstLineY = centerY - ((lines.length - 1) * LINE_H) / 2;
          return (
            <g key={`${unit.key}-${bar.groupLabel ?? 'all'}`}>
              <text
                textAnchor="end"
                className={grouped ? 'row-label-sub' : 'row-label'}
              >
                {lines.map((ln, i) => (
                  <tspan
                    key={i}
                    x={margin.left - LABEL_PAD}
                    y={firstLineY + i * LINE_H}
                    dominantBaseline="central"
                  >
                    {ln}
                  </tspan>
                ))}
                <title>{rowLabel}</title>
              </text>
              {bar.n === 0 ? (
                <text
                  x={centerX}
                  y={barY + ROW_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="empty-label"
                >
                  no data
                </text>
              ) : (
                bar.segments.map((seg) => {
                  if (seg.pct <= 0) return null;
                  const x1 = margin.left + xScale(seg.start);
                  const x2 = margin.left + xScale(seg.end);
                  const w = Math.max(0, x2 - x1);
                  const fill = colors[seg.index];
                  const isHover =
                    hover &&
                    hover.unit === unit.key &&
                    hover.group === bar.groupLabel &&
                    hover.index === seg.index;
                  return (
                    <g key={seg.index}>
                      <rect
                        x={x1}
                        y={barY}
                        width={w}
                        height={ROW_H}
                        fill={fill}
                        stroke={isHover ? '#111' : '#fff'}
                        strokeWidth={isHover ? 1.5 : 0.5}
                        onMouseMove={(e) =>
                          setHover({
                            unit: unit.key,
                            group: bar.groupLabel,
                            index: seg.index,
                            pct: seg.pct,
                            count: bar.counts[seg.index],
                            n: bar.n,
                            label: labels[seg.index],
                            unitLabel: unit.label,
                            groupLabel: bar.groupLabel,
                            pos: relPos(e),
                          })
                        }
                        onMouseLeave={() => setHover(null)}
                      />
                      {showPercentLabels && w > 22 && (
                        <text
                          x={(x1 + x2) / 2}
                          y={barY + ROW_H / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="seg-label"
                          fill={textOn(fill)}
                        >
                          {fmtPct(seg.pct)}
                        </text>
                      )}
                    </g>
                  );
                })
              )}
              {/* n label at far right */}
              {bar.n > 0 && (
                <text
                  x={margin.left + innerW + 6}
                  y={barY + ROW_H / 2}
                  dominantBaseline="middle"
                  className="n-label"
                >
                  n={bar.n}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="tooltip-floating"
          style={{
            left: Math.min(hover.pos.x + 14, (wrapRef.current?.clientWidth || 9999) - 190),
            top: Math.max(hover.pos.y - 10, 4),
          }}
        >
          <strong>{hover.unitLabel}</strong>
          {hover.groupLabel != null && <span> · {hover.groupLabel}</span>}
          <br />
          <span className="tt-cat">{hover.label}</span>: {fmtPct(hover.pct)} ({hover.count}/
          {hover.n})
        </div>
      )}
    </div>
  );
}
