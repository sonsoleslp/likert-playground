// Diverging color palette for Likert scales.
// Interpolates red (negative) -> light gray (neutral) -> blue (positive).

const STOPS = [
  { p: 0.0, c: [178, 24, 43] }, // #b2182b dark red
  { p: 0.25, c: [239, 138, 98] }, // #ef8a62
  { p: 0.5, c: [222, 222, 222] }, // #dedede neutral gray
  { p: 0.75, c: [103, 169, 207] }, // #67a9cf
  { p: 1.0, c: [33, 102, 172] }, // #2166ac dark blue
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function sampleGradient(p) {
  if (p <= 0) return STOPS[0].c;
  if (p >= 1) return STOPS[STOPS.length - 1].c;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const s0 = STOPS[i];
    const s1 = STOPS[i + 1];
    if (p >= s0.p && p <= s1.p) {
      const t = (p - s0.p) / (s1.p - s0.p);
      return [
        lerp(s0.c[0], s1.c[0], t),
        lerp(s0.c[1], s1.c[1], t),
        lerp(s0.c[2], s1.c[2], t),
      ];
    }
  }
  return STOPS[STOPS.length - 1].c;
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Returns an array of n hex colors spread across the diverging gradient.
export function divergingColors(n) {
  if (n <= 1) return [toHex(sampleGradient(0.5))];
  const out = [];
  for (let i = 0; i < n; i++) {
    // Sample category centers evenly across the full gradient.
    const p = i / (n - 1);
    out.push(toHex(sampleGradient(p)));
  }
  return out;
}

// Pick readable text color (black/white) for a given background hex.
export function textOn(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}
