import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * @fontsource's stylesheets list a legacy `.woff` after each `.woff2`. Every browser that can run
 * this app has supported woff2 since 2016, so that fallback is never requested -- but Vite still
 * copies all three files into `dist/assets`, which shipped 69,896 B of bytes nobody fetches inside
 * the image. Strip the fallback before Vite's CSS plugin sees the `url()`, so the asset is never
 * emitted at all. `enforce: 'pre'` is what puts this ahead of `vite:css`.
 */
const dropLegacyWoff = {
  name: 'ctws:drop-legacy-woff',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('@fontsource') || !id.includes('.css')) return null
    const out = code.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '')
    return out === code ? null : { code: out, map: null }
  },
}

export default defineConfig({
  plugins: [dropLegacyWoff, react(), tailwindcss()],
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
