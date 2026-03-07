import { runs } from '@trigger.dev/sdk/v3';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const runId = url.searchParams.get('runId');
  const kickoffId = url.searchParams.get('kickoffId');

  if (!runId) {
    return sendJson(res, 400, { error: 'Missing runId' });
  }

  try {
    const run = await runs.retrieve(runId);

    // If completed, persist the result in Redis
    if (run.status === 'COMPLETED' && run.output && kickoffId) {
      await redis.set(`kickoff-deck:${kickoffId}`, JSON.stringify(run.output));
    }

    return sendJson(res, 200, {
      status: run.status,
      output: run.output || null,
    });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
