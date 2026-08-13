import { divergingColors, textOn } from '../lib/colors';

export default function Legend({ points, labels }) {
  const colors = divergingColors(points);
  return (
    <div className="legend">
      {colors.map((c, i) => (
        <div key={i} className="legend-item">
          <span className="legend-swatch" style={{ background: c, color: textOn(c) }}>
            {i + 1}
          </span>
          <span className="legend-label">{labels[i] || `Level ${i + 1}`}</span>
        </div>
      ))}
    </div>
  );
}
