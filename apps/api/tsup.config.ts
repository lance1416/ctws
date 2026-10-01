import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  outDir: 'dist',
  // @ctws/contracts is shipped as TypeScript source with extensionless imports, which
  // plain Node cannot load at runtime, so bundle it instead of leaving it external.
  noExternal: ['@ctws/contracts'],
})
