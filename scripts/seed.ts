async function seed() {
  // noop
}

// Run the seed function
seed().catch((error) => {
  console.error("❌ Seed script failed:", error);
  process.exit(1);
});
