import { tasks } from '@trigger.dev/sdk/v3';

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

    const payload = JSON.parse(body);
    if (!payload.kickoffId || !payload.clientName) {
      return sendJson(res, 400, { error: 'Missing kickoffId or clientName' });
    }

    // Trigger the deck creation task on Trigger.dev
    const handle = await tasks.trigger('pre-kickoff-setup', {
      clientName: payload.clientName,
      aeName: payload.aeName,
      saName: payload.saName,
      week: payload.week,
    });

    return sendJson(res, 200, { ok: true, runId: handle.id });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
