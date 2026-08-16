// Export the bundled TAM data and JS-computed network matrices to CSV, so the
// R harness (validate.R) can check numerical equivalence with qgraph/lavaan.
//
// Usage:  node scripts/validate/export_matrices.mjs
// Writes: scripts/validate/out/{data,js_*}.csv

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tamReal } from '../../src/data/tam_real.js';
import { buildNetwork } from '../../src/lib/network.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });

const cols = tamReal.likertColumns;

const dataLines = [cols.join(',')];
for (const r of tamReal.rows) dataLines.push(cols.map((c) => r[c]).join(','));
fs.writeFileSync(path.join(OUT, 'data.csv'), dataLines.join('\n'));

function saveMat(name, mat) {
  const out = [cols.join(',')];
  for (const row of mat) out.push(row.map((v) => v.toFixed(8)).join(','));
  fs.writeFileSync(path.join(OUT, name), out.join('\n'));
}

saveMat('js_pearson.csv', buildNetwork(tamReal.rows, cols, { type: 'correlation', corr: 'pearson', threshold: 0 }).assoc);
saveMat('js_polychoric.csv', buildNetwork(tamReal.rows, cols, { type: 'correlation', corr: 'polychoric', threshold: 0 }).assoc);
saveMat('js_ebicglasso_pearson.csv', buildNetwork(tamReal.rows, cols, { type: 'partial', corr: 'pearson', estimator: 'glasso', threshold: 0, ebicGamma: 0.5 }).assoc);
saveMat('js_ebicglasso_poly.csv', buildNetwork(tamReal.rows, cols, { type: 'partial', corr: 'polychoric', estimator: 'glasso', threshold: 0, ebicGamma: 0.5 }).assoc);

console.log(`Wrote data + JS matrices to ${OUT}`);
