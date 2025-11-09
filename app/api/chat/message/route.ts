import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";
import { env } from "@/lib/env";
import { z } from "zod";
import jwt from "jsonwebtoken";
import OpenAI from "openai";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "sessionToken is required"),
  message: z.string().trim().min(1, "message is required")
});

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionToken, message } = requestSchema.parse(body);

    const payload = verifySessionToken(sessionToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid session token" },
        { status: 401 }
      );
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        dealership: true
      }
    });

    if (!session || session.dealershipId !== payload.dealershipId) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Session not found or mismatch" },
        { status: 401 }
      );
    }

    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: message,
        intent: null,
        entities: null
      }
    });

    const previousMessages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 9
    });

    const history = [...previousMessages].reverse();

    const vehicles = await prisma.vehicle.findMany({
      where: { dealershipId: session.dealershipId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        trim: true,
        price: true,
        mileage: true,
        condition: true,
        availability: true
      }
    });

    const systemPrompt = `
You are a helpful car dealership assistant for ${session.dealership.name}.
Your role is to help customers find vehicles, answer questions, and schedule appointments.
Be friendly, professional, and concise (under 100 words per response).
If customer asks about availability, search the inventory.
If customer wants to schedule something, guide them to booking.
Always try to capture their contact info (name, email, phone) naturally.
Never make up vehicle details - only use real inventory data provided to you.
`;

    const inventoryContext = vehicles.length
      ? `Available inventory:\n${JSON.stringify(vehicles)}`
      : "No inventory data is currently available.";

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      { role: "system" as const, content: inventoryContext },
      ...history.map((msg) => ({
        role: msg.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: msg.content
      })),
      { role: "user" as const, content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: chatMessages
    });

    const assistantContent = completion.choices[0]?.message?.content;
    if (!assistantContent) {
      return NextResponse.json(
        { error: "Bad Gateway", message: "No response from AI assistant" },
        { status: 502 }
      );
    }

    let parsedResponse: {
      reply: string;
      intent: string;
      entities?: Array<{ type: string; value: string }>;
    };

    try {
      parsedResponse = JSON.parse(assistantContent);
    } catch (error) {
      parsedResponse = {
        reply: assistantContent,
        intent: "UNKNOWN",
        entities: []
      };
    }

    const reply = parsedResponse.reply ?? assistantContent;
    const intent = parsedResponse.intent ?? "UNKNOWN";
    const entities = parsedResponse.entities ?? [];

    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: reply,
        intent,
        entities
      }
    });

    return NextResponse.json(
      {
        reply,
        intent,
        entities
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "Invalid request data",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    return handleApiError(error);
  }
}

function verifySessionToken(token: string): null | { sessionId: string; dealershipId: string } {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      sessionId?: string;
      dealershipId?: string;
    };

    if (!decoded.sessionId || !decoded.dealershipId) {
      return null;
    }

    return {
      sessionId: decoded.sessionId,
      dealershipId: decoded.dealershipId
    };
  } catch {
    return null;
  }
}

