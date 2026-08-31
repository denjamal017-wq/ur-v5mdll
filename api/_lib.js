// =====================================================================
//  مدللني mdllni — shared server library (Vercel serverless, Node runtime)
//  Files starting with "_" are NOT exposed as HTTP routes by Vercel.
// =====================================================================
const crypto = require('crypto')

const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '07800000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ur-admin-2026',
  ADMIN_NAME: process.env.ADMIN_NAME || '\u0625\u062f\u0627\u0631\u0629 \u0623\u0648\u0631',
}

const cloudReady = !!(ENV.SUPABASE_URL && ENV.SERVICE_KEY && ENV.JWT_SECRET)

// ---- Supabase client (lazy; test harness can override) --------------
let _client = null
let _clientOverride = null
function __setClientForTest(fake) { _clientOverride = fake }
function getClient() {
  if (_clientOverride) return _clientOverride
  if (_client) return _client
  const { createClient } = require('@supabase/supabase-js')
  _client = createClient(ENV.SUPABASE_URL, ENV.SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// ---- Data Access Layer (thin, obvious wrapper over PostgREST) -------
//  All business logic uses ONLY these methods, so the exact same code
//  path runs in production and in the offline test (which injects an
//  in-memory client). Keep this wrapper trivial.
const dal = {
  async all(table, match) {
    let q = getClient().from(table).select('*')
    if (match) for (const k of Object.keys(match)) q = q.eq(k, match[k])
    const { data, error } = await q
    if (error) throw new Error(table + '.all: ' + error.message)
    return data || []
  },
  async find(table, match) {
    let q = getClient().from(table).select('*')
    for (const k of Object.keys(match)) q = q.eq(k, match[k])
    const { data, error } = await q.limit(1)
    if (error) throw new Error(table + '.find: ' + error.message)
    return (data && data[0]) || null
  },
  async insert(table, obj) {
    const { data, error } = await getClient().from(table).insert(obj).select()
    if (error) throw new Error(table + '.insert: ' + error.message)
    return (data && data[0]) || null
  },
  async update(table, match, patch) {
    let q = getClient().from(table).update(patch)
    for (const k of Object.keys(match)) q = q.eq(k, match[k])
    const { data, error } = await q.select()
    if (error) throw new Error(table + '.update: ' + error.message)
    return data || []
  },
  async del(table, match) {
    let q = getClient().from(table).delete()
    for (const k of Object.keys(match)) q = q.eq(k, match[k])
    const { error } = await q
    if (error) throw new Error(table + '.del: ' + error.message)
    return true
  },
  async nextSeq(kind, start) {
    const { data, error } = await getClient().rpc('ur_next_seq', {
      p_kind: kind, p_start: (start == null ? 1 : start),
    })
    if (error) throw new Error('nextSeq: ' + error.message)
    return typeof data === 'number' ? data : (data && data[0]) || start
  },
}

// ---- HTTP helpers ---------------------------------------------------
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.statusCode = status
  res.end(JSON.stringify(body))
}
async function readBody(req) {
  if (req.body != null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch (e) { return {} } }
    return req.body
  }
  return await new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch (e) { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

// ---- base64url + JWT (HS256) ---------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}
function signToken(payload, days) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = Object.assign({}, payload, { iat: now, exp: now + (days || 30) * 86400 })
  const head = b64url(JSON.stringify(header))
  const load = b64url(JSON.stringify(body))
  const sig = b64url(crypto.createHmac('sha256', ENV.JWT_SECRET).update(head + '.' + load).digest())
  return head + '.' + load + '.' + sig
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, load, sig] = parts
  const expected = crypto.createHmac('sha256', ENV.JWT_SECRET).update(head + '.' + load).digest()
  let given
  try { given = b64urlDecode(sig) } catch (e) { return null }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  let body
  try { body = JSON.parse(b64urlDecode(load).toString('utf8')) } catch (e) { return null }
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null
  return body
}
function getToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization']
  if (h && h.indexOf('Bearer ') === 0) return h.slice(7)
  return null
}

// ---- password hashing (scrypt) -------------------------------------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const dk = crypto.scryptSync(String(pw), salt, 32)
  return 'scrypt$' + salt.toString('hex') + '$' + dk.toString('hex')
}
function verifyPassword(pw, stored) {
  try {
    const parts = String(stored).split('$')
    if (parts[0] !== 'scrypt') return false
    const salt = Buffer.from(parts[1], 'hex')
    const dk = crypto.scryptSync(String(pw), salt, 32)
    const want = Buffer.from(parts[2], 'hex')
    return dk.length === want.length && crypto.timingSafeEqual(dk, want)
  } catch (e) { return false }
}

module.exports = {
  ENV, cloudReady, dal, getClient, __setClientForTest,
  cors, json, readBody,
  signToken, verifyToken, getToken,
  hashPassword, verifyPassword,
  crypto,
}
