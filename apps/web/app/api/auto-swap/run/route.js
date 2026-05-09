export const runtime = 'nodejs';

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { requireAdmin } from '../../_lib/auth';
import { withDb } from '../../_lib/db';
import { writeAudit } from '../../_lib/audit';
import { getExecutionMode } from '../../_lib/risk';

function createQueue() {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });
  return {
    connection,
    queue: new Queue(process.env.JOB_QUEUE_NAME || 'alpha-watch', { connection })
  };
}

export async function POST(request) {
  const { actor, response } = requireAdmin(request);
  if (response) return response;

  let resources;
  try {
    const executionMode = getExecutionMode();
    if (!['dry-run', 'shadow-order'].includes(executionMode)) {
      return Response.json(
        { error: 'Supervised auto tests only run in dry-run or shadow-order mode' },
        { status: 400 }
      );
    }

    const candidates = await withDb(async client => {
      const res = await client.query(
        `SELECT * FROM candidates
         WHERE status = 'WATCH'
           AND auto_trade_enabled = true
         ORDER BY score DESC
         LIMIT 25`
      );
      return res.rows;
    });

    resources = createQueue();
    const jobs = [];

    for (const candidate of candidates) {
      const job = await resources.queue.add(
        'execute-candidate',
        {
          candidate,
          amountUsd: 100,
          approved: true,
          supervised: true,
          mode: candidate.auto_trade_mode || executionMode
        },
        {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 100
        }
      );
      jobs.push({ jobId: job.id, candidateId: candidate.id });
    }

    await withDb(async client => {
      await writeAudit(client, {
        type: 'AUTO_SWAP_TEST_QUEUED',
        actor: actor.id,
        message: `Queued ${jobs.length} supervised auto swap test jobs`,
        metadata: { executionMode, jobs }
      });
    });

    return Response.json({ success: true, executionMode, queued: jobs.length, jobs });
  } catch (error) {
    console.error('Auto swap run error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    await resources?.queue.close().catch(() => {});
    await resources?.connection.quit().catch(() => {});
  }
}
