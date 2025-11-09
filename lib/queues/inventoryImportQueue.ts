import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/lib/env";

type GlobalQueue = {
  inventoryImportConnection?: Redis;
  inventoryImportQueue?: Queue;
};

const globalQueue = global as typeof global & GlobalQueue;

function getConnection() {
  if (!globalQueue.inventoryImportConnection) {
    globalQueue.inventoryImportConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
  }
  return globalQueue.inventoryImportConnection;
}

export const inventoryImportQueue = (() => {
  const connection = getConnection();
  if (!globalQueue.inventoryImportQueue) {
    globalQueue.inventoryImportQueue = new Queue("inventory-import", {
      connection
    });
  }
  return globalQueue.inventoryImportQueue;
})();

export interface InventoryImportRow {
  vin: string;
  stockNumber?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  condition?: string;
  price?: number;
  mileage?: number;
  color?: string;
  bodyType?: string;
  images?: string[];
}

export interface InventoryImportJobData {
  dealershipId: string;
  rows: InventoryImportRow[];
  markMissingAsSold: boolean;
  totalRows: number;
}

export async function enqueueInventoryImport(job: InventoryImportJobData) {
  return inventoryImportQueue.add("inventory-import", job, {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false
  });
}

