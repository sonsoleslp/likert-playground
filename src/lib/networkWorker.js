// Web Worker: computes partial/zero-order correlation networks off the main
// thread so the UI never freezes (polychoric + EBICglasso can take ~1s+).
// Computes at threshold 0 and returns the full edge list; the main thread
// applies the display threshold instantly without a recompute.

import { buildNetwork } from './network.js';

function groupKey(v) {
  return v === null || v === undefined || v === '' ? '(missing)' : String(v);
}

function groupsOf(rows, splitBy) {
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
}

// Keep only what the renderer needs (drop the full assoc/pcor matrices).
function trim(net) {
  return {
    nodes: net.nodes,
    edges: net.edges,
    completeN: net.completeN,
    lambda: net.lambda,
    estimator: net.estimator,
    dropped: net.dropped,
  };
}

self.onmessage = (e) => {
  const { id, rows, columns, valueMap, type, corr, estimator, alpha, ebicGamma, splitBy } = e.data;
  const opts = { valueMap, type, corr, estimator, alpha, threshold: 0, ebicGamma };

  let groups;
  let refNet;
  try {
    if (!splitBy) {
      const net = buildNetwork(rows, columns, opts);
      groups = [{ label: null, net: trim(net) }];
      refNet = { nodes: net.nodes, edges: net.edges };
    } else {
      groups = groupsOf(rows, splitBy).map((g) => ({
        label: g.label,
        net: trim(buildNetwork(g.rows, columns, opts)),
      }));
      // Cheap Pearson/shrinkage reference for a layout shared across panels.
      const ref = buildNetwork(rows, columns, {
        valueMap,
        type: 'partial',
        corr: 'pearson',
        estimator: 'shrinkage',
        alpha: 0.15,
        threshold: 0,
      });
      refNet = { nodes: ref.nodes, edges: ref.edges };
    }
    self.postMessage({ id, groups, refNet });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
