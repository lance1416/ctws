/** The same connection URI pointed at another database on the same server. */
export function databaseUrl(connectionString: string, database: string): string {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}
