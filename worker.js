const { Worker } = require("bullmq");
const Redis = require("ioredis");

if (!process.env.REDIS_URL) {
  console.error("❌ REDIS_URL not set");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

connection.on("connect", () => {
  console.log("✅ Worker connected to Redis");
});

connection.on("error", (error) => {
  console.error("❌ Worker Redis error:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection in worker:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception in worker:", error);
});

function logJobFailure(queueName, job, error) {
  console.error(
    `❌ ${queueName} job ${job?.id ?? "unknown"} failed after ${job?.attemptsMade ?? 0} attempts:`,
    error?.message ?? error
  );
  if (job?.data) {
    console.error("   Job payload:", job.data);
  }
  if (error?.stack) {
    console.error(error.stack);
  }
}

const crmWorker = new Worker(
  "crm-push",
  async (job) => {
    console.log(`📤 Processing CRM push job ${job.id} for lead ${job.data.leadId}`);

    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      const lead = await prisma.lead.findUnique({
        where: { id: job.data.leadId },
        include: { dealership: true }
      });

      if (!lead) {
        throw new Error(`Lead ${job.data.leadId} not found`);
      }

      const { pushLeadToDealerSocket } = require("./lib/integrations/dealersocket");
      const result = await pushLeadToDealerSocket(lead);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          pushedToCRM: true,
          updatedAt: new Date()
        }
      });

      await prisma.$disconnect();

      console.log(`✅ CRM push successful for lead ${job.data.leadId}`);
      return { success: true, crmId: result.id };
    } catch (error) {
      console.error(`❌ CRM push failed for lead ${job.data.leadId}:`, error.message);

      if (job.attemptsMade >= 3) {
        const { PrismaClient } = require("@prisma/client");
        const prisma = new PrismaClient();
        await prisma.lead.update({
          where: { id: job.data.leadId },
          data: { pushedToCRM: false }
        });
        await prisma.$disconnect();
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    }
  }
);

crmWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

crmWorker.on("failed", (job, error) => {
  logJobFailure("crm-push", job, error);
});

const reminderWorker = new Worker(
  "appointment-reminders",
  async (job) => {
    console.log(`📲 Processing reminder job ${job.id} for appointment ${job.data.appointmentId}`);

    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      const appointment = await prisma.appointment.findUnique({
        where: { id: job.data.appointmentId },
        include: {
          lead: true,
          dealership: true,
          vehicle: true
        }
      });

      if (!appointment) {
        throw new Error(`Appointment ${job.data.appointmentId} not found`);
      }

      const { sendAppointmentReminder } = require("./lib/notifications");
      await sendAppointmentReminder(appointment, job.data.type);

      await prisma.$disconnect();

      console.log(`✅ Reminder sent for appointment ${job.data.appointmentId}`);
      return { success: true };
    } catch (error) {
      console.error(
        `❌ Reminder failed for appointment ${job.data.appointmentId}:`,
        error.message
      );
      throw error;
    }
  },
  {
    connection,
    concurrency: 10,
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 5000
    }
  }
);

reminderWorker.on("completed", (job) => {
  console.log(`✅ Reminder job ${job.id} completed`);
});

reminderWorker.on("failed", (job, error) => {
  logJobFailure("appointment-reminders", job, error);
});

const inventoryWorker = new Worker(
  "inventory-import",
  async (job) => {
    console.log(`📦 Processing inventory import job ${job.id}`);
    const {
      dealershipId,
      rows,
      markMissingAsSold,
      totalRows
    } = job.data;

    const { PrismaClient, Prisma } = require("@prisma/client");
    const prisma = new PrismaClient();
    const VehicleCondition = Prisma.VehicleCondition;
    const VehicleAvailability = Prisma.VehicleAvailability;

    const errors = [];
    const seenVins = new Set();
    let created = 0;
    let updated = 0;
    let processed = 0;

    try {
      for (let index = 0; index < rows.length; index += 1) {
        const raw = rows[index];
        processed += 1;

        try {
          const vin = normalizeVin(raw.vin);
          if (!vin) {
            throw new Error("Missing VIN");
          }

          seenVins.add(vin);

          const condition = toVehicleCondition(raw.condition, VehicleCondition);
          if (!condition) {
            throw new Error(`Invalid condition "${raw.condition}"`);
          }

          const priceDecimal =
            typeof raw.price === "number" && !Number.isNaN(raw.price)
              ? new Prisma.Decimal(raw.price)
              : null;

          const images =
            Array.isArray(raw.images) && raw.images.length
              ? raw.images.filter(Boolean)
              : [];

          const data = {
            dealershipId,
            stockNumber: raw.stockNumber ?? null,
            year: raw.year ?? null,
            make: raw.make ?? null,
            model: raw.model ?? null,
            trim: raw.trim ?? null,
            condition,
            price: priceDecimal,
            mileage: raw.mileage ?? null,
            exteriorColor: raw.color ?? null,
            bodyType: raw.bodyType ?? null,
            images,
            availability: VehicleAvailability.IN_STOCK
          };

          const result = await prisma.vehicle.upsert({
            where: { vin },
            update: data,
            create: {
              ...data,
              vin,
              featured: false
            }
          });

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            created += 1;
          } else {
            updated += 1;
          }
        } catch (rowError) {
          errors.push({
            row: index + 1,
            error: rowError.message || "Unknown error"
          });
        }

        await job.updateProgress({
          processed,
          total: totalRows
        });
      }

      let markedSold = 0;

      if (markMissingAsSold && seenVins.size > 0) {
        const result = await prisma.vehicle.updateMany({
          where: {
            dealershipId,
            availability: VehicleAvailability.IN_STOCK,
            vin: { notIn: Array.from(seenVins) }
          },
          data: {
            availability: VehicleAvailability.SOLD
          }
        });
        markedSold = result.count;
      }

      return {
        processed,
        total: totalRows,
        created,
        updated,
        errors,
        markedSold
      };
    } finally {
      await prisma.$disconnect();
    }
  },
  {
    connection,
    concurrency: 2,
    attempts: 1
  }
);

inventoryWorker.on("completed", (job, result) => {
  console.log(
    `✅ Inventory job ${job.id} completed (${result?.processed ?? 0}/${result?.total ?? 0} rows)`
  );
  if (result?.markedSold) {
    console.log(`🚗 Marked ${result.markedSold} vehicles as SOLD`);
  }
  if (Array.isArray(result?.errors) && result.errors.length) {
    console.warn(
      `⚠️ Inventory job ${job.id} completed with ${result.errors.length} row errors`
    );
  }
});

inventoryWorker.on("failed", (job, error) => {
  logJobFailure("inventory-import", job, error);
});

function normalizeVin(vin) {
  return typeof vin === "string" ? vin.trim().toUpperCase() : "";
}

function toVehicleCondition(value, VehicleCondition) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "NEW") return VehicleCondition.NEW;
  if (normalized === "USED") return VehicleCondition.USED;
  if (normalized === "CERTIFIED" || normalized === "CPO") {
    return VehicleCondition.CERTIFIED;
  }
  return null;
}

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  try {
    console.log("⏳ Waiting for jobs to complete...");
    await Promise.all([crmWorker.close(), reminderWorker.close(), inventoryWorker.close()]);

    console.log("🔌 Closing Redis connection...");
    await connection.quit();

    console.log("✅ Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

setInterval(async () => {
  try {
    await connection.ping();
  } catch (error) {
    console.error("❌ Worker health check failed:", error);
  }
}, 30000);

console.log("🚀 Workers started successfully");
console.log(
  "📋 Listening for jobs on queues: crm-push, appointment-reminders, inventory-import"
);

