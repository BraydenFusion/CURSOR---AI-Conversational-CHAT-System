import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ALLOWED_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
type MessageRole = (typeof ALLOWED_ROLES)[number];

const messageSchema = z.object({
  role: z.string().optional(),
  content: z.string().optional()
});

const requestSchema = z.object({
  dealershipId: z.string().uuid(),
  metadata: z.unknown().optional(),
  sessionToken: z.string().uuid().optional(),
  messages: z.array(messageSchema).optional()
});

export async function GET() {
  const sessions = await prisma.chatSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    },
    take: 10
  });

  return NextResponse.json({ conversations: sessions });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const { dealershipId, metadata, sessionToken, messages = [] } = requestSchema.parse(
    payload
  );

  const session = await prisma.chatSession.create({
    data: {
      dealershipId,
      metadata:
        metadata !== undefined
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      sessionToken: sessionToken ?? crypto.randomUUID(),
      messages: {
        create: messages.map((message) => ({
          role: parseMessageRole(message.role),
          content: message.content ?? ""
        }))
      }
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return NextResponse.json({ conversation: session }, { status: 201 });
}

function parseMessageRole(role?: string): MessageRole {
  const normalized = role?.toUpperCase();
  return (ALLOWED_ROLES.find((allowed) => allowed === normalized) ?? "USER") as MessageRole;
}

