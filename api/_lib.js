// مدللني mdllni — shared server library; Node 18+ native fetch only.
'use strict'
const crypto = require('crypto')
const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '07838181890',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_NAME: process.env.ADMIN_NAME || 'إدارة مدللني',
  ADMIN_EMAIL: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || '',
}
const cloudReady = !!(ENV.SUPABASE_URL && ENV.SERVICE_KEY && ENV.JWT_SECRET)
let _clientOverride = null
function __setClientForTest(fake) { _clientOverride = fake }
function getClient() { return _clientOverride }
function tableCandidates(name) {
  if (/^mdllni_/.test(name)) return [name, 'ur_' + name.slice(7)]
  if (/^ur_/.test(name)) return ['mdllni_' + name.slice(3), name]
  return [name]
}
function rpcCandidates(name) {
  if (/^mdllni_/.test(name)) return [name, 'ur_' + name.slice(7)]
  if (/^ur_/.test(name)) return ['mdllni_' + name.slice(3), name]
  return [name]
}
function isMissing(error) {
  const code = String(error && error.code || '')
  const msg = String(error && error.message || '').toLowerCase()
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' || code === '404' || msg.includes('schema cache') || msg.includes('could not find the table') || msg.includes('does not exist')
}
function dbError(scope, error) { const e = new Error(scope + ': ' + String(error && error.message || 'database_error')); e.code = String(error && error.code || 'database_error'); throw e }
function serviceHeaders(extra) { return Object.assign({ apikey: ENV.SERVICE_KEY, Authorization: 'Bearer ' + ENV.SERVICE_KEY, 'Content-Type': 'application/json' }, extra || {}) }
async function rest(path, method, body, filters, prefer) {
  if (!ENV.SUPABASE_URL || !ENV.SERVICE_KEY) return { data: null, error: { code: 'server_not_configured', message: 'Supabase is not configured' } }
  const url = new URL(ENV.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path)
  for (const k of Object.keys(filters || {})) url.searchParams.append(k, filters[k])
  const init = { method, headers: serviceHeaders(prefer ? { Prefer: prefer } : null) }
  if (body !== undefined) init.body = JSON.stringify(body)
  let response
  try { response = await fetch(url, init) } catch (_) { return { data: null, error: { code: 'network_error', message: 'Supabase network error' } } }
  const text = await response.text().catch(() => '')
  let data = null; try { data = text ? JSON.parse(text) : [] } catch (_) { data = text }
  if (!response.ok) return { data: null, error: { code: String(data && data.code || response.status), message: String(data && (data.message || data.error_description || data.msg) || 'Supabase REST error') } }
  return { data, error: null }
}
function eqFilters(match) { const out = { select: '*' }; for (const k of Object.keys(match || {})) out[k] = 'eq.' + String(match[k]); return out }
async function sdkTable(name, op, match, value) {
  let q
  if (op === 'all' || op === 'find') { q = _clientOverride.from(name).select('*'); for (const k of Object.keys(match || {})) q = q.eq(k, match[k]); if (op === 'find') q = q.limit(1) }
  else if (op === 'insert') q = _clientOverride.from(name).insert(value).select()
  else if (op === 'update') { q = _clientOverride.from(name).update(value); for (const k of Object.keys(match || {})) q = q.eq(k, match[k]); q = q.select() }
  else { q = _clientOverride.from(name).delete(); for (const k of Object.keys(match || {})) q = q.eq(k, match[k]) }
  return await q
}
async function rawTable(name, op, match, value) {
  const path = encodeURIComponent(name)
  if (op === 'all') return await rest(path, 'GET', undefined, eqFilters(match))
  if (op === 'find') { const f = eqFilters(match); f.limit = '1'; return await rest(path, 'GET', undefined, f) }
  if (op === 'insert') return await rest(path, 'POST', value, { select: '*' }, 'return=representation')
  if (op === 'update') return await rest(path, 'PATCH', value, eqFilters(match), 'return=representation')
  return await rest(path, 'DELETE', undefined, eqFilters(match), 'return=minimal')
}
async function tableRun(table, op, match, value) {
  const names = tableCandidates(table)
  for (let i = 0; i < names.length; i++) {
    const out = _clientOverride ? await sdkTable(names[i], op, match, value) : await rawTable(names[i], op, match, value)
    if (!out.error) return out.data
    if (i === names.length - 1 || !isMissing(out.error)) dbError(names[i], out.error)
  }
  return null
}
const dal = {
  async all(table, match) { return await tableRun(table, 'all', match) || [] },
  async find(table, match) { const data = await tableRun(table, 'find', match); return data && data[0] || null },
  async insert(table, obj) { const data = await tableRun(table, 'insert', null, obj); return data && data[0] || null },
  async update(table, match, patch) { return await tableRun(table, 'update', match, patch) || [] },
  async del(table, match) { await tableRun(table, 'delete', match); return true },
  async nextSeq(kind, start) { return await this.rpc('mdllni_next_seq', { p_kind: kind, p_start: start == null ? 1 : start }) },
  async rpc(fn, args) {
    const names = rpcCandidates(fn)
    for (let i = 0; i < names.length; i++) {
      const out = _clientOverride ? await _clientOverride.rpc(names[i], args || {}) : await rest('rpc/' + encodeURIComponent(names[i]), 'POST', args || {})
      if (!out.error) return out.data
      if (i === names.length - 1 || !isMissing(out.error)) dbError('rpc.' + names[i], out.error)
    }
    return null
  },
}
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Cache-Control', 'no-store') }
function json(res, status, body) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.statusCode = status; res.end(JSON.stringify(body)) }
async function readBody(req) {
  if (req.body != null) { if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch (_) { return {} } } return req.body }
  return await new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1024 * 1024) d = '' }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch (_) { resolve({}) } }); req.on('error', () => resolve({})) })
}
function b64url(v) { return Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function b64urlDecode(str) { str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Buffer.from(str, 'base64') }
function signToken(payload, days) {
  if (!ENV.JWT_SECRET || ENV.JWT_SECRET.length < 24) { const e = new Error('server_not_configured'); e.code = 'server_not_configured'; throw e }
  const now = Math.floor(Date.now() / 1000), head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), body = b64url(JSON.stringify(Object.assign({}, payload, { iat: now, exp: now + (days == null ? 30 : days) * 86400 }))), sig = b64url(crypto.createHmac('sha256', ENV.JWT_SECRET).update(head + '.' + body).digest())
  return head + '.' + body + '.' + sig
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const p = token.split('.'); if (p.length !== 3 || !ENV.JWT_SECRET) return null
  const expected = crypto.createHmac('sha256', ENV.JWT_SECRET).update(p[0] + '.' + p[1]).digest(); let given
  try { given = b64urlDecode(p[2]) } catch (_) { return null }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  try { const x = JSON.parse(b64urlDecode(p[1]).toString('utf8')); if (x.exp && x.exp < Math.floor(Date.now() / 1000)) return null; return x } catch (_) { return null }
}
function getToken(req) { const h = req.headers.authorization || req.headers.Authorization; return h && h.indexOf('Bearer ') === 0 ? h.slice(7) : null }
function hashPassword(pw) { const salt = crypto.randomBytes(16), dk = crypto.scryptSync(String(pw), salt, 32); return 'scrypt$' + salt.toString('hex') + '$' + dk.toString('hex') }
function verifyPassword(pw, stored) { try { const p = String(stored).split('$'); if (p[0] !== 'scrypt' || p.length !== 3) return false; const got = crypto.scryptSync(String(pw), Buffer.from(p[1], 'hex'), 32), want = Buffer.from(p[2], 'hex'); return got.length === want.length && crypto.timingSafeEqual(got, want) } catch (_) { return false } }
async function verifyTurnstile(token, network) {
  if (!ENV.TURNSTILE_SECRET || !ENV.TURNSTILE_SITE_KEY) return true
  if (!token || typeof token !== 'string' || token.length > 2048) return false
  try { const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'secret=' + encodeURIComponent(ENV.TURNSTILE_SECRET) + '&response=' + encodeURIComponent(token) + (network ? '&remoteip=' + encodeURIComponent(network) : '') }); const j = await r.json(); return !!(j && j.success === true) } catch (_) { return false }
}
function sha256(v) { return crypto.createHash('sha256').update(String(v || '')).digest('hex') }
module.exports = { ENV, cloudReady, dal, getClient, __setClientForTest, cors, json, readBody, signToken, verifyToken, getToken, hashPassword, verifyPassword, verifyTurnstile, sha256, crypto }
