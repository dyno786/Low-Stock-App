// Vercel serverless function — api/log-access.js
// Captures real IP address from request headers
// Called by home.html on every login
// Stores to a Google Sheet via Apps Script webhook (optional)
// Returns IP + geo info back to the client

export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Get real IP from Vercel headers
  const ip =
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['cf-connecting-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  // Get body data from client
  const body = req.body || {};

  // Build log entry
  const entry = {
    ip,
    timestamp: new Date().toISOString(),
    role: body.role || 'unknown',
    device: body.device || 'unknown',
    userAgent: body.userAgent || '',
    screen: body.screen || '',
    timezone: body.timezone || '',
    language: body.language || '',
    page: body.page || 'home.html',
  };

  // Return IP info to client so it can be stored in localStorage too
  res.status(200).json({ success: true, ip, entry });
}
