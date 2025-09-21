import { z } from "zod";

const server = z.object({
  DATABASE_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
});

const client = z.object({
  // Add client-side environment variables here
});

const processEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITHUB_APP_ID: process.env.GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
};

const merged = server.merge(client);
type Env = z.infer<typeof merged>;

let env: Env;

if (typeof window === "undefined") {
  // Only validate in runtime, not at build time
  if (process.env.NODE_ENV !== "development" && process.env.DATABASE_URL && process.env.NEXTAUTH_SECRET) {
    env = merged.parse(processEnv);
  } else {
    env = processEnv as Env;
  }
} else {
  env = merged.parse({});
}

export { env };
