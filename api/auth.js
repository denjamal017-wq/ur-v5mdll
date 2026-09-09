// POST /api/auth  { action: 'register' | 'login' | 'me', ... }
const { cors, json, readBody, dal, hashPassword, verifyPassword, signToken, getToken, verifyToken } = require('./_lib')
const { provisionAdmin } = require('./_engine')

function normalizePhone(p) {
  if (!p) return ''
  let s = String(p)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[\s\-\(\)\.]/g, '')
  if (s.startsWith('+964')) s = '0' + s.slice(4)
  else if (s.startsWith('00964')) s = '0' + s.slice(5)
  else if (s.startsWith('964')) s = '0' + s.slice(3)
  else if (s.length === 10 && s.startsWith('7')) s = '0' + s
  return s
}

const PHONE_RE = /^07[0-9]{9}$/

// Anti-Fraud Device & IP Tracking: Ban any IP or Device registering > 3 phone numbers
// v7.4 — العدّادات والحظر دائمة بجدول ur_rate_limits: السيرفرليس ينسى الذاكرة عند كل cold start
// وكل instance لها عدّادها — القاعدة هي مصدر الحقيقة، والذاكرة كاش سريع فوقها.
const _bannedIps = new Set()
const _bannedDevices = new Set()

async function rlGet(key) {
  try { return await dal.find('ur_rate_limits', { key: key }) } catch (_) { return null }
}
async function rlSet(key, count, first, items) {
  const row = { count: count, first: first, items: items || [], updated_at: new Date().toISOString() }
  try {
    const ex = await dal.find('ur_rate_limits', { key: key })
    if (ex) await dal.update('ur_rate_limits', { key: key }, row)
    else await dal.insert('ur_rate_limits', Object.assign({ key: key }, row))
  } catch (_) {}
}
async function isBanned(ip, deviceId) {
  if (_bannedIps.has(ip) || _bannedDevices.has(deviceId)) return true
  const [b1, b2] = await Promise.all([rlGet('ban:ip:' + ip), rlGet('ban:dev:' + deviceId)])
  if (b1) _bannedIps.add(ip)
  if (b2) _bannedDevices.add(deviceId)
  return !!(b1 || b2)
}
async function banBoth(ip, deviceId) {
  _bannedIps.add(ip); _bannedDevices.add(deviceId)
  await rlSet('ban:ip:' + ip, 1, Date.now(), [])
  await rlSet('ban:dev:' + deviceId, 1, Date.now(), [])
  console.warn('[SECURITY FRAUD ALERT] Banned IP ' + ip + ' and Device ' + deviceId + ' for registering > 3 phone numbers!')
}
async function regPhones(key) {
  const row = await rlGet(key)
  return (row && Array.isArray(row.items)) ? row.items : []
}
async function noteRegistration(ip, deviceId, phone) {
  for (const key of ['reg:ip:' + ip, 'reg:dev:' + deviceId]) {
    const items = await regPhones(key)
    if (items.indexOf(phone) < 0) {
      items.push(phone)
      await rlSet(key, items.length, Date.now(), items.slice(-20))
    }
  }
}
async function loginFailCount(ip) {
  const row = await rlGet('lf:' + ip)
  if (!row || (Date.now() - (row.first || 0)) >= 600000) return 0
  return row.count || 0
}
async function noteLoginFail(ip) {
  const row = await rlGet('lf:' + ip)
  const fresh = !row || (Date.now() - (row.first || 0)) >= 600000
  await rlSet('lf:' + ip, fresh ? 1 : (row.count || 0) + 1, fresh ? Date.now() : row.first, [])
}
async function clearLoginFails(ip) { await rlSet('lf:' + ip, 0, 0, []) }

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (xf) return xf.split(',')[0].trim()
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1'
}

async function checkDeviceFraud(req, body, phone) {
  const ip = getClientIp(req)
  const rawDev = String(body.deviceId || body.deviceFingerprint || req.headers['user-agent'] || 'unknown_device').trim()
  const deviceId = rawDev.slice(0, 120)

  // 1. Check if IP or Device is already banned (القاعدة مصدر الحقيقة)
  if (await isBanned(ip, deviceId)) {
    return {
      blocked: true,
      error: 'device_blocked',
      message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به لإنشاء الحسابات (أكثر من 3 حسابات)'
    }
  }

  // 2. تتبع التسجيلات الدائم: 3 أرقام مختلفة كحد أقصى لكل IP/جهاز — والرابع يحظرهما
  const ipPhones = await regPhones('reg:ip:' + ip)
  const devPhones = await regPhones('reg:dev:' + deviceId)
  if ((ipPhones.length >= 3 && ipPhones.indexOf(phone) < 0) || (devPhones.length >= 3 && devPhones.indexOf(phone) < 0)) {
    await banBoth(ip, deviceId)
    return {
      blocked: true,
      error: 'device_blocked',
      message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به (أكثر من 3 حسابات)'
    }
  }

  return { blocked: false, ip, deviceId }
}

module.exports = async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  try {
    await provisionAdmin()
    const body = await readBody(req)
    const action = body.action || (req.query && req.query.action)
    if (action === 'register') return await register(res, body, req)
    if (action === 'login') return await login(res, body, req)
    if (action === 'me') return await me(req, res)
    return json(res, 400, { ok: false, error: 'unknown_action' })
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e.code || e.message || 'server_error' })
  }
}

async function register(res, b, req) {
  const name = String(b.name || '').trim()
  const phone = normalizePhone(b.phone)
  const pass = String(b.pass || '')
  const area = String(b.area || '').trim()
  const role = b.role === 'provider' ? 'provider' : 'customer'

  if (name.length < 2) return json(res, 400, { ok: false, error: 'bad_name' })
  if (!PHONE_RE.test(phone)) return json(res, 400, { ok: false, error: 'bad_phone' })
  if (pass.length < 6) return json(res, 400, { ok: false, error: 'bad_pass' })
  if (!area) return json(res, 400, { ok: false, error: 'bad_area' })

  // Anti-Fraud check: Check IP & Device limits (Auto-ban on > 3 accounts) — دائم بالقاعدة
  const fraudCheck = await checkDeviceFraud(req, b, phone)
  if (fraudCheck.blocked) {
    return json(res, 403, { ok: false, error: fraudCheck.error, message: fraudCheck.message })
  }

  const dup = await dal.find('ur_profiles', { phone })
  if (dup) return json(res, 409, { ok: false, error: 'phone_taken' })

  let primaryServiceRow = null
  let selectedServiceIds = []

  if (role === 'provider') {
    // Collect up to 3 services
    let serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds.slice(0, 3) : []
    if (!serviceIds.length && b.serviceId) serviceIds = [b.serviceId]
    if (!serviceIds.length) serviceIds = ['s1']

    for (const sId of serviceIds) {
      if (sId === 'custom' || (sId === serviceIds[0] && b.customServiceName)) {
        // v7.4 — حدود صارمة للمهنة المخصصة: اسم بطول معقول وسعر ضمن سقف منطقي
        const customName = String(b.customServiceName || 'مهنة خاصة').trim().slice(0, 60) || 'مهنة خاصة'
        const customDesc = String(b.customServiceDesc || 'خدمة مخصصة').trim().slice(0, 200)
        const minPrice = Math.min(500000, Math.max(1000, parseInt(b.customServiceMin, 10) || 10000))
        const maxPrice = Math.min(500000, Math.max(minPrice, parseInt(b.customServiceMax, 10) || 40000))
        const customId = 'svc_' + Date.now().toString(36)
        try {
          const sRow = await dal.insert('ur_services', {
            id: customId,
            icon: '⭐',
            name: customName,
            cat: 'home',
            unit: 'خدمة',
            min_price: minPrice,
            max_price: maxPrice,
            wave: 3,
            description: customDesc,
            popular: false,
            sensitive: false,
            gold: false,
            active: true,
            created_at: new Date().toISOString()
          })
          selectedServiceIds.push(sRow.id)
          if (!primaryServiceRow) primaryServiceRow = sRow
        } catch (e) {
          selectedServiceIds.push('s1')
        }
      } else {
        const sRow = await dal.find('ur_services', { id: sId })
        if (sRow) {
          selectedServiceIds.push(sRow.id)
          if (!primaryServiceRow) primaryServiceRow = sRow
        }
      }
    }

    if (!primaryServiceRow) primaryServiceRow = { id: 's1', name: 'خدمة عامة', sensitive: false }
    if (!selectedServiceIds.length) selectedServiceIds = [primaryServiceRow.id]
  }

  const passHash = await hashPassword(pass)
  // سباق التسجيل المزدوج: القيد الفريد على الهاتف يحسم — نرجّع phone_taken نظيفة بدل 500
  let profile
  try {
    profile = await dal.insert('ur_profiles', {
      phone,
      role,
      name,
      area,
      status: 'active',
      pass_hash: passHash,
      // نخزّن بصمة الجهاز من أول لحظة — أساس كشف التعامل الذاتي لاحقاً
      devices: fraudCheck.deviceId ? [fraudCheck.deviceId] : []
    })
  } catch (e) {
    if (String((e && e.message) || '').indexOf('duplicate') >= 0) {
      return json(res, 409, { ok: false, error: 'phone_taken' })
    }
    throw e
  }

  // Record successful registration for IP and Device tracking (دائم بالقاعدة)
  await noteRegistration(fraudCheck.ip, fraudCheck.deviceId, phone)

  if (role === 'provider') {
    const areas = Array.isArray(b.areas) && b.areas.length ? b.areas : [area]
    const exp = Math.max(0, parseInt(b.exp, 10) || 0)
    const sensitive = !!(primaryServiceRow && primaryServiceRow.sensitive)
    await dal.insert('ur_providers', {
      profile_id: profile.id,
      service_id: primaryServiceRow.id,
      service_ids: selectedServiceIds,
      exp: exp,
      areas: areas,
      // v7.4 — بوابة الثقة: كل مقدم ينتظر توثيق الإدارة بلا استثناء (الواجهة تَعِد بذلك والثقة أساس المنصة)
      verified: 'pending',
      avail: true,
      sensitive: sensitive
    })
    
    // Notify admins of new provider
    try {
      const admins = await dal.all('ur_profiles', { role: 'admin' })
      for (const a of admins) {
        await dal.insert('ur_notifications', {
          user_id: a.id,
          icon: '👷',
          body: `مقدم خدمة جديد ينتظر التوثيق: ${name} (${selectedServiceIds.length} مهن: ${primaryServiceRow.name}) — منطقة ${area}`,
          read: false,
          created_at: new Date().toISOString()
        })
      }
    } catch (_) {}
  }

  const token = signToken({ sub: profile.id, role: profile.role, phone: profile.phone })
  return json(res, 200, { ok: true, token, userId: profile.id, role: profile.role })
}

async function login(res, b, req) {
  const phone = normalizePhone(b.phone)
  const pass = String(b.pass || '')
  if (!PHONE_RE.test(phone) || !pass) return json(res, 400, { ok: false, error: 'bad_credentials' })

  const ip = getClientIp(req)
  const deviceId = String(b.deviceId || b.deviceFingerprint || req.headers['user-agent'] || 'unknown_device').trim().slice(0, 120)

  // Check if IP or device is banned (القاعدة مصدر الحقيقة)
  if (await isBanned(ip, deviceId)) {
    return json(res, 403, {
      ok: false,
      error: 'device_blocked',
      message: '🚫 هذا الجهاز محظور من استخدام المنصة'
    })
  }

  // Anti brute-force: 6 محاولات فاشلة خلال 10 دقائق من نفس الـ IP → إيقاف مؤقت (عداد دائم بالقاعدة)
  const failCount = await loginFailCount(ip)
  if (failCount >= 6) {
    return json(res, 429, { ok: false, error: 'device_blocked', message: '🚫 محاولات دخول كثيرة — انتظر شوية وحاول من جديد' })
  }

  const profile = await dal.find('ur_profiles', { phone })
  if (!profile) { await noteLoginFail(ip); return json(res, 401, { ok: false, error: 'not_registered' }) }
  if (profile.status === 'suspended') return json(res, 403, { ok: false, error: 'suspended' })

  const ok = await verifyPassword(pass, profile.pass_hash)
  if (!ok) { await noteLoginFail(ip); return json(res, 401, { ok: false, error: 'bad_credentials' }) }

  await clearLoginFails(ip) // دخول ناجح يصفّر العداد
  // نلحق بصمة الجهاز بكل دخول ناجح (آخر 10 أجهزة) — كشف التعامل الذاتي
  const devs = Array.from(new Set([].concat(profile.devices || [], [deviceId]))).slice(-10)
  try { await dal.update('ur_profiles', { id: profile.id }, { devices: devs }) } catch (_) {}

  const token = signToken({ sub: profile.id, role: profile.role, phone: profile.phone })
  return json(res, 200, { ok: true, token, userId: profile.id, role: profile.role })
}

async function me(req, res) {
  const token = getToken(req)
  if (!token) return json(res, 401, { ok: false, error: 'unauthorized' })
  const payload = verifyToken(token)
  if (!payload) return json(res, 401, { ok: false, error: 'bad_token' })

  const profile = await dal.find('ur_profiles', { id: payload.sub })
  if (!profile) return json(res, 404, { ok: false, error: 'user_not_found' })

  let provider = null
  if (profile.role === 'provider') {
    provider = await dal.find('ur_providers', { profile_id: profile.id })
  }

  // لا نرسل أبداً pass_hash أو بصمات الأجهزة للعميل — جلسة + هوية تكفي
  const safeUser = Object.assign({}, profile)
  delete safeUser.pass_hash
  delete safeUser.devices
  return json(res, 200, { ok: true, user: safeUser, provider })
}
