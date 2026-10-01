import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  outDir: 'dist',
  // @ctws/contracts and @ctws/core are shipped as TypeScript source with extensionless
  // imports, which plain Node cannot load at runtime, so bundle them instead of leaving
  // them external.
  noExternal: ['@ctws/contracts', '@ctws/core'],
})
