import { getDatabase } from "@netlify/database";
import { readSnapshot, seedStatements } from "../db/seed-data";

async function main(): Promise<void> {
  const statements = seedStatements(await readSnapshot());
  const { pool } = getDatabase();
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const statement of statements) await client.query(statement);
      const result = await client.query(`SELECT
        (SELECT count(*)::int FROM sessions) AS sessions,
        (SELECT count(*)::int FROM trials) AS trials,
        (SELECT count(*)::int FROM policies) AS policies,
        (SELECT count(*)::int FROM sites) AS sites`);
      await client.query("COMMIT");
      console.log(JSON.stringify(result.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Seed failed. Run with the Netlify Database environment and apply schema migrations first."); process.exitCode = 1; });
