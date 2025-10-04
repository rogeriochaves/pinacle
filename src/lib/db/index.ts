import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(
  process.env.DATABASE_URL || "postgresql://localhost:5432/pinacle",
);

// Format any Drizzle/PG error into a readable message
export function formatDrizzleError(err: Error): string {
  console.log("err", err);
  if (!err || typeof err !== "object") {
    return "An unknown database error occurred.";
  }

  // biome-ignore lint/suspicious/noExplicitAny: nah
  const pgError = extractOriginalPgError(err) as any;

  const code = pgError?.code;
  const detail = pgError?.detail ?? "";
  const constraint = pgError?.constraint ?? "";
  const column = pgError?.column ?? "";
  const rawMsg = pgError?.message ?? "";

  switch (code) {
    case "23505": // unique_violation
      return `Duplicate value error: ${parseConstraint(constraint) || detail || "a unique field already exists."}`;

    case "23503": // foreign_key_violation
      return `Foreign key violation: ${parseConstraint(constraint) || detail || "referenced record not found."}`;

    case "23502": // not_null_violation
      return `Missing required field: ${column || parseColumnFromMessage(rawMsg) || "a required field was missing."}`;

    case "22P02": // invalid_text_representation
      return `Invalid data format: ${detail || "Check input types and formats."}`;

    default:
      return `Database error${code ? ` [${code}]` : ""}: ${stripQuery(rawMsg) || "Unexpected database error."}`;
  }
}

// Extracts underlying PG error from Drizzle's wrapped error
function extractOriginalPgError(err: Error): Error | object {
  if (err?.cause && typeof err.cause === "object") return err.cause as object;
  return err;
}

// Dynamically parse constraint name into human-readable message
function parseConstraint(constraint: string): string {
  if (!constraint) return "A database constraint was violated.";

  const fieldMatch = constraint.match(/_(\w+?)(?:_key|_idx|_fkey)?$/);
  const field = fieldMatch?.[1];
  const prettyField = field ? toTitleCase(field.replace(/_/g, " ")) : null;

  if (constraint.includes("_key"))
    return `${prettyField ?? constraint} must be unique.`;
  if (constraint.includes("_fkey"))
    return `${prettyField ?? constraint} must reference a valid record.`;

  return `Constraint violation on ${prettyField ?? constraint}.`;
}

// Converts snake_case to Title Case
function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Parses column name from a NOT NULL violation message
function parseColumnFromMessage(msg: string): string | null {
  const match = msg.match(/null value in column "(.*?)"/);
  return match ? match[1] : null;
}

// Clean up noisy raw SQL messages
function stripQuery(msg: string): string {
  if (!msg) return "";
  return msg
    .split("\n")[0] // Only keep the first line
    .replace(/^Failed query:\s*/, "")
    .trim();
}

// Wrap a thenable/builder so awaiting it rethrows a nicer error.
// Also re-wraps any *further* builders returned by chain methods.
function wrapBuilder<T>(builder: T, format = formatDrizzleError): T {
  if (!builder || typeof builder !== "object") return builder;

  return new Proxy(builder as any, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);

      // Intercept awaiting (`await qb`) by patching the thenable
      if (prop === "then" && typeof val === "function") {
        const origThen = val.bind(target);
        return (onFulfilled?: any, onRejected?: any) =>
          origThen(
            onFulfilled,
            (e: any) => {
              const msg = format(e);
              const wrapped = new Error(msg, { cause: e });
              if (e?.cause?.code) (wrapped as any).code = e.cause.code; // keep pg code if present
              return onRejected ? onRejected(wrapped) : Promise.reject(wrapped);
            },
          );
      }

      // Many builder methods return *another* builder/thenable; re-wrap those.
      // Cover common insert-chain methods explicitly; fall back to wrapping any function result.
      if (typeof val === "function") {
        const method = String(prop);
        const shouldWrap =
          method === "values" ||
          method === "returning" ||
          method === "onConflictDoUpdate" ||
          method === "onConflictDoNothing" ||
          method === "prepare" ||
          method === "execute" || // (sqlite/other dialects)
          method === "run" ||     // (sqlite)
          method === "all" ||     // (sqlite)
          method === "get";       // (sqlite)

        return (...args: any[]) => {
          const res = val.apply(target, args);
          return shouldWrap ? wrapBuilder(res, format) : res;
        };
      }

      return val;
    },
  }) as T;
}

// Patch ONLY .insert on a drizzle db instance
export function improveInsertErrors<TDb extends { insert: (...a: any[]) => any }>(
  db: TDb,
  format = formatDrizzleError,
): TDb {
  const origInsert = (db as any).insert.bind(db);

  return new Proxy(db as any, {
    get(target, prop, receiver) {
      if (prop === "insert") {
        return (...args: any[]) => {
          const builder = origInsert(...args);
          return wrapBuilder(builder, format);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TDb;
}

export const db = improveInsertErrors(drizzle(client, { schema }));
