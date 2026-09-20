// مدللني v11 — بوابة موحّدة للجلسة والجهاز الموثوق.
'use strict'
const { dal, getToken, verifyToken } = require('./_lib')

function failure(status, code) {
  const error = new Error(code)
  error.status = status
  error.code = code
  return error
}

async function requireActiveSession(req, options) {
  options = options || {}
  const payload = verifyToken(getToken(req))
  if (!payload || !payload.sub) throw failure(401, 'unauthorized')
  const profile = await dal.find('mdllni_profiles', { id: payload.sub })
  if (!profile) throw failure(401, 'unauthorized')
  if (profile.status !== 'active') throw failure(403, 'suspended')
  if (!payload.dv) throw failure(401, 'device_reauth_required')
  const device = await dal.find('mdllni_devices', {
    profile_id: profile.id,
    fingerprint: payload.dv,
    status: 'active',
  })
  if (!device) throw failure(401, 'device_revoked')
  const trustMs = Date.parse(String(device.trusted_until || ''))
  if (!Number.isFinite(trustMs) || trustMs <= Date.now()) throw failure(401, 'device_trust_expired')
  if (payload.limited && !options.allowLimited) throw failure(403, 'email_required')
  try {
    await dal.update('mdllni_devices', { id: device.id }, { last_seen: new Date().toISOString() })
  } catch (_) {}
  return { payload, profile, device }
}

module.exports = { requireActiveSession, failure }
