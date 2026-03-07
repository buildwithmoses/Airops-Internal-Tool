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
    if (!payload.kickoffId) {
      return sendJson(res, 400, { error: 'Missing kickoffId' });
    }

    // Trigger the deck prep agent on Trigger.dev
    const handle = await tasks.trigger('deckprep-with-updates', {
      aeName: payload.aeName,
      seName: payload.seName,
      csLead: payload.csLead,
      kickoffDate: payload.kickoffDate,
      notionContent: payload.notionContent,
      slackChannel: payload.slackChannel,
      slackThreadTs: payload.slackThreadTs,
      slackUserId: payload.slackUserId,
    });

    return sendJson(res, 200, { ok: true, runId: handle.id });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
