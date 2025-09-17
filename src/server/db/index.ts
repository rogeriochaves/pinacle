import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";
import * as schema from "@/server/db/schema";

declare const globalThis: typeof global & {
  __db__?: ReturnType<typeof drizzle>;
  __dbPool__?: Pool;
};

const createPool = () => {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to your environment before starting the app.");
  }

  return new Pool({ connectionString: env.DATABASE_URL, max: 10 });
};

const pool = globalThis.__dbPool__ ?? createPool();
export const db = globalThis.__db__ ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbPool__ = pool;
  globalThis.__db__ = db;
}
