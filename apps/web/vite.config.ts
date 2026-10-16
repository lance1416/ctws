import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * @fontsource and KaTeX list `.woff` (and KaTeX `.ttf`) fallbacks after each `.woff2`. Every
 * browser that runs this app takes the woff2, so the fallbacks are stripped before `vite:css`
 * sees the `url()` (`enforce: 'pre'`) and are never emitted into `dist/assets`. Both quote styles:
 * @fontsource writes `format('woff')`, KaTeX `format("woff")`.
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
  // strictPort: fail loudly instead of drifting to a port other tooling does not expect.
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development too: the browser only talks to Vite, which forwards /api.
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Keep vitest away from the Playwright specs in e2e/.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
