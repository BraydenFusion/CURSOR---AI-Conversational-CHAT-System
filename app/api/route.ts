import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "API root is ready. Add nested routes under app/api/*."
  });
}

