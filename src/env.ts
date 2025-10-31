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
  SERVER_API_KEY: z.string().min(1).optional(),
  SSH_PRIVATE_KEY: z.string().min(1).optional(),
  SSH_PUBLIC_KEY: z.string().min(1).optional(),
  ADMIN_EMAILS: z.string().min(1).optional(),

  // Snapshot storage configuration
  SNAPSHOT_STORAGE_TYPE: z.enum(["filesystem", "s3"]).default("filesystem"),
  SNAPSHOT_STORAGE_PATH: z.string().default("/var/lib/pinacle/snapshots"), // For filesystem storage
  SNAPSHOT_S3_ENDPOINT: z.string().optional(), // For MinIO/S3 (e.g. http://localhost:9000)
  SNAPSHOT_S3_ACCESS_KEY: z.string().optional(),
  SNAPSHOT_S3_SECRET_KEY: z.string().optional(),
  SNAPSHOT_S3_BUCKET: z.string().default("pinacle-snapshots"),
  SNAPSHOT_S3_REGION: z.string().default("us-east-1"),
  SNAPSHOT_MAX_SIZE_GB: z.coerce.number().default(10), // Max snapshot size in GB

  // Stripe configuration
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(), // Already used but not in schema
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
  SERVER_API_KEY: process.env.SERVER_API_KEY,
  SSH_PRIVATE_KEY: process.env.SSH_PRIVATE_KEY,
  SSH_PUBLIC_KEY: process.env.SSH_PUBLIC_KEY,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  SNAPSHOT_STORAGE_TYPE: process.env.SNAPSHOT_STORAGE_TYPE,
  SNAPSHOT_STORAGE_PATH: process.env.SNAPSHOT_STORAGE_PATH,
  SNAPSHOT_S3_ENDPOINT: process.env.SNAPSHOT_S3_ENDPOINT,
  SNAPSHOT_S3_ACCESS_KEY: process.env.SNAPSHOT_S3_ACCESS_KEY,
  SNAPSHOT_S3_SECRET_KEY: process.env.SNAPSHOT_S3_SECRET_KEY,
  SNAPSHOT_S3_BUCKET: process.env.SNAPSHOT_S3_BUCKET,
  SNAPSHOT_S3_REGION: process.env.SNAPSHOT_S3_REGION,
  SNAPSHOT_MAX_SIZE_GB: process.env.SNAPSHOT_MAX_SIZE_GB,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

const merged = server.merge(client);
type Env = z.infer<typeof merged>;

let env: Env;

if (typeof window === "undefined") {
  // Only validate in runtime, not at build time
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.DATABASE_URL &&
    process.env.NEXTAUTH_SECRET
  ) {
    env = merged.parse(processEnv);
  } else {
    env = processEnv as unknown as Env;
  }
} else {
  env = merged.parse({});
}

export { env };
