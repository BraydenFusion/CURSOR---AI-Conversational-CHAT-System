import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
      redis: "unknown",
      openai: "unknown"
    },
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.services.database = "healthy";
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    checks.services.database = "unhealthy";
    checks.status = "degraded";
  }

  try {
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000
    });

    await redis.ping();
    checks.services.redis = "healthy";
    await redis.quit();
  } catch (error) {
    console.error("❌ Redis health check failed:", error);
    checks.services.redis = "unhealthy";
    checks.status = "degraded";
  }

  try {
    if (process.env.OPENAI_API_KEY) {
      checks.services.openai = "configured";
    } else {
      checks.services.openai = "not_configured";
      checks.status = "degraded";
    }
  } catch (error) {
    console.error("❌ OpenAI check failed:", error);
    checks.services.openai = "error";
  }

  const statusCode = checks.status === "healthy" ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}

