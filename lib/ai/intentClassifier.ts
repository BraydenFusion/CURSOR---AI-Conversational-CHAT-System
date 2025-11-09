import OpenAI from "openai";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

const functionDefinition = [
  {
    name: "classify_intent",
    description:
      "Classify the intent of a user's message and extract relevant entities for automotive dealership conversations.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "GREETING",
            "INVENTORY_SEARCH",
            "VEHICLE_DETAILS",
            "PRICING",
            "AVAILABILITY",
            "TEST_DRIVE_REQUEST",
            "CONTACT_REQUEST",
            "HOURS_LOCATION",
            "FINANCING",
            "TRADE_IN",
            "UNKNOWN"
          ]
        },
        confidence: {
          type: "number",
          description: "Confidence score from 0 to 1."
        },
        entities: {
          type: "object",
          properties: {
            vehicle: {
              type: "object",
              properties: {
                make: { type: "string", nullable: true },
                model: { type: "string", nullable: true },
                year: { type: "string", nullable: true }
              }
            },
            priceRange: {
              type: "object",
              properties: {
                min: { type: "number", nullable: true },
                max: { type: "number", nullable: true }
              }
            },
            bodyType: { type: "string", nullable: true },
            condition: { type: "string", enum: ["NEW", "USED"], nullable: true }
          }
        }
      },
      required: ["intent", "confidence", "entities"]
    }
  }
] satisfies Array<OpenAI.Chat.Completions.ChatCompletionTool>;

export interface IntentClassificationEntities {
  vehicle?: {
    make?: string | null;
    model?: string | null;
    year?: string | null;
  };
  priceRange?: {
    min?: number | null;
    max?: number | null;
  };
  bodyType?: string | null;
  condition?: "NEW" | "USED" | null;
}

export interface IntentClassificationResult {
  intent: (typeof functionDefinition[0]["parameters"]["properties"]["intent"]["enum"])[number];
  entities: IntentClassificationEntities;
  confidence: number;
}

export async function classifyIntent(
  message: string,
  dealershipName?: string
): Promise<IntentClassificationResult> {
  const prompt = `
You are an intent classifier for a car dealership assistant${dealershipName ? ` representing ${dealershipName}` : ""}.
Analyze the customer message and determine the intent from the provided list.
Extract relevant entities such as vehicle details, price range, body type, and condition.
If no clear intent is found, return UNKNOWN with confidence 0.2.
Ensure confidence is between 0 and 1.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: message }
      ],
      tools: functionDefinition,
      tool_choice: { type: "function", function: { name: "classify_intent" } }
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      logger.warn("Intent classifier returned no function call arguments.");
      return fallbackResult();
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return {
      intent: parsed.intent ?? "UNKNOWN",
      confidence: clampConfidence(parsed.confidence),
      entities: sanitizeEntities(parsed.entities)
    };
  } catch (error) {
    logger.error("Intent classification failed", error as Error);
    return fallbackResult();
  }
}

function sanitizeEntities(entities: IntentClassificationEntities | undefined) {
  if (!entities) {
    return {};
  }

  const safeEntities: IntentClassificationEntities = {};

  if (entities.vehicle) {
    safeEntities.vehicle = {
      make: entities.vehicle.make ?? null,
      model: entities.vehicle.model ?? null,
      year: entities.vehicle.year ?? null
    };
  }

  if (entities.priceRange) {
    safeEntities.priceRange = {
      min: toNumberOrNull(entities.priceRange.min),
      max: toNumberOrNull(entities.priceRange.max)
    };
  }

  if (entities.bodyType) {
    safeEntities.bodyType = String(entities.bodyType);
  }

  if (entities.condition) {
    safeEntities.condition =
      entities.condition.toUpperCase() === "NEW"
        ? "NEW"
        : entities.condition.toUpperCase() === "USED"
        ? "USED"
        : null;
  }

  return safeEntities;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.2;
  return Math.min(Math.max(num, 0), 1);
}

function fallbackResult(): IntentClassificationResult {
  return {
    intent: "UNKNOWN",
    confidence: 0.2,
    entities: {}
  };
}

