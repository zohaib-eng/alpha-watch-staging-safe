export const runtime = 'nodejs';

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { requireAdmin } from '../_lib/auth';
import { withDb } from '../_lib/db';
import { writeAudit } from '../_lib/audit';

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
    const { name = 'execute-candidate', candidateId, amountUsd = 100, approved = false } = await request.json();
    if (!candidateId) return Response.json({ error: 'candidateId required' }, { status: 400 });

    const candidate = await withDb(async client => {
      const res = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      return res.rows[0];
    });
    if (!candidate) return Response.json({ error: 'Candidate not found' }, { status: 404 });

    resources = createQueue();
    const job = await resources.queue.add(
      name,
      { candidate, amountUsd, approved },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    );

    await withDb(async client => {
      await writeAudit(client, {
        type: 'JOB_ENQUEUED',
        actor: actor.id,
        message: `Queued ${name} for candidate ${candidateId}`,
        metadata: { jobId: job.id, candidateId, amountUsd, approved }
      });
    });

    return Response.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error('Job enqueue error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    await resources?.queue.close().catch(() => {});
    await resources?.connection.quit().catch(() => {});
  }
}
