const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    return res.end('<h1>Error: No authorization code</h1>');
  }

  const host = req.headers.host || 'airops-internal-tool-nine.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/google-callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.access_token) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    return res.end(`<h1>Error getting token</h1><pre>${JSON.stringify(tokens)}</pre>`);
  }

  // Store tokens in a cookie (httpOnly for security)
  const cookieValue = encodeURIComponent(JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry: Date.now() + (tokens.expires_in * 1000),
  }));

  res.writeHead(302, {
    'Set-Cookie': `gcal_tokens=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000`,
    Location: `${protocol}://${host}/?gcal=connected`,
  });
  res.end();
}
