'use strict'
const fs = require('fs')
const path = require('path')
const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const write = (p, s) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s) }
function replaceExact(text, oldText, newText, label) {
  const count = text.split(oldText).length - 1
  if (count !== 1) throw new Error(label + ': expected 1 exact match, found ' + count)
  return text.replace(oldText, newText)
}
function replaceRegex(text, regex, newText, label) {
  const matches = text.match(regex)
  if (!matches || matches.length !== 1) throw new Error(label + ': expected 1 regex match, found ' + (matches ? matches.length : 0))
  return text.replace(regex, newText)
}

write('api/_session.js', `// مدللني — centralized session/device trust guard.
'use strict'
const { dal, getToken, verifyToken } = require('./_lib')
function fail(status, code) { const e = new Error(code); e.status = status; e.code = code; throw e }
async function requireActiveSession(req, options) {
  options = options || {}
  const token = getToken(req)
  const payload = verifyToken(token)
  if (!payload || !payload.sub) fail(401, 'unauthorized')
  const profile = await dal.find('mdllni_profiles', { id: payload.sub })
  if (!profile) fail(401, 'unauthorized')
  if (profile.status !== 'active') fail(403, 'suspended')
  if (!payload.dv) fail(401, 'device_reauth_required')
  const device = await dal.find('mdllni_devices', { profile_id: profile.id, fingerprint: payload.dv, status: 'active' })
  if (!device) fail(401, 'device_revoked')
  const trustedUntil = Date.parse(String(device.trusted_until || ''))
  if (!Number.isFinite(trustedUntil) || trustedUntil <= Date.now()) fail(401, 'device_trust_expired')
  if (payload.limited && !options.allowLimited) fail(403, 'email_required')
  try { await dal.update('mdllni_devices', { id: device.id }, { last_seen: new Date().toISOString() }) } catch (_) {}
  return { token, payload, profile, device }
}
module.exports = { requireActiveSession }
`)

write('api/_snapshot.js', `// مدللني — snapshot privacy boundary.
'use strict'
function publicProvider(user, self) {
  const out = Object.assign({}, user)
  delete out.pass
  delete out.email
  delete out.auth_user_id
  delete out.devices
  delete out.lastIp
  if (!self) out.phone = ''
  if (out.provider) {
    out.provider = Object.assign({}, out.provider)
    if (!self) {
      delete out.provider.balance
      delete out.provider.settled
      delete out.provider.debt
      delete out.provider.rejectReason
      delete out.provider.adminNote
    }
  }
  return out
}
function sanitizeSnapshot(db, viewer) {
  db = Object.assign({}, db || {})
  if (viewer && viewer.role === 'admin') return db
  const orders = Array.isArray(db.orders) ? db.orders : []
  const related = new Set(viewer ? [viewer.id] : [])
  if (viewer && viewer.role === 'provider') for (const o of orders) if (o.customerId) related.add(o.customerId)
  const users = Array.isArray(db.users) ? db.users : []
  db.users = users.filter((u) => {
    if (!u) return false
    if (viewer && u.id === viewer.id) return true
    if (u.role === 'provider') return u.status === 'active' && (!u.provider || u.provider.verified === 'approved')
    return !!(viewer && viewer.role === 'provider' && related.has(u.id))
  }).map((u) => publicProvider(u, !!(viewer && u.id === viewer.id)))
  if (!viewer) db.orders = []
  else if (viewer.role === 'customer') db.orders = orders.filter((o) => o.customerId === viewer.id)
  db.audit = []
  if (Array.isArray(db.ledger)) db.ledger = viewer && viewer.role === 'provider' ? db.ledger.filter((x) => x.providerId === viewer.id || x.provider_id === viewer.id) : []
  if (Array.isArray(db.payouts)) db.payouts = viewer && viewer.role === 'provider' ? db.payouts.filter((x) => x.providerId === viewer.id || x.provider_id === viewer.id) : []
  if (Array.isArray(db.security)) db.security = viewer ? db.security.filter((x) => x.profileId === viewer.id || x.profile_id === viewer.id) : []
  if (Array.isArray(db.devices)) db.devices = viewer ? db.devices.filter((x) => x.profileId === viewer.id || x.profile_id === viewer.id) : []
  return db
}
module.exports = { sanitizeSnapshot }
`)

let lib = read('api/_lib.js')
lib = replaceRegex(lib, /function tableCandidates\(name\) \{[\s\S]*?\n\}/, "function tableCandidates(name) { return [name] }", 'tableCandidates')
lib = replaceRegex(lib, /function rpcCandidates\(name\) \{[\s\S]*?\n\}/, "function rpcCandidates(name) { return [name] }", 'rpcCandidates')
lib = lib.replace("ENV.JWT_SECRET.length < 24", "ENV.JWT_SECRET.length < 32")
lib = replaceRegex(lib, /function cors\(res\) \{[^\n]*\}/, `function cors(res, req) {
  const origin = String(req && req.headers && req.headers.origin || '')
  const allowed = String(process.env.APP_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
}`, 'cors')
lib = replaceRegex(lib, /async function readBody\(req\) \{[\s\S]*?\n\}/, `async function readBody(req) {
  const parse = (raw) => { try { return raw ? JSON.parse(raw) : {} } catch (_) { const e = new Error('bad_json'); e.status = 400; e.code = 'bad_json'; throw e } }
  if (req.body != null) {
    if (typeof req.body === 'string') { if (Buffer.byteLength(req.body) > 262144) { const e = new Error('body_too_large'); e.status = 413; e.code = 'body_too_large'; throw e } return parse(req.body) }
    return req.body
  }
  return await new Promise((resolve, reject) => {
    let d = '', done = false
    req.on('data', (c) => { if (done) return; d += c; if (Buffer.byteLength(d) > 262144) { done = true; const e = new Error('body_too_large'); e.status = 413; e.code = 'body_too_large'; reject(e); if (req.destroy) req.destroy() } })
    req.on('end', () => { if (!done) { try { resolve(parse(d)) } catch (e) { reject(e) } } })
    req.on('error', (e) => { if (!done) reject(e) })
  })
}`, 'readBody')
write('api/_lib.js', lib)

let auth = read('api/auth.js')
auth = auth.replace("const { ENV, cloudReady, cors, json, readBody, dal, getToken, verifyToken, signToken, hashPassword, verifyPassword, verifyTurnstile, sha256, crypto } = require('./_lib')", "const { ENV, cloudReady, cors, json, readBody, dal, getToken, verifyToken, signToken, hashPassword, verifyPassword, verifyTurnstile, sha256, crypto } = require('./_lib')\nconst { requireActiveSession } = require('./_session')")
auth = auth.replace("const key = ENV.PUBLISHABLE_KEY || ENV.SERVICE_KEY", "const key = ENV.PUBLISHABLE_KEY")
auth = replaceRegex(auth, /async function linkIdentity\(profile, user, address\) \{[^\n]*\}/, "async function linkIdentity(profile, user, address) { if (!user || !user.id) fail(401, 'otp_identity_mismatch'); const patch = { email: email(address), email_verified: true, auth_user_id: user.id }; const rows = await dal.update(T.profiles, { id: profile.id }, patch); if (!rows || !rows.length) fail(409, 'identity_link_failed'); return Object.assign(profile, patch) }", 'linkIdentity')
auth = replaceRegex(auth, /function session\(profile, fp, limited\) \{[^\n]*\}/, "function session(profile, fp, limited) { const days = profile.role === 'admin' ? ADMIN_TRUST_DAYS : TRUST_DAYS; return signToken({ sub: profile.id, role: profile.role, phone: profile.phone, dv: fp, limited: !!limited }, days) }", 'session')
auth = replaceRegex(auth, /function loginKey\(profileId, network\) \{[\s\S]*?async function devices/, `function loginKeys(profileId, network) { return ['login:account:' + profileId, 'login:network:' + sha256(network || 'unknown').slice(0, 18)] }
async function rateBump(key, windowMs) {
  try { const out = await dal.rpc('mdllni_rate_bump', { p_key: key, p_now_ms: Date.now(), p_window_ms: windowMs }); if (out && typeof out === 'object') return out } catch (_) {}
  const old = await rateGet(key), now = Date.now(), fresh = old && now - Number(old.first || 0) < windowMs
  return await rateSet(key, (fresh ? Number(old.count || 0) : 0) + 1, fresh ? Number(old.first) : now, old && old.items || [])
}
async function gate(profileId, network) {
  const rows = await Promise.all(loginKeys(profileId, network).map(rateGet)); let count = 0, until = 0
  for (const row of rows) { if (!row || Date.now() - Number(row.first || 0) > 3600000) continue; count = Math.max(count, Number(row.count || 0)); until = Math.max(until, Number(Array.isArray(row.items) && row.items[0] || 0)) }
  return { count, until }
}
async function badLogin(profileId, network) {
  const now = Date.now(); let max = 0
  for (const key of loginKeys(profileId, network)) { const row = await rateBump(key, 3600000), count = Number(row.count || 0); max = Math.max(max, count); const wait = count >= 12 ? 3600000 : count >= 8 ? 900000 : count >= 5 ? 60000 : 0; await rateSet(key, count, Number(row.first || now), [wait ? now + wait : 0]) }
  return max
}
async function clearLogin(profileId, network) { for (const key of loginKeys(profileId, network)) await rateClear(key) }
async function devices`, 'login rate block')
auth = auth.replace("await rateClear(loginKey(profile.id, network))", "await clearLogin(profile.id, network)")
auth = replaceRegex(auth, /async function verifyAction\(res, b, req\) \{[\s\S]*?\n\}/, `async function verifyAction(res, b, req) {
  const p = pending(b.pending); if (!['register', 'login', 'device', 'bind'].includes(p.p)) fail(400, 'bad_purpose')
  let boundSession = null
  if (p.p === 'bind') { boundSession = await requireActiveSession(req, { allowLimited: true }); if (boundSession.profile.id !== p.sub || boundSession.payload.dv !== p.fp) fail(401, 'unauthorized') }
  const user = await verifyOtp(p, b.code)
  let profile
  if (p.p === 'register') profile = p.sub ? await dal.find(T.profiles, { id: p.sub }) : await createRegistration(p.reg || {})
  else profile = await dal.find(T.profiles, { id: p.sub })
  if (!profile) fail(404, 'not_registered')
  if (p.p === 'bind') { const taken = await dal.find(T.profiles, { email: email(p.e) }); if (taken && taken.id !== profile.id) fail(409, 'email_taken') }
  profile = await linkIdentity(profile, user, p.e)
  const d = await trustDevice(profile, p.fp, p.label, req, ip(req), p.p === 'register' ? 'أول جهاز موثوق' : 'تحقق بريد ناجح')
  if (p.p === 'register') await completeRegistrationRate(profile, p.fp, p.ip || ip(req))
  await event('otp_verified', profile.id, ip(req), { purpose: p.p, device_id: d && d.id })
  return json(res, 200, { ok: true, verified: true, bound: p.p === 'bind', token: session(profile, p.fp, false), userId: profile.id, role: profile.role })
}`, 'verifyAction')
auth = replaceRegex(auth, /async function resend\(res, b\) \{[^\n]*\}/, "async function resend(res, b, req) { const p = pending(b.pending); if (!['register', 'login', 'device', 'bind', 'reset'].includes(p.p)) fail(400, 'bad_purpose'); if (p.p === 'bind') { const s = await requireActiveSession(req, { allowLimited: true }); if (s.profile.id !== p.sub || s.payload.dv !== p.fp) fail(401, 'unauthorized') }; const profile = p.sub ? await dal.find(T.profiles, { id: p.sub }) : null; await sendOtp(p.e, p.p, p.p === 'register' || p.p === 'bind' || !(profile && profile.auth_user_id)); const next = makePending({ p: p.p, sub: p.sub || null, e: p.e, fp: p.fp, label: p.label, ip: p.ip, reg: p.reg || null }); return json(res, 200, { ok: true, pending: next, email: mask(p.e), purpose: p.p }) }", 'resend')
auth = replaceRegex(auth, /async function bind\(res, b, req\) \{[^\n]*\}/, "async function bind(res, b, req) { const s = await requireActiveSession(req, { allowLimited: true }); const profile = s.profile; const e = email(b.email); if (!emailOk(e)) fail(400, 'bad_email'); const taken = await dal.find(T.profiles, { email: e }); if (taken && taken.id !== profile.id) fail(409, 'email_taken'); await sendOtp(e, 'bind', true); const fp = String(s.payload.dv || ''); return json(res, 200, { ok: true, needsOtp: true, pending: makePending({ p: 'bind', sub: profile.id, e, fp, label: label(b.deviceLabel, req), ip: ip(req) }), email: mask(e), purpose: 'bind' }) }", 'bind')
auth = replaceRegex(auth, /async function me\(res, req\) \{[^\n]*\}/, "async function me(res, req) { const s = await requireActiveSession(req, { allowLimited: true }); const list = (await devices(s.profile.id)).map((d) => ({ id: d.id, label: d.label, status: d.status, created_at: d.created_at, last_seen: d.last_seen, trusted_until: d.trusted_until || null, current: d.fingerprint === s.payload.dv })); return json(res, 200, { ok: true, user: safeProfile(s.profile), devices: list }) }", 'me')
auth = replaceRegex(auth, /async function revoke\(res, b, req\) \{[^\n]*\}/, "async function revoke(res, b, req) { const s = await requireActiveSession(req, { allowLimited: true }); const d = await dal.find(T.devices, { id: b.deviceId }); if (!d || d.profile_id !== s.profile.id) fail(404, 'device_not_found'); await updateDevice(d.id, { status: 'revoked', note: 'ألغاه صاحب الحساب', revoked_at: new Date().toISOString(), revoked_reason: 'self_service' }); await event('device_self_revoked', s.profile.id, ip(req), { device_id: d.id }); return json(res, 200, { ok: true, logout: d.fingerprint === s.payload.dv }) }", 'revoke')
auth = auth.replace("cors(res);", "cors(res, req);")
auth = auth.replace("return await resend(res, b);", "return await resend(res, b, req);")
write('api/auth.js', auth)

write('api/data.js', `// POST /api/data — بوابة بيانات مدللني.
'use strict'
const { cors, json, readBody, getToken } = require('./_lib')
const { requireActiveSession } = require('./_session')
const { sanitizeSnapshot } = require('./_snapshot')
const { snapshot, runAction } = require('./_engine')
module.exports = async function handler(req, res) {
  cors(res, req)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  try {
    const body = await readBody(req)
    const action = body.action || req.query && req.query.action || 'snapshot'
    let viewer = null, session = null
    if (getToken(req)) { session = await requireActiveSession(req, { allowLimited: action === 'snapshot' }); viewer = session.profile }
    if (action === 'snapshot') return json(res, 200, { ok: true, db: sanitizeSnapshot(await snapshot(viewer), viewer) })
    if (!viewer) return json(res, 401, { ok: false, error: 'unauthorized' })
    if (session.payload.limited) return json(res, 403, { ok: false, error: 'email_required' })
    if (action === 'changePassword') return json(res, 400, { ok: false, error: 'password_change_requires_otp' })
    const result = await runAction(viewer, action, body.payload || {})
    return json(res, 200, { ok: true, result, db: sanitizeSnapshot(await snapshot(viewer), viewer) })
  } catch (e) { return json(res, e.status || 500, { ok: false, error: e.code || e.message || 'server_error' }) }
}
`)

let engine = read('api/_engine.js')
engine = engine.replaceAll('ur_', 'mdllni_').replaceAll("'UR-", "'MD-")
engine = replaceExact(engine, "    try {\n      return await dal.rpc('mdllni_apply_debt', {", "    return await dal.rpc('mdllni_apply_debt', {", 'financial RPC try')
engine = replaceExact(engine, "      })\n    } catch (_) { /* fall through for legacy/offline test clients */ }\n  }", "      })\n  }", 'financial RPC fallback')
engine = replaceRegex(engine, /if \(existing\) \{\n    if \(existing\.role !== 'admin' \|\| existing\.status !== 'active'\) \{\n      try \{ await dal\.update\('mdllni_profiles',[\s\S]*?\n    return existing\n  \}/, "if (existing) { _adminProvisioned = true; return existing.role === 'admin' ? existing : null }", 'admin reactivation')
engine = engine.replace("need(['accepted','enroute','started'].includes(o.status), 'order_unavailable')", "need(['accepted','enroute','started'].includes(o.status), 'order_unavailable')\n      need(o.status !== 'started', 'started_drop_requires_dispute')")
engine = engine.replace(/String\(p\.newPass \|\| ''\)\.length >= 6/g, "String(p.newPass || '').length >= 8")
write('api/_engine.js', engine)

let app = read('js/app.js')
app = app.replace("const DB_KEY='ur5_db';", "const DB_KEY='mdllni_cache_v11';")
app = replaceRegex(app, /    users:\[\{[\s\S]*?\n    \}\],\n    session:null,/, "    users:[],\n    session:null,", 'seeded admin')
app = replaceRegex(app, /function doRegister\(\)\{[\s\S]*?\n\}\nfunction doLogin\(\)\{[\s\S]*?\n\}\nfunction logout/, "function doRegister(){ toast('الاتصال الآمن بالخادم مطلوب للتسجيل'); }\nfunction doLogin(){ toast('الاتصال الآمن بالخادم مطلوب للدخول'); }\nfunction logout", 'local auth')
app = app.replace(/pass\.length<6/g, 'pass.length<8').replace(/6 أحرف/g, '8 أحرف')
app = app.replaceAll('ur-admin-2026', 'disabled-local-auth').replaceAll('07800000000', '07000000000')
write('js/app.js', app)

let cloud = read('js/cloud.js')
cloud = cloud.replaceAll("'ur6_token'", "'mdllni_token'").replaceAll("'__ur_did__'", "'__mdllni_device__'").replaceAll('UR_PLATFORM_DEVICE_FP', 'MDLLNI_DEVICE_ID').replaceAll('UR v6', 'مدللني v11').replace(/length<6/g, 'length<8').replace(/6 أحرف/g, '8 أحرف')
cloud = replaceRegex(cloud, /function bootLocal\(\)\{[\s\S]*?\n  \}\n\n  \/\/ ---- BOOT/, `function bootLocal(){
    window.MODE='offline'
    try { if (DB) { DB.session=null; DB.users=[]; DB.orders=[]; DB.messages=[]; DB.notes=[]; DB.tickets=[]; DB.payouts=[]; DB.audit=[] } } catch (_) {}
    render()
    toast('تعذر الاتصال الآمن. لم يتم عرض بيانات محلية أو وهمية؛ أعد المحاولة.')
  }

  // ---- BOOT`, 'bootLocal')
cloud = replaceRegex(cloud, /window\.MODE='cloud';[\s\S]*?refresh\(\)\.then\(function\(\)\{ render\(\);[\s\S]*?bootLocal\(\) \}\)\n  \}\)/, `window.MODE='connecting'; loadToken(); installCloud(); installModePill()
  refresh().then(function(){ window.MODE='cloud'; render(); try{ setTimeout(installModePill,0) }catch(_){} }).catch(function(e){ console.error('Secure cloud unavailable',e); bootLocal() })
  })`, 'cloud boot')
write('js/cloud.js', cloud)

let patch = read('js/cloud-patch.js')
patch = patch.replace("device_revoked:'تم إلغاء هذا الجهاز. سجّل الدخول وحقّق البريد من جديد.'", "device_revoked:'تم إلغاء هذا الجهاز. سجّل الدخول وحقّق البريد من جديد.',device_trust_expired:'انتهت مدة الثقة بهذا الجهاز. سجّل الدخول وسيصلك رمز بريد جديد.',password_change_requires_otp:'تغيير كلمة المرور يتم حصراً من استعادة الحساب برمز البريد.'")
patch = patch.replaceAll('v10', 'v11')
write('js/cloud-patch.js', patch)

let index = read('index.html').replaceAll('v=10.0.0', 'v=11.0.0')
write('index.html', index)
let health = read('api/health.js').replace("cors(res)", "cors(res, req)").replace("version: 'v10'", "version: 'v11'")
write('api/health.js', health)

write('package.json', JSON.stringify({ name:'mdllni', version:'11.0.0', private:true, description:'مدللني — منصة خدمات الناصرية الآمنة', type:'commonjs', engines:{node:'>=18'}, scripts:{test:'node test/security-v11.js'} }, null, 2) + '\n')
write('package-lock.json', JSON.stringify({ name:'mdllni', version:'11.0.0', lockfileVersion:3, requires:true, packages:{'':{name:'mdllni',version:'11.0.0',engines:{node:'>=18'}}} }, null, 2) + '\n')
if (fs.existsSync(path.join(root,'test/security-v8.js'))) fs.rmSync(path.join(root,'test/security-v8.js'))
if (fs.existsSync(path.join(root,'test/security-v10.js'))) fs.rmSync(path.join(root,'test/security-v10.js'))

let schema = read('supabase/schema.sql').replaceAll('ur_', 'mdllni_').replaceAll('UR-', 'MD-')
schema = schema.replace(/create table if not exists mdllni_email_otps \([\s\S]*?\n\);\n/gi, '')
schema = schema.replace(/^.*mdllni_email_otps.*$/gmi, '')
schema = schema.replace(/^.*mdllni_devices_active_fp.*$/gmi, '')
schema += `

-- v16 final hardening for fresh installs
alter table public.mdllni_profiles add column if not exists auth_user_id uuid;
alter table public.mdllni_devices add column if not exists trusted_until timestamptz;
alter table public.mdllni_devices add column if not exists last_ip text not null default '';
alter table public.mdllni_devices add column if not exists user_agent_hash text not null default '';
alter table public.mdllni_devices add column if not exists risk_score int not null default 0;
alter table public.mdllni_devices add column if not exists revoked_at timestamptz;
alter table public.mdllni_devices add column if not exists revoked_reason text not null default '';
create unique index if not exists mdllni_profiles_auth_user_uniq on public.mdllni_profiles(auth_user_id) where auth_user_id is not null;
create unique index if not exists mdllni_profiles_email_lower_uniq on public.mdllni_profiles(lower(email)) where email is not null;
create unique index if not exists mdllni_devices_profile_fp_active on public.mdllni_devices(profile_id,fingerprint) where status='active';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='mdllni_profiles_auth_user_id_fkey') then alter table public.mdllni_profiles add constraint mdllni_profiles_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='mdllni_profiles_verified_identity_check') then alter table public.mdllni_profiles add constraint mdllni_profiles_verified_identity_check check (not email_verified or (email is not null and auth_user_id is not null)) not valid; end if;
end $$;
create or replace function public.mdllni_rate_bump(p_key text,p_now_ms bigint,p_window_ms bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mdllni_rate_limits%rowtype;
begin
  insert into public.mdllni_rate_limits as x(key,count,first,items,updated_at) values(p_key,1,p_now_ms,'[]'::jsonb,now())
  on conflict(key) do update set count=case when p_now_ms-x.first>=p_window_ms then 1 else x.count+1 end, first=case when p_now_ms-x.first>=p_window_ms then p_now_ms else x.first end, updated_at=now()
  returning * into r;
  return jsonb_build_object('count',r.count,'first',r.first,'items',coalesce(r.items,'[]'::jsonb));
end $$;
revoke all on function public.mdllni_rate_bump(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.mdllni_rate_bump(text,bigint,bigint) to service_role;
do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' and tablename like 'mdllni\\_%' escape '\\' loop execute format('alter table public.%I enable row level security',r.tablename); execute format('revoke all on table public.%I from anon,authenticated',r.tablename); end loop; end $$;
`
write('supabase/schema.sql', schema)

const migrationName = 'supabase/migrations/20260918194500_v16_mdllni_session_financial_hardening.sql'
write(migrationName, `-- v16 — session, identity, rate-limit, and index hardening.
drop index if exists public.mdllni_profiles_email_uniq;
create unique index if not exists mdllni_profiles_email_lower_uniq on public.mdllni_profiles(lower(email)) where email is not null;
create or replace function public.mdllni_rate_bump(p_key text,p_now_ms bigint,p_window_ms bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mdllni_rate_limits%rowtype;
begin
  insert into public.mdllni_rate_limits as x(key,count,first,items,updated_at) values(p_key,1,p_now_ms,'[]'::jsonb,now())
  on conflict(key) do update set count=case when p_now_ms-x.first>=p_window_ms then 1 else x.count+1 end, first=case when p_now_ms-x.first>=p_window_ms then p_now_ms else x.first end, updated_at=now()
  returning * into r;
  return jsonb_build_object('count',r.count,'first',r.first,'items',coalesce(r.items,'[]'::jsonb));
end $$;
revoke all on function public.mdllni_rate_bump(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.mdllni_rate_bump(text,bigint,bigint) to service_role;
`)

let vercel = JSON.parse(read('vercel.json'))
vercel.headers = vercel.headers || []
const headerEntry = vercel.headers.find((x) => x.source === '/(.*)') || { source:'/(.*)', headers:[] }
if (!vercel.headers.includes(headerEntry)) vercel.headers.push(headerEntry)
const secure = { 'Strict-Transport-Security':'max-age=63072000; includeSubDomains', 'Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" }
for (const [key,value] of Object.entries(secure)) { const h=headerEntry.headers.find((x)=>x.key.toLowerCase()===key.toLowerCase()); if(h) h.value=value; else headerEntry.headers.push({key,value}) }
write('vercel.json', JSON.stringify(vercel,null,2)+'\n')

write('test/security-v11.js', `'use strict'
const fs=require('fs'),path=require('path'),assert=require('assert')
const root=path.join(__dirname,'..');let n=0
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
function test(name,fn){try{fn();n++;console.log('✓',name)}catch(e){console.error('✗',name,'\\n ',e.message);process.exitCode=1}}
const auth=read('api/auth.js'),data=read('api/data.js'),session=read('api/_session.js'),snap=read('api/_snapshot.js'),engine=read('api/_engine.js'),app=read('js/app.js'),cloud=read('js/cloud.js'),schema=read('supabase/schema.sql'),migration=read('supabase/migrations/20260918194500_v16_mdllni_session_financial_hardening.sql'),vercel=read('vercel.json'),pkg=require('../package.json')
process.env.JWT_SECRET='x'.repeat(64);const lib=require('../api/_lib')
test('salted password hashing',()=>{const a=lib.hashPassword('Password123!'),b=lib.hashPassword('Password123!');assert.notStrictEqual(a,b);assert(lib.verifyPassword('Password123!',a));assert(!lib.verifyPassword('wrong',a))})
test('signed session tamper rejection',()=>{const t=lib.signToken({sub:'u',dv:'d'},1);assert(lib.verifyToken(t));assert.strictEqual(lib.verifyToken(t.slice(0,-1)+'x'),null)})
test('trusted-until enforced centrally',()=>{assert(session.includes('device_trust_expired'));assert(session.includes('trustedUntil <= Date.now()'))})
test('sensitive auth actions use active session',()=>{for(const f of ['bind','me','revoke'])assert(new RegExp('function '+f+'[\\s\\S]{0,300}requireActiveSession').test(auth));assert(auth.includes("p.p === 'bind') { boundSession = await requireActiveSession"))})
test('admin JWT aligned to seven-day trust',()=>{assert(auth.includes("profile.role === 'admin' ? ADMIN_TRUST_DAYS : TRUST_DAYS"))})
test('identity linking fails closed',()=>{assert(!auth.includes('delete patch.auth_user_id'));assert(auth.includes('identity_link_failed'))})
test('Supabase publishable key required for OTP',()=>{assert(auth.includes('const key = ENV.PUBLISHABLE_KEY'));assert(!auth.includes('ENV.PUBLISHABLE_KEY || ENV.SERVICE_KEY'))})
test('account and network cooldowns both applied',()=>{assert(auth.includes('login:account:'));assert(auth.includes('login:network:'));assert(auth.includes('mdllni_rate_bump'))})
test('password mutations require OTP route',()=>{assert(data.includes("action === 'changePassword'"));assert(data.includes('password_change_requires_otp'))})
test('snapshots are sanitized',()=>{assert(data.includes('sanitizeSnapshot'));assert(snap.includes('delete out.provider.debt'));assert(snap.includes('db.audit = []'))})
test('financial debt fails closed on RPC error',()=>{const p=engine.indexOf("dal.rpc('mdllni_apply_debt'");assert(p>=0);assert(!engine.slice(p,p+500).includes('catch'))})
test('provider cannot drop started service',()=>{assert(engine.includes("need(o.status !== 'started', 'started_drop_requires_dispute')"))})
test('no admin promotion/reactivation fallback',()=>{assert(!engine.includes("{ role: 'admin', status: 'active' }"))})
test('engine uses final database names',()=>{assert(!engine.includes('ur_'));assert(engine.includes('mdllni_apply_debt'))})
test('no seeded admin or local password auth',()=>{assert(!app.includes('ur-admin-2026'));assert(!app.includes("users:[{"));assert(app.includes('الاتصال الآمن بالخادم مطلوب للدخول'))})
test('cloud fails closed, never local',()=>{assert(cloud.includes("window.MODE='offline'"));assert(!cloud.includes('Live sync fallback to local mode'))})
test('fresh schema has no local OTP or legacy names',()=>{assert(!schema.includes('email_otps'));assert(!schema.includes('ur_'));assert(schema.includes('mdllni_rate_bump'))})
test('duplicate email index cleanup migration',()=>{assert(migration.includes('drop index if exists public.mdllni_profiles_email_uniq'))})
test('security headers configured',()=>{assert(vercel.includes('Strict-Transport-Security'));assert(vercel.includes('Content-Security-Policy'))})
test('only v11 test runs',()=>{assert.strictEqual(pkg.scripts.test,'node test/security-v11.js')})
if(process.exitCode)process.exit(1);console.log('\\n'+n+'/'+n+' v11 security checks passed')
`)

let env = read('.env.example')
if (!env.includes('APP_ORIGINS=')) env += '\n# اختياري لتطبيقات خارج نفس الدومين؛ اتركه فارغاً لمنع CORS الخارجي\n# APP_ORIGINS=https://mdllni.example\n'
env = env.replace('إذا لم يوضع يُستخدم service_role داخل السيرفر فقط.', 'إلزامي لطلبات Supabase Auth؛ لا يُستخدم service_role لإرسال OTP.')
write('.env.example', env)
console.log('Hardening rewrite completed')
