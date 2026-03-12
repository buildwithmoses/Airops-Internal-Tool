import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  // Allow public access (no auth required for booking pages)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

async function readBody(req: any): Promise<string> {
  let body = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', resolve);
  });
  return body;
}

function getParams(req: any) {
  return new URL(req.url, `http://${req.headers.host}`).searchParams;
}

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  const action = getParams(req).get('action') || 'slots';

  try {
    // GET: Fetch available booking slots for a kickoff
    if (action === 'slots') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const kickoffId = getParams(req).get('kickoffId');
      if (!kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const raw = await redis.get(`kickoff-booking:${kickoffId}`);
      if (!raw) return sendJson(res, 200, { slots: [], customerName: '', timezone: '' });

      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return sendJson(res, 200, {
        slots: data.slots || [],
        customerName: data.customerName || '',
        timezone: data.timezone || 'ET',
      });
    }

    // POST: Client confirms a booking time
    if (action === 'confirm') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));

      if (!payload.kickoffId || !payload.selectedTime || !payload.clientName || !payload.clientEmail) {
        return sendJson(res, 400, { error: 'Missing required fields: kickoffId, selectedTime, clientName, clientEmail' });
      }

      // Check if already confirmed
      const existing = await redis.get(`kickoff-booking:${payload.kickoffId}:confirmed`);
      if (existing) {
        return sendJson(res, 409, { error: 'This time slot has already been booked' });
      }

      // Save confirmation to Redis
      await redis.set(`kickoff-booking:${payload.kickoffId}:confirmed`, JSON.stringify({
        selectedTime: payload.selectedTime,
        clientName: payload.clientName,
        clientEmail: payload.clientEmail,
        confirmedAt: new Date().toISOString(),
      }));

      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: `Unknown action: ${action}` });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
