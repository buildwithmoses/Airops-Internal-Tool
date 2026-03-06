import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  try {
    // Scan for all sa-notes:* keys
    const notes: Record<string, string> = {};
    let cursor = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'sa-notes:*', count: 100 });
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await redis.mget(...keys);
        keys.forEach((key: string, i: number) => {
          const saName = key.replace('sa-notes:', '');
          notes[saName] = (values[i] as string) || '';
        });
      }
    } while (cursor !== 0);

    return sendJson(res, 200, { notes });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
