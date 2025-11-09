"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

interface UploadResponse {
  jobId: string;
  totalRows: number;
  skippedRows?: Array<{ row: number; reason: string }>;
}

interface JobStatus {
  id: string;
  state: string;
  progress: {
    processed?: number;
    total?: number;
  };
  result?: {
    processed: number;
    total: number;
    created: number;
    updated: number;
    errors: Array<{ row: number; error: string }>;
    markedSold: number;
  };
  failedReason?: string | null;
}

export default function InventoryUploadPage() {
  const [dealershipId, setDealershipId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [markSold, setMarkSold] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [initialSkipped, setInitialSkipped] = useState<UploadResponse["skippedRows"]>([]);
  const [error, setError] = useState<string | null>(null);

  const processed = status?.result?.processed ?? status?.progress?.processed ?? 0;
  const progressTotal =
    status?.result?.total ?? status?.progress?.total ?? totalRows ?? 0;

  const completionPercentage = useMemo(() => {
    if (!progressTotal) return 0;
    return Math.min(100, Math.round((processed / progressTotal) * 100));
  }, [processed, progressTotal]);

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/inventory/import/${jobId}`, {
          cache: "no-store"
        });
        if (!res.ok) {
          throw new Error(`Status ${res.status}`);
        }
        const json = (await res.json()) as JobStatus;
        setStatus(json);
        if (json.state === "completed" || json.state === "failed") {
          clearInterval(interval);
        }
      } catch (pollError) {
        console.error("Failed to poll job status", pollError);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  const resetForm = useCallback(() => {
    setFile(null);
    setMarkSold(false);
    setTotalRows(0);
    setJobId(null);
    setStatus(null);
    setInitialSkipped([]);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!file) {
        setError("Please select a CSV file to upload.");
        return;
      }

      if (!dealershipId) {
        setError("Dealership ID is required.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("dealershipId", dealershipId);
      formData.append("markMissingAsSold", String(markSold));

      setIsSubmitting(true);

      try {
        const response = await fetch("/api/admin/inventory/import", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? "Failed to enqueue import job.");
        }

        const data = (await response.json()) as UploadResponse;
        setJobId(data.jobId);
        setTotalRows(data.totalRows);
        setInitialSkipped(data.skippedRows ?? []);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Failed to start inventory import."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [dealershipId, file, markSold]
  );

  const hasCompleted =
    status?.state === "completed" && status.result && status.result.errors.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wider text-indigo-400">
          Inventory Management
        </p>
        <h1 className="text-3xl font-semibold text-white">Bulk Inventory Upload</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Import inventory from a CSV file. Existing vehicles will be updated by VIN. You
          can optionally mark vehicles not present in this upload as sold.
        </p>
      </header>

      <section className="grid gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/40"
        >
          <div className="space-y-2">
            <label htmlFor="dealershipId" className="text-sm font-medium text-white">
              Dealership ID
            </label>
            <input
              id="dealershipId"
              type="text"
              value={dealershipId}
              onChange={(event) => setDealershipId(event.target.value)}
              placeholder="UUID of the dealership"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              required
            />
            <p className="text-xs text-slate-500">
              You can find this in the admin dashboard or database.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="file" className="text-sm font-medium text-white">
              Inventory CSV
            </label>
            <input
              id="file"
              type="file"
              accept=".csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-400"
              required
            />
            <p className="text-xs text-slate-500">
              Columns: VIN, Stock#, Year, Make, Model, Trim, Condition, Price, Mileage,
              Color, BodyType, Images
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
            <input
              type="checkbox"
              checked={markSold}
              onChange={(event) => setMarkSold(event.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-200">
              Mark vehicles not present in upload as SOLD
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

 		    <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400",
                isSubmitting && "cursor-not-allowed opacity-70"
              )}
            >
              {isSubmitting ? "Uploading…" : "Start Import"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-slate-400 transition hover:text-slate-200"
            >
              Reset
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/30">
            <h2 className="text-lg font-semibold text-white">Import Progress</h2>
            <p className="text-sm text-slate-400">
              Track the status of your latest upload. Progress updates every few seconds.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Processed</span>
                  <span>
                    {processed.toLocaleString()} / {progressTotal.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-800">
                  <div
                    className="h-3 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>

              {status?.state && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                  <p className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="font-semibold text-indigo-300">{status.state}</span>
                  </p>
                  {status.failedReason && (
                    <p className="mt-2 text-xs text-red-300">{status.failedReason}</p>
                  )}
                  {status.result && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>
                        <dt className="font-medium text-slate-300">Created</dt>
                        <dd>{status.result.created}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-300">Updated</dt>
                        <dd>{status.result.updated}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-300">Marked Sold</dt>
                        <dd>{status.result.markedSold}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}
            </div>
          </div>

          {Boolean(initialSkipped?.length) && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-lg shadow-black/20">
              <h3 className="text-sm font-semibold text-amber-200">
                Skipped Rows During Upload
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-amber-100/90">
                {initialSkipped?.map((row) => (
                  <li key={`skipped-${row.row}`} className="rounded-md bg-amber-500/10 p-2">
                    Row {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {status?.result?.errors?.length ? (
            <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 shadow-lg shadow-black/20">
              <h3 className="text-sm font-semibold text-red-200">Row Errors</h3>
              <ul className="mt-3 space-y-2 text-xs text-red-100/90 max-h-64 overflow-y-auto pr-2">
                {status.result.errors.map((row) => (
                  <li key={`error-${row.row}`} className="rounded-md bg-red-500/10 p-2">
                    Row {row.row}: {row.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : hasCompleted ? (
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5 shadow-lg shadow-black/20">
              <h3 className="text-sm font-semibold text-emerald-200">Import Successful</h3>
              <p className="mt-2 text-xs text-emerald-100/80">
                All rows processed successfully. Inventory is now up to date!
              </p>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

