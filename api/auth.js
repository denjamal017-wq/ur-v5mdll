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
const _ipRegistrations = new Map()       // ip -> Set of phones
const _deviceRegistrations = new Map()   // deviceId -> Set of phones
const _bannedIps = new Set()
const _bannedDevices = new Set()

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (xf) return xf.split(',')[0].trim()
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1'
}

function checkDeviceFraud(req, body, phone) {
  const ip = getClientIp(req)
  const rawDev = String(body.deviceId || body.deviceFingerprint || req.headers['user-agent'] || 'unknown_device').trim()
  const deviceId = rawDev.slice(0, 120)

  // 1. Check if IP or Device is already banned
  if (_bannedIps.has(ip) || _bannedDevices.has(deviceId)) {
    return {
      blocked: true,
      error: 'device_blocked',
      message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به لإنشاء الحسابات (أكثر من 3 حسابات)'
    }
  }

  // 2. Track registered phone numbers for this IP
  if (!_ipRegistrations.has(ip)) _ipRegistrations.set(ip, new Set())
  const ipPhones = _ipRegistrations.get(ip)

  // 3. Track registered phone numbers for this Device
  if (!_deviceRegistrations.has(deviceId)) _deviceRegistrations.set(deviceId, new Set())
  const devPhones = _deviceRegistrations.get(deviceId)

  // If already registered 3 distinct phone numbers and trying to register a 4th new number -> BAN IP & Device!
  if ((ipPhones.size >= 3 && !ipPhones.has(phone)) || (devPhones.size >= 3 && !devPhones.has(phone))) {
    _bannedIps.add(ip)
    _bannedDevices.add(deviceId)
    console.warn(`[SECURITY FRAUD ALERT] Banned IP ${ip} and Device ${deviceId} for registering > 3 phone numbers!`)
    return {
      blocked: true,
      error: 'device_blocked',
      message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به (أكثر من 3 حسابات)'
    }
  }

  return { blocked: false, ip, deviceId, ipPhones, devPhones }
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

  // Anti-Fraud check: Check IP & Device limits (Auto-ban on > 3 accounts)
  const fraudCheck = checkDeviceFraud(req, b, phone)
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
        const customName = String(b.customServiceName || 'مهنة خاصة').trim()
        const customDesc = String(b.customServiceDesc || 'خدمة مخصصة').trim()
        const minPrice = Math.max(1000, parseInt(b.customServiceMin, 10) || 10000)
        const maxPrice = Math.max(minPrice, parseInt(b.customServiceMax, 10) || 40000)
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
  const profile = await dal.insert('ur_profiles', {
    phone,
    role,
    name,
    area,
    status: 'active',
    pass_hash: passHash,
    // نخزّن بصمة الجهاز من أول لحظة — أساس كشف التعامل الذاتي لاحقاً
    devices: fraudCheck.deviceId ? [fraudCheck.deviceId] : []
  })

  // Record successful registration for IP and Device tracking
  if (fraudCheck.ipPhones) fraudCheck.ipPhones.add(phone)
  if (fraudCheck.devPhones) fraudCheck.devPhones.add(phone)

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
      verified: sensitive ? 'pending' : 'verified',
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
          body: `انضمام مقدم خدمة جديد: ${name} (${selectedServiceIds.length} مهن: ${primaryServiceRow.name}) — منطقة ${area}`,
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

  // Check if IP or device is banned
  if (_bannedIps.has(ip) || _bannedDevices.has(deviceId)) {
    return json(res, 403, {
      ok: false,
      error: 'device_blocked',
      message: '🚫 هذا الجهاز محظور من استخدام المنصة'
    })
  }

  const profile = await dal.find('ur_profiles', { phone })
  if (!profile) return json(res, 401, { ok: false, error: 'not_registered' })
  if (profile.status === 'suspended') return json(res, 403, { ok: false, error: 'suspended' })

  const ok = await verifyPassword(pass, profile.pass_hash)
  if (!ok) return json(res, 401, { ok: false, error: 'bad_credentials' })

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
