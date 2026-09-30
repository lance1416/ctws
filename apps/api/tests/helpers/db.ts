import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { closeDb, createDb } from '../../src/db/client'
import { runMigrations } from '../../src/db/migrate'

export async function withDatabase() {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const connectionString = container.getConnectionUri()
  await runMigrations(connectionString)
  const db = createDb(connectionString)
  return {
    connectionString,
    db,
    stop: async () => {
      await closeDb(db)
      await container.stop()
    },
  }
}
