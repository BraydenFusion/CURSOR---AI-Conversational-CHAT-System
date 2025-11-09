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
  console.error(`❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, error.message);
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
  console.error(`❌ Reminder job ${job?.id} failed:`, error.message);
});

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  try {
    console.log("⏳ Waiting for jobs to complete...");
    await Promise.all([crmWorker.close(), reminderWorker.close()]);

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
console.log("📋 Listening for jobs on queues: crm-push, appointment-reminders");

