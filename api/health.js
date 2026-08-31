// GET /api/health — lets the frontend detect cloud vs local mode.
const { cloudReady, cors } = require('./_lib')

module.exports = function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.statusCode = 200
  res.end(JSON.stringify({
    ok: true,
    mode: cloudReady ? 'cloud' : 'local',
    service: 'ur-platform',
    version: 'v6',
    time: new Date().toISOString(),
  }))
}
