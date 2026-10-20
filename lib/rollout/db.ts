import { getDatabase } from "@netlify/database";

/** The small boundary also makes transaction behavior testable without a server. */
export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export class DatabaseUnavailable extends Error {
  constructor(message = "Database unavailable") { super(message); this.name = "DatabaseUnavailable"; }
}

let database: ReturnType<typeof getDatabase> | undefined;
function pool() {
  try {
    database ??= getDatabase();
    return database.pool;
  } catch {
    throw new DatabaseUnavailable("Database unavailable: no Netlify Database connection configured");
  }
}

export async function transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  let client: Awaited<ReturnType<ReturnType<typeof pool>["connect"]>>;
  try {
    client = await pool().connect();
  } catch (error) {
    if (error instanceof DatabaseUnavailable) throw error;
    throw new DatabaseUnavailable("Database unavailable: connection failed");
  }
  try {
    await client.query("BEGIN");
    const result = await work(client as unknown as Queryable);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await transaction(db => db.query("SELECT 1"));
    return true;
  } catch {
    return false;
  }
}
