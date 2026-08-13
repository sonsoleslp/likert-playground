import { useMemo, useRef, useState } from 'react';
import { divergingColors, textOn } from '../lib/colors';
import { downloadPNG, downloadSVG } from '../lib/exportImage';

// Layout constants.
const ROW_H = 26; // bar height
const ROW_GAP = 6; // gap between bars within a unit
const UNIT_GAP = 18; // gap between units
const HEADER_H = 22; // subscale/unit header height when grouped
const MARGIN = { top: 10, right: 62, bottom: 44, left: 200 };

function fmtPct(x) {
  return x >= 0.5 || x === 0 ? `${Math.round(x)}%` : `${x.toFixed(1)}%`;
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

  // Mouse position relative to the chart wrapper, for the floating tooltip.
  function relPos(e) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

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

  // Compute vertical positions.
  const layout = useMemo(() => {
    let y = MARGIN.top;
    const rows = [];
    for (const unit of plotData) {
      const unitTop = y;
      if (grouped) y += HEADER_H;
      unit.bars.forEach((bar, bi) => {
        rows.push({ unit, bar, y });
        y += ROW_H;
        if (bi < unit.bars.length - 1) y += ROW_GAP;
      });
      const unitBottom = y;
      unit._top = unitTop;
      unit._bottom = unitBottom;
      y += UNIT_GAP;
    }
    return { rows, height: y - UNIT_GAP + MARGIN.bottom };
  }, [plotData, grouped]);

  const plotW = 720;
  const innerW = plotW - MARGIN.left - MARGIN.right;
  const svgW = plotW;
  const svgH = layout.height;

  // x scale: value in [-maxExtent, maxExtent] -> pixels in [0, innerW].
  const xScale = (v) => ((v + maxExtent) / (2 * maxExtent)) * innerW;
  const centerX = MARGIN.left + xScale(0);

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
          const x = MARGIN.left + xScale(t);
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={MARGIN.top}
                y2={svgH - MARGIN.bottom}
                stroke={t === 0 ? '#888' : '#e6e6e6'}
                strokeWidth={t === 0 ? 1.5 : 1}
              />
              <text x={x} y={svgH - MARGIN.bottom + 16} textAnchor="middle" className="tick-label">
                {Math.abs(t)}%
              </text>
            </g>
          );
        })}
        <text
          x={MARGIN.left + innerW / 2}
          y={svgH - MARGIN.bottom + 34}
          textAnchor="middle"
          className="axis-title"
        >
          Percentage of responses
        </text>

        {/* Unit headers (when grouped) */}
        {grouped &&
          plotData.map((unit) => (
            <text key={`h-${unit.key}`} x={8} y={unit._top + 15} className="unit-header">
              {unit.label}
            </text>
          ))}

        {/* Bars */}
        {layout.rows.map(({ unit, bar }, idx) => {
          const rowLabel = grouped ? bar.groupLabel : unit.label;
          const y = layout.rows[idx].y;
          return (
            <g key={`${unit.key}-${bar.groupLabel ?? 'all'}`}>
              <text
                x={MARGIN.left - 10}
                y={y + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className={grouped ? 'row-label-sub' : 'row-label'}
              >
                {rowLabel}
              </text>
              {bar.n === 0 ? (
                <text
                  x={centerX}
                  y={y + ROW_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="empty-label"
                >
                  no data
                </text>
              ) : (
                bar.segments.map((seg) => {
                  if (seg.pct <= 0) return null;
                  const x1 = MARGIN.left + xScale(seg.start);
                  const x2 = MARGIN.left + xScale(seg.end);
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
                        y={y}
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
                          y={y + ROW_H / 2}
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
                  x={MARGIN.left + innerW + 6}
                  y={y + ROW_H / 2}
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
