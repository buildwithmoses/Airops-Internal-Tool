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

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  const cookies = parseCookies(req.headers.cookie || '');
  const tokenCookie = cookies['gcal_tokens'];

  if (!tokenCookie) {
    return sendJson(res, 401, { authenticated: false });
  }

  let tokens: { access_token: string; refresh_token: string; expiry: number };
  try {
    tokens = JSON.parse(decodeURIComponent(tokenCookie));
  } catch {
    return sendJson(res, 401, { authenticated: false });
  }

  // Refresh token if expired
  if (Date.now() > tokens.expiry - 60000 && tokens.refresh_token) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const data = await refreshRes.json();
    if (data.access_token) {
      tokens.access_token = data.access_token;
      tokens.expiry = Date.now() + (data.expires_in * 1000);
      const cookieValue = encodeURIComponent(JSON.stringify(tokens));
      res.setHeader('Set-Cookie', `gcal_tokens=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000`);
    } else {
      return sendJson(res, 401, { authenticated: false });
    }
  }

  // Verify the token is still valid by fetching user info
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return sendJson(res, 401, { authenticated: false });
  }

  const userInfo = await userInfoRes.json();
  if (!userInfo.email || !userInfo.email.endsWith('@airops.com')) {
    return sendJson(res, 403, { authenticated: false, error: 'Not an @airops.com account' });
  }

  return sendJson(res, 200, {
    authenticated: true,
    user: {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    },
  });
}
