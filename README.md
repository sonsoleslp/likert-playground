# Likert Playground

A 100% client-side (Vite + React) web app for visualizing Likert-scale survey
data as **diverging stacked bar charts**. Upload a CSV, map your Likert items
and subscales, pick a grouping variable, and plot — nothing leaves the browser.

## Features

- **Upload CSV** (drag-and-drop or browse). Rows = respondents, columns = items.
- **Automatic detection** of Likert columns and the number of scale points.
- **Configure everything**: scale points & category labels, which columns are
  Likert items, subscale (group-of-items) definitions, and a grouping column.
- **Two plot units**: individual items, or subscales (responses pooled across a
  subscale's items).
- **Grouping / small multiples**: split each item/subscale by a categorical
  column (e.g. condition, gender), rendered as labeled sub-bars.
- **Diverging stacked bars** centered on the neutral category, with a shared
  symmetric axis, per-bar `n`, `%` labels, a color legend, and a cursor-tracking
  tooltip.
- **Data-quality warnings**: on upload, missing (blank) cells, invalid /
  out-of-range values, and malformed CSV rows are detected and summarized. These
  cells are excluded from the charts (each bar's `n` counts only valid
  responses).
- **Export** the current chart as **PNG** (2× raster) or **SVG** (vector).

## Example datasets

Pick one from the loader — each has an **ⓘ** button explaining the study,
license, and source.

- **TAM — e-book readers (real data)** — a genuinely published Technology
  Acceptance Model study (Richter et al., *Data in Brief* 48, 2023, 109190),
  N=174, 5-point scale, licensed **CC BY 4.0**. Subscales: Perceived Usefulness,
  Compatibility, Ease of Use, Emotional Value, Adoption Intention. Grouping by
  e-reader ownership, gender, age group, or education (decoded from the dataset
  codebook). Source: https://data.mendeley.com/datasets/pd5dp3phx2
- **MSLQ (motivation)** — *synthetic* demo data modeled on the Motivated
  Strategies for Learning Questionnaire (6 motivation subscales, 7-point).
- **TAM (technology acceptance)** — *synthetic* demo data for the classic TAM
  four-subscale model (7-point).

The synthetic datasets are generated deterministically with a seeded PRNG (see
`src/data/generate.js`) so they're stable across reloads; they are clearly
labeled "Synthetic" and are for illustration only.

## Run

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build to docs/ (for GitHub Pages)
npm run preview  # preview the production build
```

## Deploy to GitHub Pages

This repo is configured to publish from the **`docs/` folder**:

- `vite.config.js` sets `build.outDir: 'docs'` and `base: '/likert-playground/'`
  (change `REPO_NAME` there if you rename the repo, or set `base` to `'/'` for a
  user/org page or custom domain).
- `npm run build` regenerates `docs/`. A `docs/.nojekyll` file is included so
  GitHub Pages serves Vite's asset filenames unmodified.

Steps:

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: “Deploy from a branch”**,
   branch `main`, folder **`/docs`**, then Save.
3. The site goes live at `https://<user>.github.io/likert-playground/`.
4. After any change, re-run `npm run build` and commit the updated `docs/`.

## Project layout

```
src/
  lib/
    likert.js        aggregation, diverging-bar geometry, quality analysis
    colors.js        diverging color palette
    exportImage.js   SVG / PNG export
  data/
    generate.js      seeded synthetic-data generator
    mslq.js, tam.js  synthetic example datasets
    tam_real.js      bundled real TAM dataset (auto-generated, CC BY 4.0)
    index.js         dataset registry + upload-state mapping
  components/
    DataLoader.jsx   upload + example picker + dataset-info modal
    ConfigPanel.jsx  scale / columns / subscales / grouping config
    LikertChart.jsx  the SVG diverging stacked bar chart + export + tooltip
    Legend.jsx       color legend
    QualityWarning.jsx  data-quality banner
  App.jsx            top-level state & layout
```

## CSV format

- First row is a header of column names.
- Likert responses are integer codes (e.g. `1`–`5` or `1`–`7`).
- Any non-Likert column (id, demographics, condition, …) can be used as the
  grouping variable.
- Blank cells and out-of-range values are tolerated and reported, not fatal.
