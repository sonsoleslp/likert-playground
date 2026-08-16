// Partial-correlation networks from Likert responses.
//
// Correlations: Pearson (fast) or polychoric (assumes each ordinal item is a
// coarsened latent normal — the standard choice for Likert data).
// Regularization: linear shrinkage toward the identity (simple, always stable)
// or EBICglasso (graphical lasso with EBIC model selection — the standard
// psychometric-network estimator). Either yields a precision matrix Θ, from
// which partial correlations are pcor(i,j) = -Θ_ij / sqrt(Θ_ii·Θ_jj).

import { toCode } from './likert.js';

/* ----------------------------- normal helpers ---------------------------- */

// High-accuracy complementary error function (Numerical Recipes erfccheb,
// ~1e-15). Used so polychoric cell probabilities match R to machine tolerance.
const ERFC_COF = [
  -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
  -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
  -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
  5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
  8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
];
function erfccheb(z) {
  let d = 0;
  let dd = 0;
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  for (let j = ERFC_COF.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + ERFC_COF[j];
    dd = tmp;
  }
  return t * Math.exp(-z * z + 0.5 * (ERFC_COF[0] + ty * d) - dd);
}
function erfc(x) {
  return x >= 0 ? erfccheb(x) : 2 - erfccheb(-x);
}
function normCdf(x) {
  return 0.5 * erfc(-x / Math.SQRT2);
}
function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const ph = 1 - pl;
  let q;
  let r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= ph) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// Gauss-Legendre nodes/weights on [-1,1], generated once via Newton iteration
// on the Legendre polynomial (deterministic; no hard-coded tables).
function gaussLegendre(m) {
  const x = new Array(m);
  const w = new Array(m);
  for (let i = 0; i < m; i++) {
    let xi = Math.cos((Math.PI * (i + 0.75)) / (m + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = xi;
      for (let k = 2; k <= m; k++) {
        const p2 = ((2 * k - 1) * xi * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (m * (xi * p1 - p0)) / (xi * xi - 1);
      const dx = -p1 / dp;
      xi += dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    x[i] = xi;
    w[i] = 2 / ((1 - xi * xi) * dp * dp);
  }
  return { x, w };
}
const GLR = gaussLegendre(32);

// P(X >= h, Y >= k) for standard bivariate normal with correlation r
// (Genz asin-integral form; 32-point Gauss-Legendre over [0, asin r]).
function bvnUpper(h, k, r) {
  r = Math.max(-0.9999, Math.min(0.9999, r));
  const hk = h * k;
  const hs = (h * h + k * k) / 2;
  const asr = Math.asin(r);
  let sum = 0;
  for (let i = 0; i < GLR.x.length; i++) {
    const th = (asr * (GLR.x[i] + 1)) / 2;
    const sn = Math.sin(th);
    sum += GLR.w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn));
  }
  const bvn = (sum * asr) / (4 * Math.PI) + normCdf(-h) * normCdf(-k);
  return Math.max(0, Math.min(1, bvn));
}
// P(X <= h, Y <= k), handling infinite limits.
function biCdf(h, k, r) {
  if (h === -Infinity || k === -Infinity) return 0;
  if (h === Infinity && k === Infinity) return 1;
  if (h === Infinity) return normCdf(k);
  if (k === Infinity) return normCdf(h);
  return bvnUpper(-h, -k, r);
}

/* --------------------------- correlation matrices ------------------------ */

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
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom <= 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function goldenMax(f, a, b, iters = 40) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    } else {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    }
  }
  return (a + b) / 2;
}

// Two-step ML polychoric correlation between two aligned ordinal vectors.
function polychoricPair(x, y) {
  // Complete pairs + category maps.
  const xs = [];
  const ys = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] == null || y[i] == null) continue;
    xs.push(x[i]);
    ys.push(y[i]);
  }
  const N = xs.length;
  if (N < 5) return 0;
  const cx = [...new Set(xs)].sort((p, q) => p - q);
  const cy = [...new Set(ys)].sort((p, q) => p - q);
  if (cx.length < 2 || cy.length < 2) return 0;
  const ix = new Map(cx.map((v, i) => [v, i]));
  const iy = new Map(cy.map((v, i) => [v, i]));
  const R = cx.length;
  const C = cy.length;
  const tab = Array.from({ length: R }, () => new Array(C).fill(0));
  for (let i = 0; i < N; i++) tab[ix.get(xs[i])][iy.get(ys[i])]++;

  // Thresholds from marginals.
  const rowMarg = tab.map((row) => row.reduce((s, v) => s + v, 0));
  const colMarg = new Array(C).fill(0);
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) colMarg[j] += tab[i][j];
  const tx = [-Infinity];
  let cum = 0;
  for (let i = 0; i < R - 1; i++) {
    cum += rowMarg[i];
    tx.push(normInv(cum / N));
  }
  tx.push(Infinity);
  const ty = [-Infinity];
  cum = 0;
  for (let j = 0; j < C - 1; j++) {
    cum += colMarg[j];
    ty.push(normInv(cum / N));
  }
  ty.push(Infinity);

  const loglik = (rho) => {
    let ll = 0;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        const n = tab[i][j];
        if (n === 0) continue;
        const p =
          biCdf(tx[i + 1], ty[j + 1], rho) -
          biCdf(tx[i], ty[j + 1], rho) -
          biCdf(tx[i + 1], ty[j], rho) +
          biCdf(tx[i], ty[j], rho);
        ll += n * Math.log(Math.max(p, 1e-12));
      }
    }
    return ll;
  };
  return Math.max(-0.999, Math.min(0.999, goldenMax(loglik, -0.99, 0.99, 40)));
}

function correlationMatrix(V, kind) {
  const n = V.length;
  const R = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    R[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = kind === 'polychoric' ? polychoricPair(V[i], V[j]) : pearson(V[i], V[j]);
      R[i][j] = R[j][i] = Number.isFinite(r) ? r : 0;
    }
  }
  return R;
}

/* ------------------------------ linear algebra --------------------------- */

function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
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

// log|M| for symmetric positive-definite M via Cholesky; null if not PD.
function logdetPD(M) {
  const n = M.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  let ld = 0;
  for (let i = 0; i < n; i++) ld += Math.log(L[i][i]);
  return 2 * ld;
}

/* ------------------------------ graphical lasso -------------------------- */

const soft = (x, t) => Math.sign(x) * Math.max(Math.abs(x) - t, 0);

// Graphical lasso (Friedman, Hastie & Tibshirani 2008) on covariance S with
// penalty rho. penalize.diagonal=false matches qgraph::EBICglasso / glasso
// defaults (the diagonal of the covariance estimate is not penalized).
// Returns { precision, W }.
function glasso(S, rho, { penalizeDiagonal = false, maxIter = 200, tol = 1e-5 } = {}) {
  const p = S.length;
  const W = S.map((row, i) => row.map((v, j) => (i === j ? v + (penalizeDiagonal ? rho : 0) : v)));
  const B = Array.from({ length: p }, () => new Array(p - 1).fill(0));

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let j = 0; j < p; j++) {
      const idx = [];
      for (let a = 0; a < p; a++) if (a !== j) idx.push(a);
      // V = W_11, u = S_12
      const V = idx.map((a) => idx.map((b) => W[a][b]));
      const u = idx.map((a) => S[a][j]);
      const beta = B[j];
      // Coordinate-descent lasso.
      for (let it = 0; it < 100; it++) {
        let change = 0;
        for (let i = 0; i < p - 1; i++) {
          let s = u[i];
          for (let k = 0; k < p - 1; k++) if (k !== i) s -= V[i][k] * beta[k];
          const old = beta[i];
          beta[i] = V[i][i] > 0 ? soft(s, rho) / V[i][i] : 0;
          change = Math.max(change, Math.abs(beta[i] - old));
        }
        if (change < tol) break;
      }
      // w_12 = V beta
      for (let a = 0; a < p - 1; a++) {
        let w = 0;
        for (let b = 0; b < p - 1; b++) w += V[a][b] * beta[b];
        const col = idx[a];
        maxDelta = Math.max(maxDelta, Math.abs(W[col][j] - w));
        W[col][j] = w;
        W[j][col] = w;
      }
    }
    if (maxDelta < tol) break;
  }

  // Recover precision Θ from W and the betas.
  const Theta = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let j = 0; j < p; j++) {
    const idx = [];
    for (let a = 0; a < p; a++) if (a !== j) idx.push(a);
    const beta = B[j];
    let dot = 0;
    for (let a = 0; a < p - 1; a++) dot += W[idx[a]][j] * beta[a];
    const denom = W[j][j] - dot;
    const tjj = denom > 1e-12 ? 1 / denom : 1e12;
    Theta[j][j] = tjj;
    for (let a = 0; a < p - 1; a++) Theta[idx[a]][j] = -beta[a] * tjj;
  }
  // Symmetrize.
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
    const m = (Theta[i][j] + Theta[j][i]) / 2;
    Theta[i][j] = Theta[j][i] = m;
  }
  return { precision: Theta, W };
}

// EBICglasso: run glasso over a lambda path and pick the one minimizing EBIC.
function ebicGlasso(S, n, { gamma = 0.5, nLambda = 100, ratio = 0.01 } = {}) {
  const p = S.length;
  let lamMax = 0;
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) lamMax = Math.max(lamMax, Math.abs(S[i][j]));
  lamMax = Math.max(lamMax, 0.01);
  const lamMin = lamMax * ratio;
  const lambdas = [];
  for (let t = 0; t < nLambda; t++) {
    const f = t / (nLambda - 1);
    lambdas.push(Math.exp(Math.log(lamMax) - f * (Math.log(lamMax) - Math.log(lamMin))));
  }

  let best = null;
  for (const lam of lambdas) {
    const g = glasso(S, lam);
    if (!g) continue;
    const Theta = g.precision;
    const ld = logdetPD(Theta);
    if (ld == null) continue;
    let trace = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) trace += S[i][j] * Theta[j][i];
    const loglik = (n / 2) * (ld - trace);
    let E = 0;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) if (Math.abs(Theta[i][j]) > 1e-8) E++;
    const ebic = -2 * loglik + E * Math.log(n) + 4 * gamma * E * Math.log(p);
    if (!best || ebic < best.ebic) best = { ebic, lambda: lam, precision: Theta, edges: E };
  }
  return best;
}

/* ------------------------------- public API ------------------------------ */

// opts: { valueMap, type: 'partial'|'correlation', corr: 'pearson'|'polychoric',
//         estimator: 'shrinkage'|'glasso', alpha (shrinkage), threshold, ebicGamma }
export function buildNetwork(rows, columns, opts = {}) {
  const {
    valueMap = null,
    type = 'partial',
    corr = 'pearson',
    estimator = 'shrinkage',
    alpha = 0.15,
    threshold = 0,
    ebicGamma = 0.5,
  } = opts;

  const vectors = columns.map((c) => rows.map((r) => toCode(r[c], valueMap)));
  const keep = [];
  columns.forEach((c, idx) => {
    const vals = vectors[idx].filter((v) => v != null);
    if (vals.length >= 3 && new Set(vals).size >= 2) keep.push(idx);
  });
  const dropped = columns.filter((_, idx) => !keep.includes(idx));
  const nodes = keep.map((idx) => columns[idx]);
  const V = keep.map((idx) => vectors[idx]);
  const n = nodes.length;

  const empty = {
    nodes,
    edges: [],
    assoc: [],
    dropped,
    completeN: 0,
    sampleN: rows.length,
    type,
    corr,
    estimator,
    effectiveAlpha: alpha,
    lambda: null,
    singular: false,
  };
  if (n < 2) return empty;

  const R = correlationMatrix(V, corr);

  let completeN = 0;
  for (let k = 0; k < rows.length; k++) {
    let ok = true;
    for (let i = 0; i < n; i++) if (V[i][k] == null) { ok = false; break; }
    if (ok) completeN++;
  }

  // `assoc` holds the edge weights: zero-order correlations, or partials.
  let assoc;
  let effectiveAlpha = alpha;
  let lambda = null;
  let usedEstimator = 'correlation';
  let singular = false;

  if (type === 'correlation') {
    assoc = R;
  } else {
    let precision = null;
    if (estimator === 'glasso') {
      const res = ebicGlasso(R, Math.max(completeN, 2), { gamma: ebicGamma });
      if (res) {
        precision = res.precision;
        lambda = res.lambda;
        usedEstimator = 'glasso';
      }
    }
    if (!precision) {
      // Shrinkage path (or glasso fallback). Auto-increase if singular.
      let a = estimator === 'glasso' ? 0.1 : alpha;
      let tries = 0;
      while (!precision && tries < 8) {
        const Rs = R.map((row, i) => row.map((v, j) => (i === j ? 1 : (1 - a) * v)));
        precision = invert(Rs);
        if (!precision) {
          a = a < 0.02 ? 0.05 : Math.min(0.95, a * 1.7);
          tries++;
        }
      }
      effectiveAlpha = a;
      lambda = null;
      usedEstimator = 'shrinkage';
    }

    assoc = Array.from({ length: n }, () => new Array(n).fill(0));
    singular = !precision;
    if (precision) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const denom = Math.sqrt(precision[i][i] * precision[j][j]);
          const p = denom > 0 ? -precision[i][j] / denom : 0;
          assoc[i][j] = assoc[j][i] = Number.isFinite(p) ? p : 0;
        }
      }
    }
  }

  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = assoc[i][j];
      if (Number.isFinite(w) && Math.abs(w) >= threshold && Math.abs(w) > 1e-6) edges.push({ i, j, weight: w });
    }
  }

  return {
    nodes,
    edges,
    assoc,
    dropped,
    completeN,
    sampleN: rows.length,
    type,
    corr,
    estimator: usedEstimator,
    effectiveAlpha,
    lambda,
    singular,
  };
}

// Test hooks (used by the R cross-validation harness, not the app).
export const _test = {
  glassoPrecision: (S, lambda, opts) => glasso(S, lambda, opts).precision,
  ebicGlasso,
  invert,
  biCdf,
  polychoricPair,
  normInv,
  normCdf,
};

// Deterministic Fruchterman-Reingold layout. Seeds nodes on a circle (stable
// across renders). Returns fitted {x,y} positions.
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
        disp[i].x += (dx / dist) * rep;
        disp[i].y += (dy / dist) * rep;
        disp[j].x -= (dx / dist) * rep;
        disp[j].y -= (dy / dist) * rep;
      }
    }
    for (const e of edges) {
      const w = Math.min(1, Math.abs(e.weight));
      let dx = pos[e.i].x - pos[e.j].x;
      let dy = pos[e.i].y - pos[e.j].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const att = ((dist * dist) / k) * (0.4 + w);
      disp[e.i].x -= (dx / dist) * att;
      disp[e.i].y -= (dy / dist) * att;
      disp[e.j].x += (dx / dist) * att;
      disp[e.j].y += (dy / dist) * att;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01;
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
    }
    temp = Math.max(temp - cool, 0.5);
  }

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
  const s = Math.min((width - 2 * pad) / (maxX - minX || 1), (height - 2 * pad) / (maxY - minY || 1));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pos.map((p) => ({ x: width / 2 + (p.x - cx) * s, y: height / 2 + (p.y - cy) * s }));
}
