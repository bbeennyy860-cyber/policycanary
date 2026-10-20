import { readFile } from "node:fs/promises";
import { z } from "zod";

const arm = z.object({
  name: z.string().min(1),
  success: z.union([z.literal(0), z.literal(1)]),
  progress: z.number().min(0).max(1).nullable(),
  duration: z.number().int().nonnegative().nullable(),
});
const snapshot = z.array(z.object({
  id: z.uuid(), t: z.iso.datetime(), site: z.string().min(1),
  instr: z.string(), notes: z.string().nullable(),
  policies: z.record(z.string(), arm),
}));
export type SeedSession = z.infer<typeof snapshot>[number];

export async function readSnapshot(): Promise<SeedSession[]> {
  return snapshot.parse(JSON.parse(await readFile("data/roboarena_sessions.json", "utf8")));
}

// E strings escape both backslashes and quotes independently of server settings.
export function sqlText(value: string): string {
  if (value.includes("\0")) throw new Error("Postgres text cannot contain NUL");
  return "E'" + value.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

function inserts(table: string, columns: string, rows: string[]): string[] {
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += 250) {
    statements.push(`INSERT INTO ${table} (${columns}) VALUES\n${rows.slice(i, i + 250).join(",\n")}\nON CONFLICT DO NOTHING;`);
  }
  return statements;
}

export function seedStatements(data: SeedSession[]): string[] {
  const names = [...new Set(data.flatMap(s => Object.values(s.policies).map(a => a.name)))].sort();
  const siteNames = [...new Set(data.map(s => s.site))].sort();
  return [
    ...inserts("policies", "name", names.map(n => `(${sqlText(n)})`)),
    ...inserts("sites", "name", siteNames.map(n => `(${sqlText(n)})`)),
    ...inserts("sessions", "id, occurred_at, site_id, instruction, notes", data.map(s =>
      `(${sqlText(s.id)}, ${sqlText(s.t)}, (SELECT id FROM sites WHERE name = ${sqlText(s.site)}), ${sqlText(s.instr)}, ${sqlText(s.notes ?? "")})`)),
    ...inserts("trials", "session_id, policy_id, success, progress, duration_s", data.flatMap(s =>
      Object.values(s.policies).filter(a => a.progress !== null).map(a =>
        `(${sqlText(s.id)}, (SELECT id FROM policies WHERE name = ${sqlText(a.name)}), ${a.success}, ${a.progress}, ${a.duration ?? "NULL"})`))),
  ];
}
