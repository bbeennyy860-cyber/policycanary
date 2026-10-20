import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema";

function makeDb() {
  return drizzle({ schema });
}

/** Lazily constructed so builds and DB-less environments never connect at import time. */
let instance: ReturnType<typeof makeDb> | undefined;
export function getDb(): ReturnType<typeof makeDb> {
  instance ??= makeDb();
  return instance;
}
