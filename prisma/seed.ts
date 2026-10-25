import "dotenv/config";
import { seedSamples } from "../src/lib/seed";
import { prisma } from "../src/lib/prisma";

seedSamples(console.log)
  .then((n) => console.log(`seeded ${n} new sample model(s)`))
  .finally(() => prisma.$disconnect());
