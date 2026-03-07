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
  const kickoffId = url.searchParams.get('kickoffId');

  if (!kickoffId) {
    return sendJson(res, 400, { error: 'Missing kickoffId' });
  }

  try {
    const raw = await redis.get(`kickoff-deck:${kickoffId}`);
    if (!raw) {
      return sendJson(res, 200, { result: null });
    }
    const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sendJson(res, 200, { result });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
