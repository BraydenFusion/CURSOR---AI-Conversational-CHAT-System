import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";
import { env } from "@/lib/env";
import { z } from "zod";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "sessionToken is required"),
  message: z.string().trim().min(1, "message is required")
});

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

type AssistantEntities = {
  vehicle?: {
    make?: string | null;
    model?: string | null;
    year?: string | number | null;
  };
  priceRange?: {
    min?: number | null;
    max?: number | null;
  };
  bodyType?: string | null;
  condition?: string | null;
  [key: string]: unknown;
};

interface AssistantResponsePayload {
  reply?: string;
  intent?: string;
  entities?: unknown;
}

interface VehicleSuggestion {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  condition?: string | null;
  mileage?: number | null;
  exteriorColor?: string | null;
  bodyType?: string | null;
  images: string[];
  primaryImage?: string | null;
  availability?: string | null;
}

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
        entities: Prisma.JsonNull
      }
    });

    const previousMessages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 9
    });

    const history = [...previousMessages].reverse();

    const systemPrompt = `
You are a helpful car dealership assistant for ${session.dealership.name}.
Your role is to help customers find vehicles, answer questions, and schedule appointments.
Be friendly, professional, and concise (under 100 words per response).
If customer asks about availability, search the inventory.
If customer wants to schedule something, guide them to booking.
Always try to capture their contact info (name, email, phone) naturally.
Never make up vehicle details - only use real inventory data provided to you.
`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
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

    let parsedResponse: AssistantResponsePayload;
    try {
      parsedResponse = JSON.parse(assistantContent);
    } catch (error) {
      parsedResponse = {
        reply: assistantContent,
        intent: "UNKNOWN",
        entities: {}
      };
    }

    let reply = parsedResponse.reply ?? assistantContent;
    const intent = (parsedResponse.intent ?? "UNKNOWN").toUpperCase();
    const entities = normalizeEntities(parsedResponse.entities);

    let vehicles: VehicleSuggestion[] = [];

    if (intent === "INVENTORY_SEARCH") {
      try {
        const inventory = await searchInventory(session.dealershipId, entities);
        vehicles = inventory.vehicles;
        if (vehicles.length) {
          reply = formatInventoryReply(vehicles, entities, session.dealership.name);
          await prisma.vehicleView.createMany({
            data: vehicles.map((vehicle) => ({
              sessionId: session.id,
              vehicleId: vehicle.id
            })),
            skipDuplicates: true
          });
        } else {
          reply =
            "I couldn't find any vehicles that match those preferences right now. Would you like me to broaden the search or notify you when something becomes available?";
        }
      } catch (inventoryError) {
        console.error("Inventory lookup failed", inventoryError);
        reply =
          "I'm having trouble fetching the inventory at the moment. Could you try narrowing the details or checking back in a moment?";
      }
    }

    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: reply,
        intent,
        entities: hasEntityData(entities)
          ? (entities as Prisma.InputJsonValue)
          : Prisma.JsonNull
      }
    });

    return NextResponse.json(
      {
        reply,
        intent,
        entities,
        vehicles
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

function hasEntityData(entities: AssistantEntities) {
  if (!entities) return false;
  return Object.values(entities).some((value) => {
    if (!value) return false;
    if (typeof value === "object") {
      return Object.values(value).some((nested) => nested !== null && nested !== undefined);
    }
    return value !== null && value !== undefined;
  });
}

function normalizeEntities(raw: unknown): AssistantEntities {
  if (!raw) return {};

  if (Array.isArray(raw)) {
    const result: AssistantEntities = {};
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const type = String((item as Record<string, unknown>).type ?? "").toLowerCase();
      const value = (item as Record<string, unknown>).value;
      if (!type) continue;

      if (type.includes("vehicle.make")) {
        result.vehicle ??= {};
        result.vehicle.make = value ? String(value) : null;
      } else if (type.includes("vehicle.model")) {
        result.vehicle ??= {};
        result.vehicle.model = value ? String(value) : null;
      } else if (type.includes("vehicle.year")) {
        result.vehicle ??= {};
        const yearNumber = Number(value);
        result.vehicle.year = Number.isFinite(yearNumber) ? yearNumber : String(value ?? "");
      } else if (type.includes("price.min")) {
        result.priceRange ??= {};
        const num = Number(value);
        if (Number.isFinite(num)) result.priceRange.min = num;
      } else if (type.includes("price.max")) {
        result.priceRange ??= {};
        const num = Number(value);
        if (Number.isFinite(num)) result.priceRange.max = num;
      } else if (type.includes("bodytype")) {
        result.bodyType = value ? String(value) : null;
      } else if (type.includes("condition")) {
        result.condition = value ? String(value).toUpperCase() : null;
      }
    }
    return result;
  }

  if (typeof raw === "object" && raw !== null) {
    const clone = JSON.parse(JSON.stringify(raw)) as AssistantEntities;
    if (clone.vehicle?.year) {
      const num = Number(clone.vehicle.year);
      clone.vehicle.year = Number.isFinite(num) ? num : clone.vehicle.year;
    }
    if (clone.priceRange) {
      if (clone.priceRange.min !== undefined) {
        const minNum = Number(clone.priceRange.min);
        clone.priceRange.min = Number.isFinite(minNum) ? minNum : null;
      }
      if (clone.priceRange.max !== undefined) {
        const maxNum = Number(clone.priceRange.max);
        clone.priceRange.max = Number.isFinite(maxNum) ? maxNum : null;
      }
    }
    if (clone.condition) {
      clone.condition = clone.condition.toUpperCase();
    }
    return clone;
  }

  return {};
}

async function searchInventory(
  dealershipId: string,
  entities: AssistantEntities
): Promise<{ vehicles: VehicleSuggestion[] }> {
  const url = new URL("/api/inventory/search", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("dealershipId", dealershipId);
  url.searchParams.set("limit", "10");
  if (entities.vehicle?.make) {
    url.searchParams.set("make", String(entities.vehicle.make));
  }
  if (entities.vehicle?.model) {
    url.searchParams.set("model", String(entities.vehicle.model));
  }
  if (entities.vehicle?.year) {
    url.searchParams.set("year", String(entities.vehicle.year));
  }
  if (entities.priceRange?.min !== undefined) {
    url.searchParams.set("minPrice", String(Math.max(0, entities.priceRange.min ?? 0)));
  }
  if (entities.priceRange?.max !== undefined) {
    url.searchParams.set("maxPrice", String(Math.max(0, entities.priceRange.max ?? 0)));
  }
  if (entities.bodyType) {
    url.searchParams.set("bodyType", entities.bodyType);
  }
  if (entities.condition) {
    url.searchParams.set("condition", entities.condition);
  }

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Inventory API responded with ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: Array<any>;
    };
    const vehicles = Array.isArray(payload.data)
      ? payload.data.map(mapVehicleFromApi).slice(0, 10)
      : [];
    return { vehicles };
  } catch (error) {
    console.error("Inventory API fetch failed, falling back to direct query.", error);
    const fallbackVehicles = await fallbackInventoryQuery(dealershipId, entities);
    return { vehicles: fallbackVehicles };
  }
}

async function fallbackInventoryQuery(
  dealershipId: string,
  entities: AssistantEntities
) {
  const where: Parameters<typeof prisma.vehicle.findMany>[0]["where"] = {
    dealershipId,
    availability: "IN_STOCK"
  };

  const andFilters: typeof where["AND"] = [];

  if (entities.vehicle?.make) {
    andFilters.push({
      make: {
        contains: String(entities.vehicle.make),
        mode: "insensitive"
      }
    });
  }

  if (entities.vehicle?.model) {
    andFilters.push({
      model: {
        contains: String(entities.vehicle.model),
        mode: "insensitive"
      }
    });
  }

  if (entities.vehicle?.year) {
    const yearNum = Number(entities.vehicle.year);
    if (Number.isFinite(yearNum)) {
      andFilters.push({ year: yearNum });
    }
  }

  if (entities.priceRange?.min !== undefined || entities.priceRange?.max !== undefined) {
    andFilters.push({
      price: {
        ...(entities.priceRange?.min !== undefined
          ? { gte: new Prisma.Decimal(Math.max(0, entities.priceRange.min ?? 0)) }
          : {}),
        ...(entities.priceRange?.max !== undefined
          ? { lte: new Prisma.Decimal(Math.max(0, entities.priceRange.max ?? 0)) }
          : {})
      }
    });
  }

  if (entities.bodyType) {
    andFilters.push({
      bodyType: {
        contains: entities.bodyType,
        mode: "insensitive"
      }
    });
  }

  if (entities.condition) {
    andFilters.push({
      condition: entities.condition as any
    });
  }

  if (andFilters.length) {
    where.AND = andFilters;
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    orderBy: [
      { featured: "desc" },
      { price: "asc" }
    ],
    take: 10
  });

  return vehicles.map(mapVehicleFromRecord);
}

function mapVehicleFromApi(vehicle: any): VehicleSuggestion {
  const images: string[] = Array.isArray(vehicle.images)
    ? vehicle.images.filter((url: unknown) => typeof url === "string")
    : [];

  return {
    id: String(vehicle.id),
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? null,
    price: typeof vehicle.price === "number" ? vehicle.price : null,
    condition: vehicle.condition ?? null,
    mileage: typeof vehicle.mileage === "number" ? vehicle.mileage : null,
    exteriorColor: vehicle.exteriorColor ?? null,
    bodyType: vehicle.bodyType ?? null,
    images,
    primaryImage: images[0] ?? null,
    availability: vehicle.availability ?? null
  };
}

function mapVehicleFromRecord(vehicle: {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  price: Prisma.Decimal | null;
  mileage: number | null;
  condition: string;
  exteriorColor: string | null;
  bodyType: string | null;
  images: any;
  availability: string;
}) {
  const images = Array.isArray(vehicle.images)
    ? vehicle.images.filter((url: unknown) => typeof url === "string")
    : [];

  return {
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    price: vehicle.price ? vehicle.price.toNumber() : null,
    mileage: vehicle.mileage,
    condition: vehicle.condition,
    exteriorColor: vehicle.exteriorColor,
    bodyType: vehicle.bodyType,
    images,
    primaryImage: images[0] ?? null,
    availability: vehicle.availability
  } as VehicleSuggestion;
}

function formatInventoryReply(
  vehicles: VehicleSuggestion[],
  entities: AssistantEntities,
  dealershipName: string
) {
  if (!vehicles.length) {
    return `I couldn't find any vehicles that match those preferences at ${dealershipName} right now. Would you like me to keep an eye out or adjust the search?`;
  }

  const descriptorParts = [];
  const make = entities.vehicle?.make ?? vehicles[0]?.make;
  if (make) descriptorParts.push(make);
  const model = entities.vehicle?.model ?? vehicles[0]?.model;
  if (model) descriptorParts.push(model);

  const descriptor =
    descriptorParts.length > 0 ? descriptorParts.join(" ") : "vehicles";

  const header = `We have ${vehicles.length} ${descriptor} available:`;

  const lines = vehicles
    .slice(0, Math.min(3, vehicles.length))
    .map((vehicle) => formatVehicleLine(vehicle))
    .join("\n");

  return `${header}\n\n${lines}\n\nWhich interests you?`;
}

function formatVehicleLine(vehicle: VehicleSuggestion) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  const price = typeof vehicle.price === "number" ? formatCurrency(vehicle.price) : "Price TBD";

  const details: string[] = [];
  if (vehicle.condition) {
    details.push(
      vehicle.condition.toUpperCase() === "NEW"
        ? "New"
        : vehicle.condition.toUpperCase() === "CERTIFIED"
        ? "Certified"
        : "Pre-Owned"
    );
  }

  if (vehicle.condition && vehicle.condition.toUpperCase() !== "NEW" && vehicle.mileage != null) {
    details.push(`${formatMileage(vehicle.mileage)} miles`);
  } else if (vehicle.exteriorColor) {
    details.push(vehicle.exteriorColor);
  }

  return `• ${title.trim()} - ${price}${
    details.length ? " | " + details.join(" | ") : ""
  }`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatMileage(mileage: number) {
  if (mileage >= 1000) {
    return `${Math.round(mileage / 100) / 10}K`;
  }
  return mileage.toString();
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

