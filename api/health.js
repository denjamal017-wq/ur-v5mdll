// GET /api/health — lets the frontend detect cloud vs local mode.
const { cloudReady, cors, ENV } = require('./_lib')

module.exports = function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.statusCode = 200
  res.end(JSON.stringify({
    ok: true,
    mode: cloudReady ? 'cloud' : 'local',
    service: 'ur-platform',
    version: 'v8',
    // v8.0 — إعدادات عامة يحتاجها العميل قبل الدخول (مفاتيح علنية فقط، بلا أسرار)
    turnstileSiteKey: ENV.TURNSTILE_SITE_KEY || '',
    mailReady: !!ENV.MAIL_API_KEY,
    time: new Date().toISOString(),
  }))
}
