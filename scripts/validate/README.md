# Numerical validation against R

Cross-checks the in-browser network implementation (`src/lib/network.js`)
against R's canonical psychometric packages on the bundled TAM dataset.

## Run

```bash
node scripts/validate/export_matrices.mjs      # writes out/*.csv from the JS code
Rscript scripts/validate/validate.R            # compares against R
```

R prerequisites: `install.packages(c("qgraph", "psych", "lavaan"))`.

## What it checks

| # | Quantity | R reference | Agreement |
|---|----------|-------------|-----------|
| 1 | Pearson correlation matrix | `stats::cor` | ~5e-9 |
| 2 | Polychoric correlation matrix | `qgraph::cor_auto` (lavaan) | ~5e-8 |
| 3 | EBICglasso partial correlations (Pearson) | `qgraph::EBICglasso` | ~2e-5, identical λ + edge set |
| 4 | EBICglasso partial correlations (polychoric) | `qgraph::EBICglasso(cor_auto(...))` | ~4e-5, identical λ + edge set |

The residuals on 3–4 are graphical-lasso convergence tolerance; the selected
penalty λ and the exact set of nonzero edges match `qgraph` exactly.

Implementation notes that make this match:
- Polychoric uses a high-accuracy `erfc` (Chebyshev, ~1e-15) and a 32-point
  Gauss–Legendre bivariate-normal CDF, two-step ML with thresholds from the
  marginals — matching lavaan's `cor_auto`.
- The graphical lasso uses `penalize.diagonal = FALSE` and a 100-point λ path
  down to `0.01 · λmax`, matching `qgraph::EBICglasso` defaults.
