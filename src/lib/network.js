// Partial-correlation network from Likert responses.
//
// Pipeline: pairwise Pearson correlation matrix R among items -> linear
// shrinkage toward the identity (regularization, keeps R invertible for small
// samples) -> precision matrix Θ = R⁻¹ -> partial correlations
// pcor(i,j) = -Θ_ij / sqrt(Θ_ii·Θ_jj). Edges above a threshold are drawn.
//
// Shrinkage is a pragmatic stand-in for EBICglasso: it guarantees a stable,
// positive-definite estimate when there are more items than respondents, which
// is common for questionnaire data.

import { toCode } from './likert';

// Pearson correlation over pairwise-complete cases (nulls skipped).
function pearson(x, y) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = y[i];
    if (a == null || b == null) continue;
    n++;
    sx += a;
    sy += b;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
  }
  if (n < 3) return 0;
  const cov = n * sxy - sx * sy;
  const vx = n * sxx - sx * sx;
  const vy = n * syy - sy * sy;
  const denom = Math.sqrt(vx * vy);
  if (denom <= 0) return 0;
  return cov / denom;
}

// Gauss-Jordan inverse with partial pivoting. Returns null if singular.
function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-10) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let j = 0; j < 2 * n; j++) A[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map((row) => row.slice(n));
}

// Build the partial-correlation network for the given item columns.
// opts: { valueMap, alpha (shrinkage 0..1), threshold (min |pcor| to draw) }
export function buildNetwork(rows, columns, opts = {}) {
  const { valueMap = null, alpha = 0.15, threshold = 0 } = opts;

  const vectors = columns.map((c) => rows.map((r) => toCode(r[c], valueMap)));

  // Drop constant / too-sparse columns (undefined correlations).
  const keep = [];
  columns.forEach((c, idx) => {
    const vals = vectors[idx].filter((v) => v != null);
    if (vals.length >= 3 && new Set(vals).size >= 2) keep.push(idx);
  });
  const dropped = columns.filter((_, idx) => !keep.includes(idx));
  const nodes = keep.map((idx) => columns[idx]);
  const V = keep.map((idx) => vectors[idx]);
  const n = nodes.length;

  if (n < 2) {
    return { nodes, edges: [], pcor: [], dropped, completeN: 0, sampleN: rows.length, effectiveAlpha: alpha, singular: false };
  }

  // Correlation matrix.
  const R = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    R[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearson(V[i], V[j]);
      R[i][j] = R[j][i] = Number.isFinite(r) ? r : 0;
    }
  }

  // Listwise-complete sample size (for reporting).
  let completeN = 0;
  for (let k = 0; k < rows.length; k++) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (V[i][k] == null) {
        ok = false;
        break;
      }
    }
    if (ok) completeN++;
  }

  // Shrink toward identity and invert; auto-increase shrinkage if singular.
  let a = alpha;
  let precision = null;
  let tries = 0;
  while (!precision && tries < 8) {
    const Rs = R.map((row, i) => row.map((v, j) => (i === j ? 1 : (1 - a) * v)));
    precision = invert(Rs);
    if (!precision) {
      a = a < 0.02 ? 0.05 : Math.min(0.95, a * 1.7);
      tries++;
    }
  }

  const pcor = Array.from({ length: n }, () => new Array(n).fill(0));
  if (precision) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const denom = Math.sqrt(precision[i][i] * precision[j][j]);
        const p = denom > 0 ? -precision[i][j] / denom : 0;
        pcor[i][j] = pcor[j][i] = Number.isFinite(p) ? p : 0;
      }
    }
  }

  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = pcor[i][j];
      if (Number.isFinite(w) && Math.abs(w) >= threshold && Math.abs(w) > 1e-6) {
        edges.push({ i, j, weight: w });
      }
    }
  }

  return {
    nodes,
    edges,
    pcor,
    dropped,
    completeN,
    sampleN: rows.length,
    effectiveAlpha: a,
    singular: !precision,
  };
}

// Deterministic Fruchterman-Reingold force layout. Seeds nodes on a circle
// (no randomness -> stable across renders) and returns fitted {x,y} positions.
export function forceLayout(n, edges, { width, height, iterations = 320, pad = 46 } = {}) {
  if (n === 0) return [];
  if (n === 1) return [{ x: width / 2, y: height / 2 }];

  const k = Math.sqrt((width * height) / n) * 0.55;
  const pos = Array.from({ length: n }, (_, i) => {
    const ang = (2 * Math.PI * i) / n;
    return { x: width / 2 + Math.cos(ang) * width * 0.32, y: height / 2 + Math.sin(ang) * height * 0.32 };
  });

  let temp = width * 0.12;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const rep = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        disp[i].x += ux * rep;
        disp[i].y += uy * rep;
        disp[j].x -= ux * rep;
        disp[j].y -= uy * rep;
      }
    }

    for (const e of edges) {
      const w = Math.min(1, Math.abs(e.weight));
      let dx = pos[e.i].x - pos[e.j].x;
      let dy = pos[e.i].y - pos[e.j].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const att = ((dist * dist) / k) * (0.4 + w);
      const ux = dx / dist;
      const uy = dy / dist;
      disp[e.i].x -= ux * att;
      disp[e.i].y -= uy * att;
      disp[e.j].x += ux * att;
      disp[e.j].y += uy * att;
    }

    for (let i = 0; i < n; i++) {
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01;
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
    }
    temp = Math.max(temp - cool, 0.5);
  }

  // Fit to viewport with padding.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const sx = (width - 2 * pad) / (maxX - minX || 1);
  const sy = (height - 2 * pad) / (maxY - minY || 1);
  const s = Math.min(sx, sy);
  // Center the scaled cloud.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pos.map((p) => ({
    x: width / 2 + (p.x - cx) * s,
    y: height / 2 + (p.y - cy) * s,
  }));
}
