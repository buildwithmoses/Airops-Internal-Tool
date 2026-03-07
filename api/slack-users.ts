function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return sendJson(res, 500, { error: 'SLACK_BOT_TOKEN not configured' });
  }

  try {
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

      if (!data.ok) {
        return sendJson(res, 502, { error: data.error || 'Slack API error' });
      }

      for (const m of data.members) {
        if (m.deleted || m.is_bot || m.id === 'USLACKBOT') continue;
        members.push({ id: m.id, real_name: m.real_name || m.name });
      }

      cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);

    members.sort((a, b) => a.real_name.localeCompare(b.real_name));
    return sendJson(res, 200, { users: members });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
