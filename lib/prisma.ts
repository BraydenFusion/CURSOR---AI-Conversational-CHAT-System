import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    },
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"]
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

process.on("beforeExit", async () => {
  console.log("🔌 Disconnecting Prisma client...");
  await prisma.$disconnect();
});

prisma
  .$connect()
  .then(() => {
    console.log("✅ Database connected successfully");
  })
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  });

