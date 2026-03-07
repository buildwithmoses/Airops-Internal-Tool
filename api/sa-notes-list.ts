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
    // Get all SA names that have notes saved
    const saNames = await redis.smembers('sa-notes:names');

    if (!saNames || saNames.length === 0) {
      return sendJson(res, 200, { notes: {} });
    }

    const keys = saNames.map((name: string) => `sa-notes:${name}`);
    const values = await redis.mget(...keys);

    const notes: Record<string, string> = {};
    saNames.forEach((name: string, i: number) => {
      notes[name] = (values[i] as string) || '';
    });

    return sendJson(res, 200, { notes });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
