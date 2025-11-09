import Redis from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is not set");
}

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    console.error("❌ Redis connection error:", err.message);
    const targetErrors = ["READONLY", "ECONNREFUSED", "ETIMEDOUT"];
    return targetErrors.some((targetError) => err.message.includes(targetError));
  }
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (error) => {
  console.error("❌ Redis error:", error);
});

redis.on("ready", () => {
  console.log("✅ Redis ready to accept commands");
});

redis.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

process.on("SIGTERM", async () => {
  console.log("🔌 Disconnecting Redis...");
  await redis.quit();
});

export default redis;

export async function getSession(token: string): Promise<any | null> {
  try {
    const data = await redis.get(`session:${token}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("❌ Error getting session:", error);
    return null;
  }
}

export async function setSession(
  token: string,
  data: unknown,
  ttl: number = 3600
): Promise<boolean> {
  try {
    await redis.setex(`session:${token}`, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("❌ Error setting session:", error);
    return false;
  }
}

export async function deleteSession(token: string): Promise<boolean> {
  try {
    await redis.del(`session:${token}`);
    return true;
  } catch (error) {
    console.error("❌ Error deleting session:", error);
    return false;
  }
}

