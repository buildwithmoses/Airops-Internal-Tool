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
  try {
    const ids = await redis.smembers('kickoff:ids');

    if (!ids || ids.length === 0) {
      return sendJson(res, 200, { kickoffs: [] });
    }

    // Fetch all kickoffs in parallel
    const keys = ids.map((id: string) => `kickoff:${id}`);
    const results = await redis.mget(...keys);

    const kickoffs = results
      .filter((r: any) => r !== null)
      .map((r: any) => typeof r === 'string' ? JSON.parse(r) : r);

    return sendJson(res, 200, { kickoffs });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
