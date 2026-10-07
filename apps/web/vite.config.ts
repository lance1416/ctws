import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * @fontsource's stylesheets list a legacy `.woff` after each `.woff2`, and KaTeX's lists a `.woff`
 * AND a `.ttf`. Every browser that can run this app has supported woff2 since 2016, so those
 * fallbacks are never requested -- but Vite still copies every file into `dist/assets`, which
 * shipped 69,896 B of dead bytes for @fontsource and another ~700 KB once KaTeX's twenty faces
 * joined it. Strip the fallbacks before Vite's CSS plugin sees the `url()`, so the assets are never
 * emitted at all. `enforce: 'pre'` is what puts this ahead of `vite:css`.
 *
 * Both quote styles, because the two stylesheets disagree: @fontsource writes `format('woff')` and
 * KaTeX writes `format("woff")`.
 */
const dropLegacyFontFormats = {
  name: 'ctws:drop-legacy-font-formats',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!/@fontsource|katex/.test(id) || !id.includes('.css')) return null
    const out = code.replace(
      /,\s*url\([^)]+\.(?:woff|ttf)\)\s*format\(['"](?:woff|truetype)['"]\)/g,
      '',
    )
    return out === code ? null : { code: out, map: null }
  },
}

export default defineConfig({
  plugins: [dropLegacyFontFormats, react(), tailwindcss()],
  // Read VITE_* variables from the repo-root .env, the single env file of the project.
  envDir: '../..',
  // strictPort: fail loudly instead of drifting to a port other tooling does not expect.
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development too: the browser only talks to Vite, which forwards /api to the
    // API. Matches the deployed topology (the API serves the built app), so no CORS in dev.
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Keep vitest away from the Playwright specs in e2e/.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
