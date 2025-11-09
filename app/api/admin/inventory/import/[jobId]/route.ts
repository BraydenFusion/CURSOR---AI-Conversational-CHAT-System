import { NextResponse } from "next/server";
import { inventoryImportQueue } from "@/lib/queues/inventoryImportQueue";

interface RouteParams {
  params: {
    jobId: string;
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const job = await inventoryImportQueue.getJob(params.jobId);

    if (!job) {
      return NextResponse.json(
        { error: "Not Found", message: "Job not found" },
        { status: 404 }
      );
    }

    const state = await job.getState();
    const progress =
      typeof job.progress === "object" && job.progress !== null
        ? job.progress
        : { processed: Number(job.progress) || 0 };

    const result = job.returnvalue ?? null;

    return NextResponse.json({
      id: job.id,
      state,
      progress,
      result,
      failedReason: job.failedReason ?? null,
      timestamp: job.finishedOn ?? job.processedOn ?? job.timestamp
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Unable to fetch job status",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

