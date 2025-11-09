import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
const ALLOWED_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
type MessageRole = (typeof ALLOWED_ROLES)[number];

export async function GET() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    },
    take: 10
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const conversation = await prisma.conversation.create({
    data: {
      subject: payload.subject ?? null,
      messages: {
        create:
          payload.messages?.map(
            (message: { role?: string; content?: string }) => ({
              role: parseMessageRole(message.role),
              content: message.content ?? ""
            })
          ) ?? []
      }
    },
    include: { messages: true }
  });

  return NextResponse.json({ conversation }, { status: 201 });
}

function parseMessageRole(role?: string): MessageRole {
  const normalized = role?.toUpperCase();
  return (ALLOWED_ROLES.find((allowed) => allowed === normalized) ??
    "USER") as MessageRole;
}

