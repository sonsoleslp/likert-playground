// Core Likert aggregation and diverging-bar geometry.

// Coerce a raw cell value to an integer scale code, or null if not a valid
// response. Accepts numbers and numeric strings; optionally maps text labels
// via valueMap ({ "Strongly agree": 5, ... }).
export function toCode(raw, valueMap) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, raw)) {
    return valueMap[raw];
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

// Count responses across one or more columns, pooled together.
// Returns { counts: number[points], n, missing }.
export function distribution(rows, columns, points, valueMap) {
  const counts = new Array(points).fill(0);
  let n = 0;
  let missing = 0;
  for (const row of rows) {
    for (const col of columns) {
      const code = toCode(row[col], valueMap);
      if (code === null || code < 1 || code > points) {
        missing++;
        continue;
      }
      counts[code - 1]++;
      n++;
    }
  }
  return { counts, n, missing };
}

// Convert counts to percentages (0-100).
export function toPercents(counts, n) {
  if (!n) return counts.map(() => 0);
  return counts.map((c) => (c / n) * 100);
}

// Weighted mean response (on the 1..points scale) from counts.
export function meanFromCounts(counts) {
  let sum = 0;
  let n = 0;
  counts.forEach((c, i) => {
    sum += c * (i + 1);
    n += c;
  });
  return n ? sum / n : null;
}

// Geometry for a diverging stacked bar.
// Given percentages per category and the neutral handling, returns segments
// with signed offsets so that the scale is centered at 0.
//
// For an odd number of points there is a middle "neutral" category which is
// split half to the left and half to the right. For an even scale there is no
// neutral split — the divide sits between the two central categories.
export function divergingSegments(percents) {
  const points = percents.length;
  const mid = (points - 1) / 2; // fractional index of the center

  // leftShare: portion of each category that lies left of center.
  // Categories fully below the center contribute entirely to the left; the
  // exact middle category (odd scales) contributes half.
  let leftSum = 0;
  let rightSum = 0;
  const parts = percents.map((pct, i) => {
    let leftPortion;
    if (i < Math.floor(mid)) leftPortion = 1;
    else if (i > Math.ceil(mid)) leftPortion = 0;
    else if (i === mid) leftPortion = 0.5; // exact neutral (odd scale)
    else leftPortion = i < mid ? 1 : 0; // even scale center boundary
    const leftW = pct * leftPortion;
    const rightW = pct - leftW;
    leftSum += leftW;
    rightSum += rightW;
    return { i, pct, leftW, rightW };
  });

  // Walk from the leftmost edge (-leftSum) rightward, laying segments.
  let cursor = -leftSum;
  const segments = parts.map((part) => {
    const start = cursor;
    cursor += part.pct;
    return { index: part.i, pct: part.pct, start, end: cursor };
  });

  return { segments, leftSum, rightSum };
}

// Build the full set of rows to plot.
// unit: 'items' | 'subscales'
// groupBy: column name or null
// Returns an ordered list of "series" grouped by unit:
//   [{ key, label, subscale, bars: [{ groupLabel, counts, n, percents, mean,
//      segments, leftSum, rightSum }] }]
export function buildPlotData(dataset, opts) {
  const { rows, points, valueMap } = dataset;
  const { unit, groupBy, likertColumns, subscales } = opts;

  // Determine the list of units and their contributing columns.
  let units;
  if (unit === 'subscales') {
    units = subscales
      .filter((s) => s.columns.length > 0)
      .map((s) => ({ key: s.name, label: s.name, subscale: s.name, columns: s.columns }));
  } else {
    // Map each likert column to its subscale (for grouping/labeling).
    const colToSub = {};
    subscales.forEach((s) => s.columns.forEach((c) => (colToSub[c] = s.name)));
    units = likertColumns.map((c) => ({
      key: c,
      label: c,
      subscale: colToSub[c] || null,
      columns: [c],
    }));
  }

  // Determine group values (in order of first appearance).
  let groups;
  if (groupBy) {
    const seen = new Set();
    groups = [];
    for (const row of rows) {
      const v = row[groupBy];
      const key = v === null || v === undefined || v === '' ? '(missing)' : String(v);
      if (!seen.has(key)) {
        seen.add(key);
        groups.push(key);
      }
    }
    groups.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } else {
    groups = [null];
  }

  return units.map((u) => {
    const bars = groups.map((g) => {
      const subset =
        g === null
          ? rows
          : rows.filter((row) => {
              const v = row[groupBy];
              const key = v === null || v === undefined || v === '' ? '(missing)' : String(v);
              return key === g;
            });
      const { counts, n } = distribution(subset, u.columns, points, valueMap);
      const percents = toPercents(counts, n);
      const { segments, leftSum, rightSum } = divergingSegments(percents);
      return {
        groupLabel: g,
        counts,
        n,
        percents,
        mean: meanFromCounts(counts),
        segments,
        leftSum,
        rightSum,
      };
    });
    return { key: u.key, label: u.label, subscale: u.subscale, bars };
  });
}

// Try to guess whether a column holds Likert responses: mostly integers in a
// small range (2..11) with limited distinct values.
export function guessLikertColumns(rows, columns, maxPoints = 11) {
  const sample = rows.slice(0, 500);
  return columns.filter((col) => {
    let numeric = 0;
    let total = 0;
    let min = Infinity;
    let max = -Infinity;
    const distinct = new Set();
    for (const row of sample) {
      const raw = row[col];
      if (raw === null || raw === undefined || raw === '') continue;
      total++;
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) continue;
      numeric++;
      min = Math.min(min, n);
      max = Math.max(max, n);
      distinct.add(n);
    }
    if (total === 0) return false;
    if (numeric / total < 0.9) return false; // mostly integers
    if (min < 0 || max > maxPoints) return false;
    if (distinct.size < 2 || distinct.size > maxPoints) return false;
    const span = max - min + 1;
    return span >= 2 && span <= maxPoints;
  });
}

// Inspect the chosen Likert columns for data-quality problems.
// Classifies every cell as valid, missing (blank), or invalid (present but not
// an integer within 1..points). Returns counts, affected-row counts, and a few
// concrete examples to show the user.
export function analyzeQuality(rows, columns, points, valueMap) {
  let missing = 0;
  let invalid = 0;
  let valid = 0;
  const rowsMissing = new Set();
  const rowsInvalid = new Set();
  const invalidExamples = [];
  const missingExamples = [];

  rows.forEach((row, ri) => {
    columns.forEach((col) => {
      const raw = row[col];
      const empty = raw === null || raw === undefined || String(raw).trim() === '';
      if (empty) {
        missing++;
        rowsMissing.add(ri);
        if (missingExamples.length < 5) missingExamples.push({ row: ri + 1, col });
        return;
      }
      const code = toCode(raw, valueMap);
      if (code === null || code < 1 || code > points) {
        invalid++;
        rowsInvalid.add(ri);
        if (invalidExamples.length < 5) invalidExamples.push({ row: ri + 1, col, value: String(raw) });
        return;
      }
      valid++;
    });
  });

  const totalCells = rows.length * columns.length;
  return {
    totalRows: rows.length,
    totalCells,
    valid,
    missing,
    invalid,
    rowsWithMissing: rowsMissing.size,
    rowsWithInvalid: rowsInvalid.size,
    cleanRows: rows.length - new Set([...rowsMissing, ...rowsInvalid]).size,
    invalidExamples,
    missingExamples,
  };
}

// Detect the number of scale points from data (max observed code).
export function detectPoints(rows, columns, fallback = 5) {
  let max = 0;
  for (const row of rows) {
    for (const col of columns) {
      const code = toCode(row[col]);
      if (code !== null && code > max) max = code;
    }
  }
  return max >= 2 ? max : fallback;
}
