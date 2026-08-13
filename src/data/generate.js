// Deterministic synthetic Likert-response generator for example datasets.
// Uses a seeded PRNG so datasets are stable across reloads.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller.
function makeNormal(rng) {
  return function (mean = 0, sd = 1) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + sd * z;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function clampRound(x, min, max) {
  return Math.max(min, Math.min(max, Math.round(x)));
}

// spec: {
//   seed, n, points,
//   groupingColumns: [{ name, levels: [{ value, weight? }] }],
//   subscales: [{ name, prefix, count, base, groupEffects?: { colName: { value: delta } } }],
// }
// Returns { columns, rows, subscales, likertColumns }.
export function generateDataset(spec) {
  const rng = mulberry32(spec.seed);
  const normal = makeNormal(rng);
  const { points } = spec;

  // Build item list.
  const items = [];
  spec.subscales.forEach((s) => {
    for (let i = 1; i <= s.count; i++) {
      items.push({
        col: `${s.prefix}${i}`,
        subscale: s.name,
        base: s.base + normal(0, 0.2), // small per-item difficulty
        groupEffects: s.groupEffects || {},
      });
    }
  });

  const rows = [];
  for (let r = 0; r < spec.n; r++) {
    const row = { id: `R${String(r + 1).padStart(3, '0')}` };
    // Assign grouping levels.
    const groupVals = {};
    spec.groupingColumns.forEach((gc) => {
      const level = pick(rng, gc.levels);
      groupVals[gc.name] = level.value;
      row[gc.name] = level.value;
    });
    // Latent person ability (respondent tendency to agree).
    const person = normal(0, 0.7);
    items.forEach((it) => {
      let effect = 0;
      Object.entries(it.groupEffects).forEach(([col, mapping]) => {
        const v = groupVals[col];
        if (mapping && v in mapping) effect += mapping[v];
      });
      const latent = it.base + person + effect + normal(0, 0.9);
      row[it.col] = clampRound(latent, 1, points);
    });
    rows.push(row);
  }

  const likertColumns = items.map((it) => it.col);
  const subscales = spec.subscales.map((s) => ({
    name: s.name,
    columns: items.filter((it) => it.subscale === s.name).map((it) => it.col),
  }));
  const columns = ['id', ...spec.groupingColumns.map((g) => g.name), ...likertColumns];

  return { columns, rows, subscales, likertColumns };
}
