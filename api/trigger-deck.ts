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

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

export default async function handler(req: any, res: any) {
  const action = getParams(req).get('action') || 'trigger';

  try {
    // GET: Fetch Slack users (no dependencies on Trigger.dev or Redis)
    if (action === 'slack-users') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return sendJson(res, 500, { error: 'SLACK_BOT_TOKEN not configured' });

      const members: { id: string; real_name: string; avatar: string }[] = [];
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
          members.push({ id: m.id, real_name: m.real_name || m.name, avatar: m.profile?.image_32 || '' });
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

      const { tasks } = await import('@trigger.dev/sdk/v3');
      const handle = await tasks.trigger('deckprep-with-updates', {
        aeName: payload.aeName,
        seName: payload.seName,
        csLead: payload.csLead,
        kickoffDate: payload.kickoffDate,
        notionContent: payload.notionContent,
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

      const { runs } = await import('@trigger.dev/sdk/v3');
      const run = await runs.retrieve(runId);

      if (run.status === 'COMPLETED' && run.output && kickoffId) {
        const redis = await getRedis();
        await redis.set(`kickoff-deck:${kickoffId}`, JSON.stringify(run.output));
      }

      return sendJson(res, 200, { status: run.status, output: run.output || null });
    }

    // POST: Trigger Slack channel creation
    if (action === 'trigger-slack') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));
      if (!payload.kickoffId || !payload.customerName) {
        return sendJson(res, 400, { error: 'Missing kickoffId or customerName' });
      }

      const { tasks } = await import('@trigger.dev/sdk/v3');
      const handle = await tasks.trigger('kickoff-slack-channels', {
        kickoffId: payload.kickoffId,
        customerName: payload.customerName,
        aeName: payload.aeName,
        saName: payload.saName,
        saLeadName: payload.saLeadName,
        kickoffDate: payload.kickoffDate,
        useCase: payload.useCase,
        pod: payload.pod,
      });

      return sendJson(res, 200, { ok: true, runId: handle.id });
    }

    // GET: Poll Slack channel creation status
    if (action === 'slack-status') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const params = getParams(req);
      const runId = params.get('runId');
      const kickoffId = params.get('kickoffId');
      if (!runId) return sendJson(res, 400, { error: 'Missing runId' });

      const { runs } = await import('@trigger.dev/sdk/v3');
      const run = await runs.retrieve(runId);

      if (run.status === 'COMPLETED' && run.output && kickoffId) {
        const redis = await getRedis();
        const output = run.output as any;

        // Update the kickoff with Slack channel data and auto-check task
        const raw = await redis.get(`kickoff:${kickoffId}`);
        if (raw) {
          const kickoff = typeof raw === 'string' ? JSON.parse(raw) : raw;
          kickoff.slackInternalChannelId = output.slackInternalChannelId || undefined;
          kickoff.slackExternalChannelId = output.slackExternalChannelId || undefined;
          kickoff.slackConnectInviteLink = output.slackConnectInviteLink || undefined;
          if (kickoff.tasks && kickoff.tasks.length > 7) {
            kickoff.tasks[7] = true; // Auto-check "Slack Channel Created"
          }
          await redis.set(`kickoff:${kickoffId}`, JSON.stringify(kickoff));
        }

        // Also persist slack result separately
        await redis.set(`kickoff-slack:${kickoffId}`, JSON.stringify(output));
      }

      return sendJson(res, 200, { status: run.status, output: run.output || null });
    }

    // GET: Fetch persisted deck result
    if (action === 'get-deck') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const kickoffId = getParams(req).get('kickoffId');
      if (!kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const redis = await getRedis();
      const raw = await redis.get(`kickoff-deck:${kickoffId}`);
      if (!raw) return sendJson(res, 200, { result: null });
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return sendJson(res, 200, { result });
    }

    // POST: Trigger internal meeting scheduling
    if (action === 'schedule-internal') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));
      if (!payload.kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const { tasks } = await import('@trigger.dev/sdk/v3');
      const handle = await tasks.trigger('kickoff-schedule-internal', {
        kickoffId: payload.kickoffId,
        customerName: payload.customerName,
        aeName: payload.aeName,
        aeEmail: payload.aeEmail,
        saName: payload.saName,
        saEmail: payload.saEmail,
        saLeadName: payload.saLeadName,
        saLeadEmail: payload.saLeadEmail,
        slackInternalChannelId: payload.slackInternalChannelId,
        timezone: payload.timezone,
      });

      // Update kickoff scheduling status in Redis
      const redis = await getRedis();
      const raw = await redis.get(`kickoff:${payload.kickoffId}`);
      if (raw) {
        const kickoff = typeof raw === 'string' ? JSON.parse(raw) : raw;
        kickoff.internalMeetingRunId = handle.id;
        kickoff.schedulingStatus = {
          ...(kickoff.schedulingStatus || {}),
          internal: 'finding_times',
        };
        await redis.set(`kickoff:${payload.kickoffId}`, JSON.stringify(kickoff));
      }

      return sendJson(res, 200, { ok: true, runId: handle.id });
    }

    // POST: Trigger external meeting scheduling
    if (action === 'schedule-external') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));
      if (!payload.kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const { tasks } = await import('@trigger.dev/sdk/v3');
      const handle = await tasks.trigger('kickoff-schedule-external', {
        kickoffId: payload.kickoffId,
        customerName: payload.customerName,
        aeName: payload.aeName,
        aeEmail: payload.aeEmail,
        saName: payload.saName,
        saEmail: payload.saEmail,
        slackInternalChannelId: payload.slackInternalChannelId,
        timezone: payload.timezone,
      });

      const redis = await getRedis();
      const raw = await redis.get(`kickoff:${payload.kickoffId}`);
      if (raw) {
        const kickoff = typeof raw === 'string' ? JSON.parse(raw) : raw;
        kickoff.externalMeetingRunId = handle.id;
        kickoff.schedulingStatus = {
          ...(kickoff.schedulingStatus || {}),
          external: 'finding_times',
        };
        await redis.set(`kickoff:${payload.kickoffId}`, JSON.stringify(kickoff));
      }

      return sendJson(res, 200, { ok: true, runId: handle.id });
    }

    // GET: Poll scheduling agent status
    if (action === 'schedule-status') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const params = getParams(req);
      const runId = params.get('runId');
      const kickoffId = params.get('kickoffId');
      const type = params.get('type'); // 'internal' or 'external'
      if (!runId) return sendJson(res, 400, { error: 'Missing runId' });

      const { runs } = await import('@trigger.dev/sdk/v3');
      const run = await runs.retrieve(runId);

      if (run.status === 'COMPLETED' && run.output && kickoffId) {
        const redis = await getRedis();
        const raw = await redis.get(`kickoff:${kickoffId}`);
        if (raw) {
          const kickoff = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const output = run.output as any;

          if (type === 'internal') {
            kickoff.internalMeetingTime = output.internalMeetingTime;
            kickoff.schedulingStatus = {
              ...(kickoff.schedulingStatus || {}),
              internal: 'confirmed',
            };
          } else if (type === 'external') {
            kickoff.externalMeetingTime = output.externalMeetingTime;
            kickoff.externalBookingLink = output.externalBookingLink;
            kickoff.schedulingStatus = {
              ...(kickoff.schedulingStatus || {}),
              external: output.externalMeetingTime ? 'confirmed' : 'waiting',
            };
          }

          await redis.set(`kickoff:${kickoffId}`, JSON.stringify(kickoff));
        }
      }

      // If agent posted times in Slack but hasn't confirmed yet, status is 'waiting'
      if (run.status === 'EXECUTING' && kickoffId) {
        const redis = await getRedis();
        const raw = await redis.get(`kickoff:${kickoffId}`);
        if (raw) {
          const kickoff = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const currentStatus = type === 'internal'
            ? kickoff.schedulingStatus?.internal
            : kickoff.schedulingStatus?.external;
          // Update to waiting if agent has been running for a bit (times posted)
          if (currentStatus === 'finding_times') {
            kickoff.schedulingStatus = {
              ...(kickoff.schedulingStatus || {}),
              [type as string]: 'waiting',
            };
            await redis.set(`kickoff:${kickoffId}`, JSON.stringify(kickoff));
          }
        }
      }

      return sendJson(res, 200, { status: run.status, output: run.output || null });
    }

    // GET: Fetch available booking slots (public, no auth)
    if (action === 'booking-slots') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const kickoffId = getParams(req).get('kickoffId');
      if (!kickoffId) return sendJson(res, 400, { error: 'Missing kickoffId' });

      const redis = await getRedis();
      const raw = await redis.get(`kickoff-booking:${kickoffId}`);
      if (!raw) return sendJson(res, 200, { slots: [], customerName: '', timezone: '' });

      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return sendJson(res, 200, {
        slots: (data as any).slots || [],
        customerName: (data as any).customerName || '',
        timezone: (data as any).timezone || 'ET',
      });
    }

    // POST: Client confirms a booking time (public, no auth)
    if (action === 'booking-confirm') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = JSON.parse(await readBody(req));

      if (!payload.kickoffId || !payload.selectedTime || !payload.clientName || !payload.clientEmail) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }

      const redis = await getRedis();
      const existing = await redis.get(`kickoff-booking:${payload.kickoffId}:confirmed`);
      if (existing) {
        return sendJson(res, 409, { error: 'This time slot has already been booked' });
      }

      await redis.set(`kickoff-booking:${payload.kickoffId}:confirmed`, JSON.stringify({
        selectedTime: payload.selectedTime,
        clientName: payload.clientName,
        clientEmail: payload.clientEmail,
        confirmedAt: new Date().toISOString(),
      }));

      return sendJson(res, 200, { ok: true });
    }

    // GET: Fetch closed-won HubSpot deals via Retool workflow
    if (action === 'hubspot-deals') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

      const resp = await fetch('https://api.retool.com/v1/workflows/14d7f618-5007-4fb1-a530-77f6adcaca28/startTrigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workflow-Api-Key': 'retool_wk_d03bac71efb14331876a63217c8ccd5a',
        },
        body: '{}',
      });

      const result = await resp.json();
      // Retool returns data array directly (already filtered for Closed Won deals)
      let deals: any[] = [];
      try {
        const allDeals = Array.isArray(result.data) ? result.data : [];
        // Only return name and amount (ARR) for dropdown efficiency
        deals = allDeals.map((d: any) => ({
          id: d.id,
          name: d.properties?.dealname || 'Unknown',
          amount: d.properties?.amount || '0',
        }));
      } catch {
        deals = [];
      }

      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return sendJson(res, 200, { deals });
    }

    // GET: Fetch AE list from HubSpot owners via Retool workflow
    if (action === 'hubspot-aes') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

      const resp = await fetch('https://api.retool.com/v1/workflows/14d7f618-5007-4fb1-a530-77f6adcaca28/startTrigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workflow-Api-Key': 'retool_wk_d03bac71efb14331876a63217c8ccd5a',
        },
        body: '{}',
      });

      const result = await resp.json();
      // Retool returns data array directly (HubSpot owner objects)
      let aes: any[] = [];
      try {
        const allData = Array.isArray(result.data) ? result.data : [];
        // Extract AE name and email from HubSpot owner properties
        aes = allData.map((a: any) => ({
          id: a.id,
          name: a.properties?.firstname && a.properties?.lastname
            ? `${a.properties.firstname} ${a.properties.lastname}`
            : a.properties?.email || 'Unknown',
          email: a.properties?.email || '',
        }));
      } catch {
        aes = [];
      }

      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return sendJson(res, 200, { aes });
    }

    return sendJson(res, 400, { error: `Unknown action: ${action}` });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
