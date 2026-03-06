const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export default function handler(req: any, res: any) {
  const host = req.headers.host || 'airops-internal-tool-nine.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/google-callback`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}
