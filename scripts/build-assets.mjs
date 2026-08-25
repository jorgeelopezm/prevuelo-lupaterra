#!/usr/bin/env node
/**
 * Asset build: compiles the Tailwind v4 stylesheet and copies the htmx runtime
 * into `dist/assets`. Run before serving (npm run assets:build); dev serves
 * the same built files, so a rebuild is only needed after template/theme edits.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootUrl = new URL('..', import.meta.url)
const root = fileURLToPath(rootUrl)
const distAssets = fileURLToPath(new URL('dist/assets/', rootUrl))
mkdirSync(distAssets, { recursive: true })

execSync(
  'npx tailwindcss -i src/assets/app.css -o dist/assets/app.css --minify ' +
    '--content "src/**/*.{njk,ts}" "src/assets/*.css"',
  { stdio: 'inherit', cwd: root },
)

copyFileSync(
  fileURLToPath(new URL('node_modules/htmx.org/dist/htmx.min.js', rootUrl)),
  fileURLToPath(new URL('dist/assets/htmx.min.js', rootUrl)),
)
console.log('assets built → dist/assets/{app.css,htmx.min.js}')
