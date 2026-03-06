export default function handler(req: any, res: any) {
  const host = req.headers.host || 'airops-internal-tool-nine.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';

  res.writeHead(302, {
    'Set-Cookie': 'gcal_tokens=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    Location: `${protocol}://${host}/`,
  });
  res.end();
}
