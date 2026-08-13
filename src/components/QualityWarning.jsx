import { useState } from 'react';

// Shows a dismissible banner summarizing data-quality issues in the selected
// Likert columns: blank (missing) responses, out-of-range / non-numeric
// (invalid) responses, and any CSV row-parsing errors. Invalid and missing
// cells are excluded from the plotted percentages (each bar's n reflects only
// valid responses), so this banner is how the user learns they were dropped.
export default function QualityWarning({ quality, parseErrors }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const hasParse = parseErrors && parseErrors.length > 0;
  const hasIssues = quality && (quality.missing > 0 || quality.invalid > 0);
  if (dismissed || (!hasIssues && !hasParse)) return null;

  const parts = [];
  if (quality?.invalid > 0) {
    parts.push(
      `${quality.invalid} invalid value${quality.invalid === 1 ? '' : 's'} in ${quality.rowsWithInvalid} row${quality.rowsWithInvalid === 1 ? '' : 's'}`
    );
  }
  if (quality?.missing > 0) {
    parts.push(
      `${quality.missing} missing value${quality.missing === 1 ? '' : 's'} in ${quality.rowsWithMissing} row${quality.rowsWithMissing === 1 ? '' : 's'}`
    );
  }
  if (hasParse) {
    parts.push(`${parseErrors.length} malformed CSV row${parseErrors.length === 1 ? '' : 's'}`);
  }

  return (
    <div className="quality-banner">
      <div className="qb-head">
        <span className="qb-icon">⚠</span>
        <span className="qb-summary">
          <strong>Data quality:</strong> {parts.join(' · ')}. These cells are excluded from the
          charts (each bar’s <em>n</em> counts only valid responses).
        </span>
        <button className="qb-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Details'}
        </button>
        <button className="qb-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
          ×
        </button>
      </div>

      {open && (
        <div className="qb-details">
          {quality && (
            <div className="qb-block">
              <div className="qb-stat">
                <span className="qb-num">{quality.cleanRows}</span> of {quality.totalRows} rows are
                fully complete &amp; valid
              </div>
              {quality.invalidExamples.length > 0 && (
                <div className="qb-examples">
                  <span className="qb-label">Invalid (out of 1–{quality.points ?? 'N'} range):</span>
                  {quality.invalidExamples.map((e, i) => (
                    <code key={i}>
                      row {e.row} · {e.col} = “{e.value}”
                    </code>
                  ))}
                  {quality.invalid > quality.invalidExamples.length && (
                    <span className="muted small">…and more</span>
                  )}
                </div>
              )}
              {quality.missingExamples.length > 0 && (
                <div className="qb-examples">
                  <span className="qb-label">Missing (blank):</span>
                  {quality.missingExamples.map((e, i) => (
                    <code key={i}>
                      row {e.row} · {e.col}
                    </code>
                  ))}
                  {quality.missing > quality.missingExamples.length && (
                    <span className="muted small">…and more</span>
                  )}
                </div>
              )}
            </div>
          )}
          {hasParse && (
            <div className="qb-block">
              <span className="qb-label">CSV parsing:</span>
              {parseErrors.slice(0, 5).map((e, i) => (
                <code key={i}>
                  {e.row ? `row ${e.row}: ` : ''}
                  {e.message}
                </code>
              ))}
              {parseErrors.length > 5 && <span className="muted small">…and more</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
