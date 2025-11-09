import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Message, Lead } from "@prisma/client";
import { IntentClassificationResult } from "./intentClassifier";

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface BuildContextOptions {
  sessionId: string;
  intent?: IntentClassificationResult["intent"];
  intentConfidence?: number;
  entities?: IntentClassificationResult["entities"];
}

const INTENT_CONTEXT: Partial<Record<IntentClassificationResult["intent"], string>> = {
  GREETING: "The user is greeting you. Respond warmly and offer assistance.",
  INVENTORY_SEARCH:
    "The user wants to explore inventory. Ask clarifying questions about make, model, year, budget, or features.",
  VEHICLE_DETAILS:
    "The user wants specifics about a particular vehicle. Provide detailed information from real inventory if available.",
  PRICING:
    "The user is asking about pricing. Share current pricing, promotions, or financing options based on available data.",
  AVAILABILITY:
    "The user wants to know if a vehicle is available. Confirm real availability or offer alternatives.",
  TEST_DRIVE_REQUEST:
    "The user wants to schedule a test drive. Gather preferred date/time and contact details, then confirm availability.",
  CONTACT_REQUEST:
    "The user wants to be contacted. Gather their preferred contact method and make sure the sales team is notified.",
  HOURS_LOCATION:
    "The user wants store hours or location. Provide accurate address, hours, and directions if available.",
  FINANCING:
    "The user is asking about financing. Explain financing options, credit requirements, and next steps.",
  TRADE_IN:
    "The user wants to trade in a vehicle. Ask for vehicle details (year, make, model, mileage) and explain appraisal steps."
};

const MAX_CONTEXT_TOKENS = 4000;

export async function buildConversationContext({
  sessionId,
  intent,
  intentConfidence,
  entities
}: BuildContextOptions): Promise<OpenAIMessage[]> {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        dealership: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10
        },
        leads: {
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!session) {
      throw new Error(`ChatSession ${sessionId} not found`);
    }

    const lead = session.leads?.[0] ?? null;
    const metadata = session.metadata as Record<string, unknown> | null;

    const systemMessages: OpenAIMessage[] = [
      {
        role: "system",
        content: `You are chatting with a customer on behalf of ${session.dealership.name}. Always use factual information from the dealership.`
      }
    ];

    if (intent) {
      const contextNote =
        INTENT_CONTEXT[intent] ??
        "Serve the customer professionally, keeping responses under 100 words.";
      systemMessages.push({
        role: "system",
        content: `Intent: ${intent}${intentConfidence ? ` (confidence ${Math.round(intentConfidence * 100)}%)` : ""}. ${contextNote}`
      });
    }

    if (entities) {
      const entityContext = buildEntityContext(entities);
      if (entityContext) {
        systemMessages.push({
          role: "system",
          content: entityContext
        });
      }
    }

    const customerDetails = buildCustomerDetails(metadata, lead);
    if (customerDetails) {
      systemMessages.push({
        role: "system",
        content: customerDetails
      });
    }

    const messageHistory = formatMessages(session.messages);
    const trimmedHistory = trimMessagesToTokenLimit(systemMessages, messageHistory);

    return [...systemMessages, ...trimmedHistory];
  } catch (error) {
    logger.error("Failed to build conversation context", error as Error);
    return [
      {
        role: "system",
        content:
          "You are a car dealership assistant. The chat history could not be retrieved. Ask the user how you can help."
      }
    ];
  }
}

function buildEntityContext(entities: IntentClassificationResult["entities"]) {
  const parts: string[] = [];

  if (entities.vehicle) {
    const { make, model, year } = entities.vehicle;
    if (make || model || year) {
      parts.push(
        `The customer is interested in ${[year, make, model]
          .filter(Boolean)
          .join(" ")}`.trim()
      );
    }
  }

  if (entities.bodyType) {
    parts.push(`Preferred body type: ${entities.bodyType}.`);
  }

  if (entities.condition) {
    parts.push(`Vehicle condition preference: ${entities.condition.toLowerCase()}.`);
  }

  if (entities.priceRange) {
    const { min, max } = entities.priceRange;
    const rangeLabel =
      min && max
        ? `$${min.toLocaleString()} - $${max.toLocaleString()}`
        : min
        ? `over $${min.toLocaleString()}`
        : max
        ? `under $${max.toLocaleString()}`
        : null;
    if (rangeLabel) {
      parts.push(`Budget: ${rangeLabel}.`);
    }
  }

  if (!parts.length) {
    return "";
  }

  return `Additional context: ${parts.join(" ")}`;
}

function buildCustomerDetails(metadata: Record<string, unknown> | null, lead: Lead | null) {
  const details: string[] = [];

  const name =
    (typeof metadata?.name === "string" && metadata.name) ||
    (lead?.firstName && `${lead.firstName} ${lead.lastName}`.trim());
  if (name) {
    details.push(`Customer name: ${name}.`);
  }

  if (lead?.phone) {
    details.push(`Customer phone: ${lead.phone}.`);
  }

  if (lead?.email) {
    details.push(`Customer email: ${lead.email}.`);
  }

  if (!details.length) {
    return "";
  }

  return details.join(" ");
}

function formatMessages(messages: Message[]): OpenAIMessage[] {
  return messages
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((message) => ({
      role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: message.content
    }));
}

function trimMessagesToTokenLimit(systemMessages: OpenAIMessage[], history: OpenAIMessage[]) {
  const estimatedSystemTokens = estimateTokens(systemMessages);
  const availableTokens = Math.max(0, MAX_CONTEXT_TOKENS - estimatedSystemTokens);

  const trimmed: OpenAIMessage[] = [];
  let usedTokens = 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    const messageTokens = estimateSingleMessageTokens(message);
    if (usedTokens + messageTokens > availableTokens) {
      break;
    }
    trimmed.unshift(message);
    usedTokens += messageTokens;
  }

  return trimmed;
}

function estimateTokens(messages: OpenAIMessage[]) {
  return messages.reduce((total, msg) => total + estimateSingleMessageTokens(msg), 0);
}

function estimateSingleMessageTokens(message: OpenAIMessage) {
  return Math.ceil(message.content.length / 4);
}

