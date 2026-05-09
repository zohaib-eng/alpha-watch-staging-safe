import IORedis from "ioredis";
import { QueueEvents, Worker } from "bullmq";
import { config } from "./config.js";
import { executeCandidate } from "./services/executor.js";
import { enforceRisk, requireApproval } from "./services/risk.js";

const queueName = process.env.JOB_QUEUE_NAME || "alpha-watch";
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

const events = new QueueEvents(queueName, { connection });

events.on("completed", ({ jobId }) => {
  console.log(`[worker] job completed: ${jobId}`);
});

events.on("failed", ({ jobId, failedReason }) => {
  console.error(`[worker] job failed: ${jobId}`, failedReason);
});

const worker = new Worker(
  queueName,
  async job => {
    if (job.name === "execute-candidate") {
      const { candidate, amountUsd = 100, approved = false } = job.data || {};
      if (!candidate) throw new Error("candidate payload required");

      enforceRisk(candidate, amountUsd);
      if (requireApproval(candidate, amountUsd) && !approved) {
        throw new Error("Approval required before execution");
      }

      return executeCandidate(candidate);
    }

    throw new Error(`Unsupported job: ${job.name}`);
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
    limiter: {
      max: Number(process.env.WORKER_RATE_LIMIT_MAX || 10),
      duration: Number(process.env.WORKER_RATE_LIMIT_WINDOW_MS || 1000)
    }
  }
);

worker.on("ready", () => {
  console.log("[worker] online", { queueName, config });
});

worker.on("error", error => {
  console.error("[worker] error", error);
});

async function shutdown(signal) {
  console.log(`[worker] received ${signal}, shutting down`);
  await worker.close();
  await events.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
