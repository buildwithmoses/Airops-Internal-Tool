const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...val] = c.trim().split('=');
    cookies[key] = val.join('=');
  });
  return cookies;
}

function getWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

// Known SA emails for matching attendees
const SA_EMAILS: Record<string, string> = {
  'aaron@airops.com': 'Aaron Lit',
  'aj@airops.com': 'AJ Diaz',
  'andreea.elena@airops.com': 'Andreea Volzer',
  'anton@airops.com': "Anton O'Malley",
  'arnett.shen@airops.com': 'Arnett Shen',
  'diana@airops.com': 'Diana Shiling',
  'elmi@airops.com': 'Elmi Abdullahi',
  'henry.moses@airops.com': 'Henry Moses Jr',
  'henry@airops.com': 'Henry Young',
  'jeremy@airops.com': 'Jeremy Kao',
  'joel@airops.com': 'Joel Fazecas',
  'john@airops.com': 'John Sellers',
  'melanie@airops.com': "Melanie Dell'Olio",
  'palmer@airops.com': 'Palmer Jones',
  'richard@airops.com': 'Richard Li',
  'shahbaz@airops.com': 'Shahbaz Mahmood',
  'will@airops.com': 'William Reed',
  'zoe@airops.com': 'Zoe Febrero',
};

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expiry: number } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;
  return { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) };
}

export default async function handler(req: any, res: any) {
  const cookies = parseCookies(req.headers.cookie || '');
  const tokenCookie = cookies['gcal_tokens'];

  if (!tokenCookie) {
    return sendJson(res, 401, { error: 'not_connected', message: 'Google Calendar not connected' });
  }

  let tokens: { access_token: string; refresh_token: string; expiry: number };
  try {
    tokens = JSON.parse(decodeURIComponent(tokenCookie));
  } catch {
    return sendJson(res, 401, { error: 'invalid_token', message: 'Invalid token cookie' });
  }

  // Refresh token if expired
  if (Date.now() > tokens.expiry - 60000 && tokens.refresh_token) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (refreshed) {
      tokens.access_token = refreshed.access_token;
      tokens.expiry = refreshed.expiry;
      // Update cookie with new access token
      const cookieValue = encodeURIComponent(JSON.stringify(tokens));
      res.setHeader('Set-Cookie', `gcal_tokens=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000`);
    }
  }

  try {
    // Search calendar for kickoff events from start of today through next 8 weeks
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const future = new Date();
    future.setDate(future.getDate() + 56); // 8 weeks

    // Search for multiple kickoff-related terms
    const searchTerms = ['kickoff', 'kick off', 'kick-off'];
    const allEvents: any[] = [];
    const seenIds = new Set<string>();

    for (const term of searchTerms) {
      const params = new URLSearchParams({
        q: term,
        timeMin: startOfToday.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      });

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );

      if (calRes.ok) {
        const calData = await calRes.json();
        for (const event of calData.items || []) {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            allEvents.push(event);
          }
        }
      }
    }

    const events = allEvents;

    // Parse events into kickoff format
    const kickoffs = events.map((event: any) => {
      const title = event.summary || '';
      const startDate = new Date(event.start?.dateTime || event.start?.date);
      const attendees = event.attendees || [];

      // Extract customer name from title
      // Common patterns: "Acme Corp - Kickoff", "Kickoff: Acme Corp", "Acme Corp Kickoff Call"
      let customerName = title
        .replace(/kick[-\s]?off/i, '')
        .replace(/call|meeting|sync/i, '')
        .replace(/^[\s\-:]+|[\s\-:]+$/g, '')
        .trim() || title;

      // Find SA from attendees
      let saName = '';
      let aeName = '';
      for (const att of attendees) {
        const email = (att.email || '').toLowerCase();
        if (SA_EMAILS[email]) {
          saName = SA_EMAILS[email];
        } else if (email.endsWith('@airops.com') && !SA_EMAILS[email]) {
          aeName = att.displayName || email.split('@')[0];
        }
      }

      return {
        id: event.id,
        customerName,
        saName,
        aeName,
        week: getWeekString(startDate),
        status: 'NOT STARTED' as const,
        tasks: [false, false, false, false, false, false, false],
        notes: '',
        booked: true,
        createdAt: Date.now(),
        eventDate: startDate.toISOString(),
        eventLink: event.htmlLink || '',
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return sendJson(res, 200, { kickoffs, connected: true });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
