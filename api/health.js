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
    service: 'mdllni',
    version: 'v9',
    // v9.0 — OTP يصدر من Supabase Auth نفسها: جاهز متى ما القاعدة مهيأة (cloudReady)
    otpReady: cloudReady,
    mailReady: cloudReady, // توافقية مع النسخ القديمة من الواجهة
    turnstileSiteKey: ENV.TURNSTILE_SITE_KEY || '',
    time: new Date().toISOString(),
  }))
}
