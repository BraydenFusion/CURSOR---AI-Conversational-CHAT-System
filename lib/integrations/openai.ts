import { env } from "@/lib/env";

export function getOpenAIHeaders() {
  return {
    Authorization: `Bearer ${env.openaiApiKey}`,
    "Content-Type": "application/json"
  };
}

