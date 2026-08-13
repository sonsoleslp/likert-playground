import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `base` must match how GitHub Pages serves the site:
//   - Project page  https://<user>.github.io/likert-playground/  -> '/likert-playground/'
//   - User/org page https://<user>.github.io/  or a custom domain -> '/'
// Change REPO_NAME (or set base to '/') if you rename the repo.
const REPO_NAME = 'likert-playground'

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  build: {
    // GitHub Pages can serve from the /docs folder on the default branch.
    outDir: 'docs',
    emptyOutDir: true,
  },
})
