import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";
import { Prisma, VehicleAvailability, VehicleCondition } from "@prisma/client";
import { z } from "zod";

const searchSchema = z
  .object({
    dealershipId: z.string().uuid(),
    make: z.string().trim().max(50).optional(),
    model: z.string().trim().max(50).optional(),
    year: z.coerce.number()
      .int()
      .refine((val) => val >= 1980 && val <= new Date().getFullYear() + 1, {
        message: "Invalid year"
      })
      .optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    bodyType: z.string().trim().max(50).optional(),
    condition: z
      .string()
      .transform((val) => val.toUpperCase())
      .refine(
        (val) =>
          val === VehicleCondition.NEW ||
          val === VehicleCondition.USED ||
          val === VehicleCondition.CERTIFIED,
        {
          message: "Invalid condition"
        }
      )
      .optional()
  })
  .refine(
    (values) =>
      values.minPrice === undefined ||
      values.maxPrice === undefined ||
      values.minPrice <= values.maxPrice,
    {
      message: "minPrice must be less than or equal to maxPrice",
      path: ["minPrice"]
    }
  );

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(20).default(10),
  offset: z.coerce.number().min(0).default(0)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());

    const validatedSearch = searchSchema.parse(params);
    const { limit, offset } = paginationSchema.parse({
      limit: params.limit,
      offset: params.offset
    });

    const where: Prisma.VehicleWhereInput = {
      dealershipId: validatedSearch.dealershipId,
      availability: VehicleAvailability.IN_STOCK
    };

    const andFilters: Prisma.VehicleWhereInput[] = [];

    if (validatedSearch.condition) {
      andFilters.push({ condition: validatedSearch.condition });
    }

    if (validatedSearch.bodyType) {
      andFilters.push({
        bodyType: {
          equals: validatedSearch.bodyType,
          mode: "insensitive"
        }
      });
    }

    if (validatedSearch.year) {
      andFilters.push({ year: validatedSearch.year });
    }

    if (validatedSearch.minPrice || validatedSearch.maxPrice) {
      andFilters.push({
        price: {
          ...(validatedSearch.minPrice !== undefined
            ? { gte: new Prisma.Decimal(validatedSearch.minPrice) }
            : {}),
          ...(validatedSearch.maxPrice !== undefined
            ? { lte: new Prisma.Decimal(validatedSearch.maxPrice) }
            : {})
        }
      });
    }

    if (validatedSearch.make) {
      if (validatedSearch.make.length >= 3) {
        andFilters.push({
          make: {
            contains: validatedSearch.make.slice(0, 3),
            mode: "insensitive"
          }
        });
      } else {
        andFilters.push({
          make: {
            startsWith: validatedSearch.make,
            mode: "insensitive"
          }
        });
      }
    }

    if (validatedSearch.model) {
      if (validatedSearch.model.length >= 3) {
        andFilters.push({
          model: {
            contains: validatedSearch.model.slice(0, 3),
            mode: "insensitive"
          }
        });
      } else {
        andFilters.push({
          model: {
            startsWith: validatedSearch.model,
            mode: "insensitive"
          }
        });
      }
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const fetchLimit = Math.min(offset + limit * 3, 60);

    const vehicles = await prisma.vehicle.findMany({
      where,
      orderBy: [
        { featured: "desc" },
        { price: "asc" }
      ],
      take: fetchLimit
    });

    const scored = vehicles.map((vehicle) => {
      const makeScore = validatedSearch.make
        ? 1 - similarityScore(validatedSearch.make, vehicle.make)
        : 0;
      const modelScore = validatedSearch.model
        ? 1 - similarityScore(validatedSearch.model, vehicle.model)
        : 0;

      const score =
        (vehicle.featured ? 100 : 0) +
        makeScore * 40 +
        modelScore * 30 -
        Number(vehicle.price ?? new Prisma.Decimal(0)) / 100_000;

      return { vehicle, score };
    });

    scored.sort((a, b) => b.score - a.score || comparePrice(a.vehicle.price, b.vehicle.price));

    const paged = scored.slice(offset, offset + limit).map(({ vehicle }) => ({
      id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      condition: vehicle.condition,
      price: vehicle.price?.toNumber() ?? null,
      mileage: vehicle.mileage,
      bodyType: vehicle.bodyType,
      transmission: vehicle.transmission,
      drivetrain: vehicle.drivetrain,
      fuelType: vehicle.fuelType,
      mpgCity: vehicle.mpgCity,
      mpgHighway: vehicle.mpgHighway,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      features: vehicle.features,
      images: Array.isArray(vehicle.images) ? vehicle.images.slice(0, 8) : [],
      availability: vehicle.availability,
      featured: vehicle.featured,
      updatedAt: vehicle.updatedAt
    }));

    return NextResponse.json({
      data: paged,
      pagination: {
        limit,
        offset,
        returned: paged.length,
        totalCandidates: vehicles.length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "Invalid query parameters",
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

function similarityScore(a: string, b: string) {
  const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length) || 1;
  return Math.min(distance / maxLength, 1);
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function comparePrice(a: Prisma.Decimal | null, b: Prisma.Decimal | null) {
  const numA = a?.toNumber() ?? Number.POSITIVE_INFINITY;
  const numB = b?.toNumber() ?? Number.POSITIVE_INFINITY;
  return numA - numB;
}

