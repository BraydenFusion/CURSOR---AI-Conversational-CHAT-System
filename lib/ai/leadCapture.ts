import { LeadIntent, LeadPreferredContact, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

interface LeadCaptureOptions {
  sessionId: string;
  dealershipId: string;
  conversation: ConversationMessage[];
  extractedInfo?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

interface LeadCaptureResult {
  needsInfo: string[];
  collectedInfo: {
    name?: string;
    phone?: string;
    email?: string;
  };
  leadId?: string;
}

type SessionLeadMetadata = {
  name?: string;
  phone?: string;
  email?: string;
};

const INTEREST_KEYWORDS = [
  "test drive",
  "interested",
  "availability",
  "price",
  "cost",
  "buy",
  "purchase",
  "schedule",
  "appointment",
  "finance",
  "payment",
  "lease",
  "trade"
];

const PROMPT_TEMPLATES: Record<"name" | "phone" | "email", string> = {
  name: "Great! Could I have your name so our team knows who to follow up with?",
  phone: "What’s the best phone number to reach you if we need to confirm details?",
  email: "And lastly, what's a good email so we can send over the info?"
};

export async function handleLeadCapture({
  sessionId,
  dealershipId,
  conversation,
  extractedInfo
}: LeadCaptureOptions): Promise<LeadCaptureResult> {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new Error(`ChatSession ${sessionId} not found`);
    }

    const sessionMetadata: SessionLeadMetadata =
      (session.metadata as SessionLeadMetadata | null) ?? {};

    const userMessages = conversation.filter((msg) => msg.role === "user");
    const recentInterestMessages = userMessages.slice(-5).filter((msg) =>
      INTEREST_KEYWORDS.some((keyword) =>
        msg.content.toLowerCase().includes(keyword)
      )
    );

    const shouldPrompt =
      recentInterestMessages.length >= 2 || userMessages.length >= 3;

    const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

    const parsedEmail =
      extractedInfo?.email ?? extractEmail(latestUserMessage) ?? sessionMetadata.email;
    const email = parsedEmail && isValidEmail(parsedEmail) ? parsedEmail : sessionMetadata.email;

    const parsedPhone =
      extractedInfo?.phone ?? extractPhone(latestUserMessage) ?? sessionMetadata.phone;
    const phone = parsedPhone ? toE164(parsedPhone) ?? sessionMetadata.phone : sessionMetadata.phone;

    const parsedName =
      extractedInfo?.name ?? extractName(latestUserMessage) ?? sessionMetadata.name;
    const name = parsedName ?? sessionMetadata.name;

    const updatedMetadata: SessionLeadMetadata = {
      ...sessionMetadata,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {})
    };

    const needsInfo: string[] = [];

    if (shouldPrompt) {
      if (!updatedMetadata.name) {
        needsInfo.push(PROMPT_TEMPLATES.name);
      } else if (!updatedMetadata.phone) {
        needsInfo.push(PROMPT_TEMPLATES.phone);
      } else if (!updatedMetadata.email) {
        needsInfo.push(PROMPT_TEMPLATES.email);
      }
    }

    const collectedInfo = {
      name: updatedMetadata.name,
      phone: updatedMetadata.phone,
      email: updatedMetadata.email
    };

    if (
      updatedMetadata.name &&
      updatedMetadata.phone &&
      updatedMetadata.email &&
      !needsInfo.length
    ) {
      const { firstName, lastName } = splitName(updatedMetadata.name);

      const existingLead = await prisma.lead.findFirst({
        where: { sessionId }
      });

      if (existingLead) {
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            firstName,
            lastName,
            email: updatedMetadata.email,
            phone: updatedMetadata.phone,
            preferredContact: updatedMetadata.phone
              ? LeadPreferredContact.PHONE
              : LeadPreferredContact.EMAIL
          }
        });

        collectedInfo.name = `${firstName} ${lastName}`.trim();
        await persistSessionMetadata(sessionId, updatedMetadata);
        return {
          needsInfo,
          collectedInfo,
          leadId: existingLead.id
        };
      }

      const lead = await prisma.lead.create({
        data: {
          dealershipId,
          sessionId,
          firstName,
          lastName,
          email: updatedMetadata.email,
          phone: updatedMetadata.phone,
          preferredContact: updatedMetadata.phone
            ? LeadPreferredContact.PHONE
            : LeadPreferredContact.EMAIL,
          intent: LeadIntent.INQUIRY,
          status: LeadStatus.NEW,
          leadScore: 0,
          pushedToCRM: false,
          conversationTranscript: null
        }
      });

      collectedInfo.name = `${firstName} ${lastName}`.trim();
      await persistSessionMetadata(sessionId, updatedMetadata);
      return {
        needsInfo,
        collectedInfo,
        leadId: lead.id
      };
    }

    await persistSessionMetadata(sessionId, updatedMetadata);

    return {
      needsInfo,
      collectedInfo
    };
  } catch (error) {
    logger.error("Lead capture handling failed", error as Error);
    return {
      needsInfo: [],
      collectedInfo: {}
    };
  }
}

function isValidEmail(email: string) {
  const regex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

function extractEmail(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return match?.[0]?.toLowerCase() ?? null;
}

function extractPhone(text: string): string | null {
  const digits = text.replace(/[^\d]/g, "");
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}

function toE164(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return null;
}

function extractName(text: string): string | null {
  const patterns = [
    /my name is\s+([a-z ,.'-]+)/i,
    /i(?:'| a)m\s+([a-z ,.'-]+)/i,
    /this is\s+([a-z ,.'-]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanupName(match[1]);
    }
  }

  return null;
}

function cleanupName(rawName: string) {
  return rawName
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: "Valued", lastName: "Customer" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Customer" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

async function persistSessionMetadata(
  sessionId: string,
  metadata: SessionLeadMetadata
) {
  try {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { metadata }
    });
  } catch (error) {
    logger.warn("Failed to persist session metadata", error);
  }
}

