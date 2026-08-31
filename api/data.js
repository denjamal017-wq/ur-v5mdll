// POST /api/data  { action: 'snapshot' | <mutation>, payload?: {...} }
//  - snapshot works with or without auth (public homepage), role-scoped.
//  - every mutation requires a valid Bearer token.
const { cors, json, readBody, dal, getToken, verifyToken } = require('./_lib')
const { snapshot, runAction, provisionAdmin } = require('./_engine')

module.exports = async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  try {
    await provisionAdmin()
    const body = await readBody(req)
    const action = body.action || (req.query && req.query.action) || 'snapshot'

    const payload = verifyToken(getToken(req))
    let viewer = null
    if (payload) viewer = await dal.find('ur_profiles', { id: payload.sub })

    if (action === 'snapshot') {
      const db = await snapshot(viewer)
      return json(res, 200, { ok: true, db })
    }

    if (!viewer) return json(res, 401, { ok: false, error: 'unauthorized' })
    if (viewer.status !== 'active') return json(res, 403, { ok: false, error: 'suspended' })

    const result = await runAction(viewer, action, body.payload || {})
    const db = await snapshot(viewer)
    return json(res, 200, { ok: true, result, db })
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e.code || e.message || 'server_error' })
  }
}
