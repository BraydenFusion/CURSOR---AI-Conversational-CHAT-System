import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { enqueueInventoryImport } from "@/lib/queues/inventoryImportQueue";

export const runtime = "nodejs";

const uploadSchema = z.object({
  dealershipId: z.string().uuid(),
  markMissingAsSold: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
});

const REQUIRED_COLUMNS = [
  "VIN",
  "Stock#",
  "Year",
  "Make",
  "Model",
  "Trim",
  "Condition",
  "Price",
  "Mileage",
  "Color",
  "BodyType",
  "Images"
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Bad Request", message: "CSV file is required" },
        { status: 400 }
      );
    }

    const parsedMeta = uploadSchema.safeParse({
      dealershipId: formData.get("dealershipId"),
      markMissingAsSold: formData.get("markMissingAsSold") ?? "false"
    });

    if (!parsedMeta.success) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "Invalid form submission",
          details: parsedMeta.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message
          }))
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const csvContent = Buffer.from(arrayBuffer).toString("utf-8");

    let rawRecords: Record<string, string>[];

    try {
      rawRecords = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid CSV",
          message: "Unable to parse CSV file",
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 400 }
      );
    }

    if (!rawRecords.length) {
      return NextResponse.json(
        { error: "Bad Request", message: "CSV file contains no rows" },
        { status: 400 }
      );
    }

    const headerColumns = Object.keys(rawRecords[0] ?? {});
    const missingColumns = REQUIRED_COLUMNS.filter(
      (column) => !headerColumns.some((header) => normalizeColumn(header) === column)
    );

    if (missingColumns.length) {
      return NextResponse.json(
        {
          error: "Invalid CSV",
          message: `Missing required columns: ${missingColumns.join(", ")}`
        },
        { status: 400 }
      );
    }

    const { dealershipId, markMissingAsSold } = parsedMeta.data;
    const rows = [];
    const skipped = [];

    for (let index = 0; index < rawRecords.length; index += 1) {
      const row = rawRecords[index];

      const vin = rowMatch(row, "VIN");
      if (!vin) {
        skipped.push({ row: index + 1, reason: "Missing VIN" });
        continue;
      }

      const yearValue = Number(rowMatch(row, "Year"));
      const priceValue = Number(rowMatch(row, "Price"));
      const mileageValue = Number(rowMatch(row, "Mileage"));

      const images = (rowMatch(row, "Images") ?? "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);

      rows.push({
        vin,
        stockNumber: rowMatch(row, "Stock#") ?? undefined,
        year: Number.isFinite(yearValue) ? yearValue : undefined,
        make: rowMatch(row, "Make") ?? undefined,
        model: rowMatch(row, "Model") ?? undefined,
        trim: rowMatch(row, "Trim") ?? undefined,
        condition: rowMatch(row, "Condition") ?? undefined,
        price: Number.isFinite(priceValue) ? priceValue : undefined,
        mileage: Number.isFinite(mileageValue) ? mileageValue : undefined,
        color: rowMatch(row, "Color") ?? undefined,
        bodyType: rowMatch(row, "BodyType") ?? undefined,
        images
      });
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "All rows were invalid. Please review the CSV format.",
          skipped
        },
        { status: 400 }
      );
    }

    const job = await enqueueInventoryImport({
      dealershipId,
      rows,
      markMissingAsSold: markMissingAsSold ?? false,
      totalRows: rows.length
    });

    return NextResponse.json({
      jobId: job.id,
      totalRows: rows.length,
      skippedRows: skipped
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to enqueue inventory import job",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

function normalizeColumn(column: string) {
  return column.trim().toUpperCase().replace(/\s+/g, "");
}

function rowMatch(row: Record<string, string>, target: string) {
  const normalizedTarget = normalizeColumn(target);
  const entry = Object.entries(row).find(
    ([key]) => normalizeColumn(key) === normalizedTarget
  );
  return entry?.[1]?.trim() ?? null;
}

