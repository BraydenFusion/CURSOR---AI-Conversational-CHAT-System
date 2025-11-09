import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleApiError(error: unknown) {
  logger.error("API Error occurred", error as Error);

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

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        {
          error: "Duplicate Entry",
          message: "A record with this data already exists",
          details: error.meta
        },
        { status: 409 }
      );
    }

    if (error.code === "P2025") {
      return NextResponse.json(
        {
          error: "Not Found",
          message: "The requested record was not found"
        },
        { status: 404 }
      );
    }
  }

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.name,
        message: error.message,
        details: error.details
      },
      { status: error.statusCode }
    );
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";

  return NextResponse.json(
    {
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "Something went wrong" : message
    },
    { status: 500 }
  );
}

