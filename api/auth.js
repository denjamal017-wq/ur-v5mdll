// مدللني v10 — كلمة مرور + OTP من Supabase Auth فقط + ثقة أجهزة متكيفة.
'use strict'
const { ENV, cloudReady, cors, json, readBody, dal, getToken, verifyToken, signToken, hashPassword, verifyPassword, verifyTurnstile, sha256, crypto } = require('./_lib')
const T = { profiles: 'mdllni_profiles', providers: 'mdllni_providers', devices: 'mdllni_devices', rates: 'mdllni_rate_limits', events: 'mdllni_security_events', notifications: 'mdllni_notifications' }
const OTP_DAYS = 10 / 1440
const TRUST_DAYS = 30
const ADMIN_TRUST_DAYS = 7
const MAX_DEVICES = 3
function fail(status, code, extra) { const e = new Error(code); e.status = status; e.code = code; if (extra) Object.assign(e, extra); throw e }
function phone(v) { let s = String(v || '').replace(/[^0-9+]/g, ''); if (s.startsWith('+964')) s = '0' + s.slice(4); else if (s.startsWith('964')) s = '0' + s.slice(3); return s }
function email(v) { return String(v || '').trim().toLowerCase() }
function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254 }
function deviceOk(v) { return /^[A-Za-z0-9._:-]{8,160}$/.test(String(v || '')) }
function ip(req) { return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim().slice(0, 80) }
function label(v, req) { return String(v || req.headers['user-agent'] || 'جهاز').replace(/[<>]/g, '').trim().slice(0, 120) }
function rid() { return crypto.randomBytes(18).toString('hex') }
function mask(v) { const p = String(v).split('@'); return p.length === 2 ? (p[0].slice(0, 2) || '*') + '***@' + p[1] : '' }
function safeProfile(p) { if (!p) return null; const x = Object.assign({}, p); delete x.pass_hash; delete x.devices; delete x.last_ip; delete x.auth_user_id; return x }
async function rateGet(key) { return await dal.find(T.rates, { key }) }
async function rateSet(key, count, first, items) { const old = await rateGet(key); const row = { count: Number(count || 0), first: Number(first || Date.now()), items: Array.isArray(items) ? items : [], updated_at: new Date().toISOString() }; if (old) await dal.update(T.rates, { key }, row); else await dal.insert(T.rates, Object.assign({ key }, row)); return row }
async function rateClear(key) { try { await dal.del(T.rates, { key }) } catch (_) {} }
async function event(kind, profileId, network, meta) { try { await dal.insert(T.events, { profile_id: profileId || null, kind, meta: meta || {}, ip: network || '', created_at: new Date().toISOString() }) } catch (_) {} }
async function notify(profileId, text) { try { await dal.insert(T.notifications, { user_id: profileId, icon: '🛡️', body: text, order_id: null, read: false, created_at: new Date().toISOString() }) } catch (_) {} }
async function ensureAdmin(targetPhone) {
  if (targetPhone !== ENV.ADMIN_PHONE) return
  if (await dal.find(T.profiles, { phone: targetPhone })) return
  if (!ENV.ADMIN_PASSWORD || ENV.ADMIN_PASSWORD.length < 8 || !emailOk(ENV.ADMIN_EMAIL)) fail(503, 'admin_not_configured')
  await dal.insert(T.profiles, { role: 'admin', name: ENV.ADMIN_NAME, phone: targetPhone, pass_hash: hashPassword(ENV.ADMIN_PASSWORD), area: 'الناصرية', status: 'active', devices: [], email: ENV.ADMIN_EMAIL, email_verified: false, last_ip: '', created_at: new Date().toISOString() })
}
async function supa(path, body) {
  const key = ENV.PUBLISHABLE_KEY || ENV.SERVICE_KEY
  if (!ENV.SUPABASE_URL || !key) fail(503, 'otp_not_configured')
  let r
  try { r = await fetch(ENV.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/' + path, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Client-Info': 'mdllni-server/10' }, body: JSON.stringify(body) }) } catch (_) { fail(503, 'otp_provider_unavailable') }
  const text = await r.text().catch(() => '')
  let data = {}; try { data = text ? JSON.parse(text) : {} } catch (_) {}
  return { ok: r.ok, status: r.status, data, retryAfter: Number(r.headers && r.headers.get && r.headers.get('retry-after') || 0) }
}
async function sendOtp(address, purpose, createUser) {
  const now = Date.now(), eh = sha256(address).slice(0, 24), cooldownKey = 'otp:cooldown:' + purpose + ':' + eh, dayKey = 'otp:day:' + eh
  const cd = await rateGet(cooldownKey)
  if (cd && now - Number(cd.first || 0) < 60000) fail(429, 'otp_cooldown', { retryAfter: Math.ceil((60000 - now + Number(cd.first)) / 1000) })
  let day = await rateGet(dayKey); if (!day || now - Number(day.first || 0) >= 86400000) day = { count: 0, first: now }
  if (Number(day.count || 0) >= 8) fail(429, 'otp_daily_limit')
  const out = await supa('otp', { email: address, create_user: !!createUser })
  if (!out.ok) { if (out.status === 429) fail(429, 'otp_provider_rate_limited', { retryAfter: out.retryAfter || 60 }); fail(503, 'otp_delivery_failed') }
  await rateSet(cooldownKey, 1, now, []); await rateSet(dayKey, Number(day.count || 0) + 1, Number(day.first || now), [])
}
function makePending(data) { return signToken(Object.assign({ scope: 'otp', jti: rid() }, data), OTP_DAYS) }
function pending(token, expected) { const p = verifyToken(token); if (!p || p.scope !== 'otp' || !p.jti || !p.e || expected && p.p !== expected) fail(401, 'otp_session_expired'); return p }
async function verifyOtp(p, code) {
  code = String(code || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(code)) fail(400, 'otp_invalid')
  const key = 'otp:attempt:' + p.jti, row = await rateGet(key), attempts = Number(row && row.count || 0)
  if (attempts >= 5) fail(429, 'otp_attempts_exhausted')
  const out = await supa('verify', { type: 'email', email: p.e, token: code })
  if (!out.ok) { await rateSet(key, attempts + 1, Number(row && row.first || Date.now()), []); if (out.status === 429) fail(429, 'otp_provider_rate_limited', { retryAfter: out.retryAfter || 60 }); fail(400, attempts + 1 >= 5 ? 'otp_attempts_exhausted' : 'otp_invalid') }
  const user = out.data && out.data.user
  if (!user || email(user.email) !== email(p.e)) fail(401, 'otp_identity_mismatch')
  await rateClear(key)
  return user
}
function loginKey(profileId, network) { return 'login:' + profileId + ':' + sha256(network || 'unknown').slice(0, 18) }
async function gate(profileId, network) { const row = await rateGet(loginKey(profileId, network)); if (!row) return { count: 0, until: 0 }; if (Date.now() - Number(row.first || 0) > 3600000) { await rateClear(loginKey(profileId, network)); return { count: 0, until: 0 } } return { count: Number(row.count || 0), until: Number(Array.isArray(row.items) && row.items[0] || 0) } }
async function badLogin(profileId, network) { const key = loginKey(profileId, network), now = Date.now(), old = await rateGet(key), fresh = old && now - Number(old.first || 0) <= 3600000, count = (fresh ? Number(old.count || 0) : 0) + 1; let wait = count >= 12 ? 3600000 : count >= 8 ? 900000 : count >= 5 ? 60000 : 0; await rateSet(key, count, fresh ? Number(old.first) : now, [wait ? now + wait : 0]); return count }
async function devices(profileId) { return await dal.all(T.devices, { profile_id: profileId }) }
async function activeDevice(profileId, fp) { return await dal.find(T.devices, { profile_id: profileId, fingerprint: fp, status: 'active' }) }
async function updateDevice(id, patch) { try { return await dal.update(T.devices, { id }, patch) } catch (e) { const minimal = {}; for (const k of ['status', 'label', 'last_seen', 'note']) if (Object.prototype.hasOwnProperty.call(patch, k)) minimal[k] = patch[k]; if (Object.keys(minimal).length) return await dal.update(T.devices, { id }, minimal); throw e } }
async function trustDevice(profile, fp, deviceLabel, req, network, reason) {
  if (!deviceOk(fp)) fail(400, 'bad_device')
  const now = new Date(), trustDays = profile.role === 'admin' ? ADMIN_TRUST_DAYS : TRUST_DAYS, until = new Date(now.getTime() + trustDays * 86400000).toISOString()
  const rows = await devices(profile.id); let current = rows.filter((d) => d.fingerprint === fp).sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0))[0]
  const otherActive = rows.filter((d) => d.status === 'active' && (!current || d.id !== current.id))
  if ((!current || current.status !== 'active') && otherActive.length >= MAX_DEVICES) { otherActive.sort((a, b) => new Date(a.last_seen || a.created_at || 0) - new Date(b.last_seen || b.created_at || 0)); await updateDevice(otherActive[0].id, { status: 'revoked', note: 'استبدل تلقائياً بجهاز أحدث', revoked_at: now.toISOString(), revoked_reason: 'automatic_rotation' }); await notify(profile.id, 'تم إلغاء أقدم جهاز غير مستخدم لأن الحد الأعلى ثلاثة أجهزة.'); await event('device_rotated', profile.id, network, { device_id: otherActive[0].id }) }
  const patch = { status: 'active', label: label(deviceLabel, req), last_seen: now.toISOString(), trusted_until: until, last_ip: network || '', user_agent_hash: sha256(req.headers['user-agent'] || '').slice(0, 40), risk_score: 0, note: reason || '', revoked_at: null, revoked_reason: '' }
  if (current) { await updateDevice(current.id, patch); current = Object.assign(current, patch) } else { try { current = await dal.insert(T.devices, Object.assign({ profile_id: profile.id, fingerprint: fp, created_at: now.toISOString() }, patch)) } catch (_) { current = await dal.insert(T.devices, { profile_id: profile.id, fingerprint: fp, label: patch.label, status: 'active', note: patch.note, created_at: now.toISOString(), last_seen: now.toISOString() }) } }
  const all = await devices(profile.id), fps = all.filter((d) => d.status === 'active').map((d) => d.fingerprint).slice(0, MAX_DEVICES)
  try { await dal.update(T.profiles, { id: profile.id }, { devices: fps, last_ip: network || profile.last_ip || '' }) } catch (_) {}
  try { const shared = (await dal.all(T.devices, { fingerprint: fp })).filter((d) => d.profile_id !== profile.id && d.status === 'active'); if (shared.length) await event('shared_device_verified', profile.id, network, { other_profiles: shared.length }) } catch (_) {}
  await event('device_trusted', profile.id, network, { device_id: current && current.id, trust_days: trustDays })
  return current
}
async function linkIdentity(profile, user, address) { const patch = { email: email(address), email_verified: true, auth_user_id: user.id }; try { await dal.update(T.profiles, { id: profile.id }, patch) } catch (_) { delete patch.auth_user_id; await dal.update(T.profiles, { id: profile.id }, patch) } return Object.assign(profile, patch) }
function session(profile, fp, limited) { return signToken({ sub: profile.id, role: profile.role, phone: profile.phone, dv: fp, limited: !!limited }) }
async function createRegistration(r) {
  if (await dal.find(T.profiles, { phone: r.phone })) fail(409, 'phone_taken')
  if (await dal.find(T.profiles, { email: r.email })) fail(409, 'email_taken')
  let profile = await dal.insert(T.profiles, { role: r.role, name: r.name, phone: r.phone, pass_hash: r.passHash, area: r.area, status: 'active', devices: [], email: r.email, email_verified: false, last_ip: r.ip || '', created_at: new Date().toISOString() })
  if (r.role === 'provider') {
    try { await dal.insert(T.providers, { profile_id: profile.id, service_id: r.serviceIds[0], service_ids: r.serviceIds, exp: r.exp, areas: r.areas, verified: 'pending', avail: true, rating_sum: 0, rating_count: 0, jobs: 0, balance: 0, settled: 0, sensitive: false, debt: 0, resp_sum: 0, resp_count: 0, drop_count: 0 }) }
    catch (e) { try { await dal.del(T.profiles, { id: profile.id }) } catch (_) {}; throw e }
  }
  return profile
}
async function register(res, b, req) {
  const network = ip(req), name = String(b.name || '').trim().slice(0, 100), p = phone(b.phone), e = email(b.email), pass = String(b.pass || ''), role = b.role === 'provider' ? 'provider' : 'customer', fp = String(b.deviceId || '')
  const serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds.map(String).slice(0, 3) : []
  if (name.length < 2 || !/^07\d{9}$/.test(p) || !emailOk(e) || pass.length < 8 || !deviceOk(fp) || role === 'provider' && !serviceIds.length) fail(400, 'bad_body')
  if (!(await verifyTurnstile(b.turnstileToken, network))) fail(403, 'human_check_failed')
  const byPhone = await dal.find(T.profiles, { phone: p }), byEmail = await dal.find(T.profiles, { email: e })
  if (byEmail && (!byPhone || byEmail.id !== byPhone.id)) fail(409, 'email_taken')
  if (byPhone && (email(byPhone.email) !== e || byPhone.email_verified || !verifyPassword(pass, byPhone.pass_hash))) fail(409, 'phone_taken')
  await sendOtp(e, 'register', true)
  const reg = byPhone ? null : { name, phone: p, email: e, passHash: hashPassword(pass), role, area: String(b.area || '').slice(0, 120), serviceIds, exp: Math.max(0, Math.min(80, Number(b.exp || 0))), areas: Array.isArray(b.areas) ? b.areas.map(String).slice(0, 20) : [], ip: network }
  const token = makePending({ p: 'register', sub: byPhone && byPhone.id || null, e, fp, label: label(b.deviceLabel, req), ip: network, reg })
  await event('registration_otp_sent', byPhone && byPhone.id, network, { role })
  return json(res, 200, { ok: true, needsOtp: true, pending: token, email: mask(e), purpose: 'register' })
}
async function login(res, b, req) {
  const network = ip(req), p = phone(b.phone), pass = String(b.pass || ''), fp = String(b.deviceId || '')
  if (!/^07\d{9}$/.test(p) || !pass || !deviceOk(fp)) fail(400, 'bad_body')
  await ensureAdmin(p)
  const profile = await dal.find(T.profiles, { phone: p }); if (!profile) fail(401, 'invalid_credentials')
  const state = await gate(profile.id, network); if (state.until > Date.now()) fail(429, 'login_cooldown', { retryAfter: Math.ceil((state.until - Date.now()) / 1000) })
  if (state.count >= 3 && !(await verifyTurnstile(b.turnstileToken, network))) fail(403, 'human_check_required')
  if (!verifyPassword(pass, profile.pass_hash)) { const count = await badLogin(profile.id, network); await event('login_bad_password', profile.id, network, { count }); fail(401, 'invalid_credentials') }
  if (profile.status !== 'active') fail(403, 'suspended')
  await rateClear(loginKey(profile.id, network))
  if (!profile.email) { await trustDevice(profile, fp, b.deviceLabel, req, network, 'جلسة محدودة لحين ربط البريد'); await event('login_email_binding_required', profile.id, network, {}); return json(res, 200, { ok: true, token: session(profile, fp, true), userId: profile.id, role: profile.role, needsEmail: true, limited: true }) }
  const known = await activeDevice(profile.id, fp), trusted = known && known.trusted_until && new Date(known.trusted_until).getTime() > Date.now()
  if (trusted && profile.email_verified) { await updateDevice(known.id, { last_seen: new Date().toISOString(), last_ip: network, label: label(b.deviceLabel, req) }); return json(res, 200, { ok: true, token: session(profile, fp, false), userId: profile.id, role: profile.role, trustedDevice: true }) }
  await sendOtp(profile.email, known ? 'login' : 'device', !profile.auth_user_id)
  const token = makePending({ p: known ? 'login' : 'device', sub: profile.id, e: email(profile.email), fp, label: label(b.deviceLabel, req), ip: network })
  await event('login_otp_sent', profile.id, network, { new_device: !known })
  return json(res, 200, { ok: true, needsOtp: true, pending: token, email: mask(profile.email), purpose: known ? 'login' : 'device', newDevice: !known })
}
async function completeRegistrationRate(profile, fp, network) { const now = Date.now(); for (const pair of [['device', sha256(fp).slice(0, 24)], ['network', sha256(network).slice(0, 24)]]) { const key = 'registration:' + pair[0] + ':' + pair[1], old = await rateGet(key), fresh = old && now - Number(old.first || 0) < 30 * 86400000, list = fresh && Array.isArray(old.items) ? old.items.slice() : []; if (!list.includes(profile.phone)) list.push(profile.phone); await rateSet(key, list.length, fresh ? Number(old.first) : now, list.slice(-12)); const threshold = pair[0] === 'device' ? 3 : 10; if (list.length > threshold) await event('registration_pattern_review', profile.id, network, { signal: pair[0], accounts_30d: list.length }) } }
async function verifyAction(res, b, req) {
  const p = pending(b.pending); if (!['register', 'login', 'device', 'bind'].includes(p.p)) fail(400, 'bad_purpose')
  const user = await verifyOtp(p, b.code)
  let profile
  if (p.p === 'register') profile = p.sub ? await dal.find(T.profiles, { id: p.sub }) : await createRegistration(p.reg || {})
  else profile = await dal.find(T.profiles, { id: p.sub })
  if (!profile) fail(404, 'not_registered')
  if (p.p === 'bind') { const actor = verifyToken(getToken(req)); if (!actor || actor.sub !== profile.id) fail(401, 'unauthorized'); const taken = await dal.find(T.profiles, { email: email(p.e) }); if (taken && taken.id !== profile.id) fail(409, 'email_taken') }
  profile = await linkIdentity(profile, user, p.e)
  const d = await trustDevice(profile, p.fp, p.label, req, ip(req), p.p === 'register' ? 'أول جهاز موثوق' : 'تحقق بريد ناجح')
  if (p.p === 'register') await completeRegistrationRate(profile, p.fp, p.ip || ip(req))
  await event('otp_verified', profile.id, ip(req), { purpose: p.p, device_id: d && d.id })
  return json(res, 200, { ok: true, verified: true, bound: p.p === 'bind', token: session(profile, p.fp, false), userId: profile.id, role: profile.role })
}
async function resend(res, b) { const p = pending(b.pending); if (!['register', 'login', 'device', 'bind', 'reset'].includes(p.p)) fail(400, 'bad_purpose'); const profile = p.sub ? await dal.find(T.profiles, { id: p.sub }) : null; await sendOtp(p.e, p.p, p.p === 'register' || p.p === 'bind' || !(profile && profile.auth_user_id)); const next = makePending({ p: p.p, sub: p.sub || null, e: p.e, fp: p.fp, label: p.label, ip: p.ip, reg: p.reg || null }); return json(res, 200, { ok: true, pending: next, email: mask(p.e), purpose: p.p }) }
async function bind(res, b, req) { const actor = verifyToken(getToken(req)); if (!actor) fail(401, 'unauthorized'); const profile = await dal.find(T.profiles, { id: actor.sub }); if (!profile) fail(401, 'unauthorized'); const e = email(b.email); if (!emailOk(e)) fail(400, 'bad_email'); const taken = await dal.find(T.profiles, { email: e }); if (taken && taken.id !== profile.id) fail(409, 'email_taken'); await sendOtp(e, 'bind', true); const fp = String(actor.dv || b.deviceId || ''); if (!deviceOk(fp)) fail(400, 'bad_device'); return json(res, 200, { ok: true, needsOtp: true, pending: makePending({ p: 'bind', sub: profile.id, e, fp, label: label(b.deviceLabel, req), ip: ip(req) }), email: mask(e), purpose: 'bind' }) }
async function forgot(res, b, req) { const p = phone(b.phone), fp = String(b.deviceId || ''); if (!/^07\d{9}$/.test(p) || !deviceOk(fp)) fail(400, 'bad_body'); const profile = await dal.find(T.profiles, { phone: p }); if (!profile || !profile.email) fail(404, 'reset_unavailable'); await sendOtp(profile.email, 'reset', !profile.auth_user_id); await event('password_reset_otp_sent', profile.id, ip(req), {}); return json(res, 200, { ok: true, needsOtp: true, pending: makePending({ p: 'reset', sub: profile.id, e: email(profile.email), fp, label: label(b.deviceLabel, req), ip: ip(req) }), email: mask(profile.email), purpose: 'reset' }) }
async function reset(res, b, req) { const p = pending(b.pending, 'reset'), next = String(b.newPass || ''); if (next.length < 8 || next.length > 200) fail(400, 'weak_password'); const user = await verifyOtp(p, b.code); let profile = await dal.find(T.profiles, { id: p.sub }); if (!profile) fail(404, 'not_registered'); profile = await linkIdentity(profile, user, p.e); await dal.update(T.profiles, { id: profile.id }, { pass_hash: hashPassword(next) }); for (const d of await devices(profile.id)) if (d.status === 'active' && d.fingerprint !== p.fp) await updateDevice(d.id, { status: 'revoked', note: 'تغيير كلمة المرور', revoked_at: new Date().toISOString(), revoked_reason: 'password_reset' }); await trustDevice(profile, p.fp, p.label, req, ip(req), 'إعادة تعيين آمنة'); await event('password_reset_completed', profile.id, ip(req), {}); return json(res, 200, { ok: true, token: session(profile, p.fp, false), userId: profile.id, role: profile.role }) }
async function me(res, req) { const actor = verifyToken(getToken(req)); if (!actor) fail(401, 'unauthorized'); const profile = await dal.find(T.profiles, { id: actor.sub }); if (!profile) fail(401, 'unauthorized'); const list = (await devices(profile.id)).map((d) => ({ id: d.id, label: d.label, status: d.status, created_at: d.created_at, last_seen: d.last_seen, trusted_until: d.trusted_until || null, current: d.fingerprint === actor.dv })); return json(res, 200, { ok: true, user: safeProfile(profile), devices: list }) }
async function revoke(res, b, req) { const actor = verifyToken(getToken(req)); if (!actor) fail(401, 'unauthorized'); const d = await dal.find(T.devices, { id: b.deviceId }); if (!d || d.profile_id !== actor.sub) fail(404, 'device_not_found'); await updateDevice(d.id, { status: 'revoked', note: 'ألغاه صاحب الحساب', revoked_at: new Date().toISOString(), revoked_reason: 'self_service' }); await event('device_self_revoked', actor.sub, ip(req), { device_id: d.id }); return json(res, 200, { ok: true, logout: d.fingerprint === actor.dv }) }
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }; if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' }); if (!cloudReady) return json(res, 503, { ok: false, error: 'cloud_not_configured' })
  try { const b = await readBody(req), a = String(b.action || ''); if (a === 'register') return await register(res, b, req); if (a === 'login') return await login(res, b, req); if (a === 'verifyOtp') return await verifyAction(res, b, req); if (a === 'resendOtp') return await resend(res, b); if (a === 'bindEmail') return await bind(res, b, req); if (a === 'forgotPassword') return await forgot(res, b, req); if (a === 'resetPassword') return await reset(res, b, req); if (a === 'me') return await me(res, req); if (a === 'revokeMyDevice') return await revoke(res, b, req); return json(res, 400, { ok: false, error: 'bad_action' }) }
  catch (e) { const out = { ok: false, error: e.code || e.message || 'server_error' }; if (e.retryAfter) out.retryAfter = e.retryAfter; return json(res, e.status || 500, out) }
}
