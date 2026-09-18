// POST /api/data — بوابة بيانات مدللني المربوطة بجهاز موثوق.
'use strict'
const { cors, json, readBody, dal, getToken, verifyToken } = require('./_lib')
const { snapshot, runAction } = require('./_engine')
module.exports = async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  try {
    const body = await readBody(req)
    const action = body.action || req.query && req.query.action || 'snapshot'
    const payload = verifyToken(getToken(req))
    let viewer = payload ? await dal.find('mdllni_profiles', { id: payload.sub }) : null
    // لا إعفاء للأدمن: إلغاء الجهاز يقتل جلسته مثل أي حساب.
    if (viewer && payload) {
      if (!payload.dv) return json(res, 401, { ok: false, error: 'device_reauth_required' })
      const device = await dal.find('mdllni_devices', { profile_id: viewer.id, fingerprint: payload.dv, status: 'active' })
      if (!device) return json(res, 401, { ok: false, error: 'device_revoked' })
      try { await dal.update('mdllni_devices', { id: device.id }, { last_seen: new Date().toISOString() }) } catch (_) {}
    }
    if (action === 'snapshot') return json(res, 200, { ok: true, db: await snapshot(viewer) })
    if (!viewer) return json(res, 401, { ok: false, error: 'unauthorized' })
    if (viewer.status !== 'active') return json(res, 403, { ok: false, error: 'suspended' })
    if (payload.limited) return json(res, 403, { ok: false, error: 'email_required' })
    const result = await runAction(viewer, action, body.payload || {})
    return json(res, 200, { ok: true, result, db: await snapshot(viewer) })
  } catch (e) { return json(res, e.status || 500, { ok: false, error: e.code || e.message || 'server_error' }) }
}
