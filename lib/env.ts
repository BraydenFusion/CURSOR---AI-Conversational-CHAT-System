import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  DEALERSOCKET_CLIENT_ID: z.string().optional(),
  DEALERSOCKET_CLIENT_SECRET: z.string().optional(),
  DEALERSOCKET_API_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email().optional()
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
  console.log("✅ Environment variables validated");
} catch (error) {
  console.error("❌ Environment validation failed:");
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join(".")}: ${err.message}`);
    });
  }
  throw new Error("Invalid environment variables");
}

export { env };

