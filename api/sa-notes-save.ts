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
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    let body = '';
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', resolve);
    });

    const { saName, notes } = JSON.parse(body);
    if (!saName) {
      return sendJson(res, 400, { error: 'Missing saName' });
    }

    await Promise.all([
      redis.set(`sa-notes:${saName}`, notes || ''),
      redis.sadd('sa-notes:names', saName),
    ]);

    return sendJson(res, 200, { ok: true });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
