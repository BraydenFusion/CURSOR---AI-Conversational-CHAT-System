import { env } from "@/lib/env";

export function getOpenAIHeaders() {
  return {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  };
}

