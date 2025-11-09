import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";
import { env } from "@/lib/env";
import jwt from "jsonwebtoken";

const requestSchema = z.object({
  dealershipId: z.string().uuid()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dealershipId } = requestSchema.parse(body);

    const dealership = await prisma.dealership.findUnique({
      where: { id: dealershipId }
    });

    if (!dealership) {
      return NextResponse.json(
        {
          error: "Not Found",
          message: "Dealership not found"
        },
        { status: 404 }
      );
    }

    const session = await prisma.chatSession.create({
      data: {
        dealershipId,
        sessionToken: crypto.randomUUID(),
        metadata: {}
      }
    });

    const signedToken = jwt.sign(
      {
        sessionId: session.id,
        dealershipId: session.dealershipId
      },
      env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    const greeting = `Hi there! Welcome to ${dealership.name}. I'm here to help with any vehicles or offers you're interested in. How can I assist you today?`;

    return NextResponse.json(
      {
        sessionToken: signedToken,
        greeting,
        sessionId: session.id
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
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

