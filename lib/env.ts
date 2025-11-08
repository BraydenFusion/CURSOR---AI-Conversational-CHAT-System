const requiredEnvVars = [
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "SENDGRID_API_KEY",
  "STRIPE_SECRET_KEY"
] as const;

type RequiredEnvVar = (typeof requiredEnvVars)[number];

function getEnvVar(key: RequiredEnvVar) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  openaiApiKey: getEnvVar("OPENAI_API_KEY"),
  databaseUrl: getEnvVar("DATABASE_URL"),
  twilioAccountSid: getEnvVar("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: getEnvVar("TWILIO_AUTH_TOKEN"),
  sendgridApiKey: getEnvVar("SENDGRID_API_KEY"),
  stripeSecretKey: getEnvVar("STRIPE_SECRET_KEY")
};

