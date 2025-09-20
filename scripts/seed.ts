import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { podTemplates } from "../src/lib/db/schema";

// Database connection for seeding
const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/pinacle";

const client = postgres(connectionString);
const db = drizzle(client);

const seedTemplates = [
  {
    name: "Next.js Development",
    description: "Full-stack React development with Next.js, TypeScript, and Tailwind CSS",
    image: "pinacle/nextjs:latest",
    defaultPorts: JSON.stringify([
      { internal: 3000, external: 3000, name: "Next.js Dev Server" },
      { internal: 3001, external: 3001, name: "Next.js Preview" }
    ]),
    defaultEnv: JSON.stringify({
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1"
    }),
    category: "nextjs",
    isActive: true,
  },
  {
    name: "Mastra AI Agent",
    description: "Build AI agents with Mastra framework, Python, and FastAPI",
    image: "pinacle/mastra:latest",
    defaultPorts: JSON.stringify([
      { internal: 8000, external: 8000, name: "FastAPI Server" },
      { internal: 8001, external: 8001, name: "Mastra Dashboard" }
    ]),
    defaultEnv: JSON.stringify({
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace"
    }),
    category: "mastra",
    isActive: true,
  },
  {
    name: "Custom Ubuntu",
    description: "Clean Ubuntu 22.04 environment with development tools",
    image: "pinacle/ubuntu:latest",
    defaultPorts: JSON.stringify([
      { internal: 8080, external: 8080, name: "HTTP Server" }
    ]),
    defaultEnv: JSON.stringify({
      DEBIAN_FRONTEND: "noninteractive"
    }),
    category: "custom",
    isActive: true,
  },
  {
    name: "Python Data Science",
    description: "Python environment with Jupyter, pandas, numpy, and scikit-learn",
    image: "pinacle/datascience:latest",
    defaultPorts: JSON.stringify([
      { internal: 8888, external: 8888, name: "Jupyter Lab" },
      { internal: 6006, external: 6006, name: "TensorBoard" }
    ]),
    defaultEnv: JSON.stringify({
      JUPYTER_ENABLE_LAB: "yes",
      PYTHONPATH: "/workspace"
    }),
    category: "datascience",
    isActive: true,
  },
  {
    name: "Node.js Backend",
    description: "Node.js backend development with Express, TypeScript, and common tools",
    image: "pinacle/nodejs:latest",
    defaultPorts: JSON.stringify([
      { internal: 3000, external: 3000, name: "Express Server" },
      { internal: 5432, external: 5432, name: "PostgreSQL" }
    ]),
    defaultEnv: JSON.stringify({
      NODE_ENV: "development",
      PORT: "3000"
    }),
    category: "nodejs",
    isActive: true,
  },
];

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Insert pod templates
    console.log("📦 Creating pod templates...");
    await db.insert(podTemplates).values(seedTemplates);
    console.log(`✅ Created ${seedTemplates.length} pod templates`);

    console.log("🎉 Database seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the seed function
seed().catch((error) => {
  console.error("❌ Seed script failed:", error);
  process.exit(1);
});
