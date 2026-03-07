import { tasks, runs } from '@trigger.dev/sdk/v3';
import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
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
  const action = getParams(req).get('action') || 'trigger';

  try {
    // GET: Fetch Slack users (no dependencies on Trigger.dev or Redis)
    if (action === 'slack-users') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return sendJson(res, 500, { error: 'SLACK_BOT_TOKEN not configured' });

      const members: { id: string; real_name: string }[] = [];
      let cursor = '';

      do {
        const url = new URL('https://slack.com/api/users.list');
        url.searchParams.set('limit', '200');
        if (cursor) url.searchParams.set('cursor', cursor);

        const resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();

        if (!data.ok) return sendJson(res, 502, { error: data.error || 'Slack API error' });

        for (const m of data.members) {
          if (m.deleted || m.is_bot || m.id === 'USLACKBOT') continue;
          members.push({ id: m.id, real_name: m.real_name || m.name });
        }

        cursor = data.response_metadata?.next_cursor || '';
      } while (cursor);

      members.sort((a, b) => a.real_name.localeCompare(b.real_name));
      return sendJson(res, 200, { users: members });
    }

    // POST: Trigger the deck prep agent
    if (action === 'trigger') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));
      if (!payload.kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

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
    }

    // GET: Poll run status
    if (action === 'status') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const params = getParams(req);
      const runId = params.get('runId');
      const kickoffId = params.get('kickoffId');
      if (!runId) return sendJson(res, 400, { error: 'Missing runId' });

      const run = await runs.retrieve(runId);

      if (run.status === 'COMPLETED' && run.output && kickoffId) {
        await getRedis().set(`kickoff-deck:${kickoffId}`, JSON.stringify(run.output));
      }

      return sendJson(res, 200, { status: run.status, output: run.output || null });
    }

    // GET: Fetch persisted deck result
    if (action === 'get-deck') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const kickoffId = getParams(req).get('kickoffId');
      if (!kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const raw = await getRedis().get(`kickoff-deck:${kickoffId}`);
      if (!raw) return sendJson(res, 200, { result: null });
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return sendJson(res, 200, { result });
    }

    return sendJson(res, 400, { error: `Unknown action: ${action}` });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
