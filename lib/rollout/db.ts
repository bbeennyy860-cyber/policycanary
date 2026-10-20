import { getDatabase } from "@netlify/database";

/** The small boundary also makes transaction behavior testable without a server. */
export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

let database: ReturnType<typeof getDatabase> | undefined;
function pool() {
  database ??= getDatabase();
  return database.pool;
}

export async function transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
