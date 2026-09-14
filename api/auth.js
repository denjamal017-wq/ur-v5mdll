// POST /api/auth  { action: 'register' | 'login' | 'verifyOtp' | 'resendOtp' | 'bindEmail' | 'me', ... }
//  v8.0 — هوية أقوى بكثير:
//  · بريد إلزامي + رمز OTP بخطوتين للتسجيل والدخول (بدل الاعتماد على الهاتف فقط)
//  · جهاز واحد = حساب واحد (فهرس فريد بالقاعدة) — الجهاز الجديد لحساب قائم
//    يحتاج رمز بريد ثم موافقة الإدارة (تبديل الهاتف العطلان بدون فقدان الحساب)
//  · آخر IP موثّق للحساب (شبكة مكافحة التواطؤ بالمحرك) + أحداث أمنية دائمة
//  · Cloudflare Turnstile اختياري عند ضبط المفاتيح + كبح القوة الغاشمة الدائم
//  v8.8 — سد ثغرة: حساب بريده غير مفعّل ما يدخل بلا رمز (المسار المتساهل صار فقط
//  لمن لا بريد له إطلاقاً) + bindEmail: ربط إجباري لبريد الحسابات القديمة
//  v9.0 — رموز OTP تصدر وتُتحقق من Supabase Auth نفسها (GoTrue عبر HTTPS صرف):
//  لا مزود بريد خارجي ولا MAIL_* — التفعيل يكون من لوحة Supabase (Email provider)
//  والكولداون والحد اليومي والأجهزة والجلسات تبقى كلها بقواعدنا نحن.
const { cors, json, readBody, dal, hashPassword, verifyPassword, signToken, getToken, verifyToken, verifyTurnstile, ENV } = require('./_lib')
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const OTP_DAILY_LIMIT = 8

// ------------------------------------------------------------ rate limits (دائمة بالقاعدة)
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

// بصمة الجهاز: المعرف العميلي الثابت (localStorage) — نفس تنسيق الجيل السابق حتى
// تبقى الأجهزة المرحّلة من القاعدة معروفة بعد التحديث. البصمة إشارة احتيال،
// والسر الحقيقي هو كلمة المرور + رمز البريد — فاستنساخها وحده لا يفتح حساباً.
function deviceFp(req, body) {
  const raw = String(body.deviceId || body.deviceFingerprint || '').trim()
  if (raw) return raw.slice(0, 120)
  return ('ua:' + String(req.headers['user-agent'] || 'unknown')).slice(0, 120)
}

// ------------------------------------------------------------ أحداث أمنية + تنبيه إدارة
async function secEvent(profileId, kind, meta, ip) {
  try {
    await dal.insert('ur_security_events', {
      profile_id: profileId || null, kind: kind,
      meta: meta || {}, ip: ip || '', created_at: new Date().toISOString(),
    })
  } catch (_) {}
}
async function notifyAdmins(icon, text, orderId) {
  try {
    const admins = await dal.all('ur_profiles', { role: 'admin' })
    for (const a of admins) {
      await dal.insert('ur_notifications', {
        user_id: a.id, icon: icon, body: text, order_id: orderId || null,
        read: false, created_at: new Date().toISOString(),
      })
    }
  } catch (_) {}
}

// ------------------------------------------------------------ OTP عبر Supabase Auth (v9.0)
//  الرمز يولّده ويرسله GoTrue لبريد المستخدم مباشرة — لا مزود بريد ولا حزم.
//  نحتفظ نحن بالكولداون والحد اليومي (ur_rate_limits) فوق حدود Supabase نفسها.
async function supaOtpCall(path, payload) {
  try {
    const r = await fetch(ENV.SUPABASE_URL + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'apikey': ENV.SERVICE_KEY, 'Authorization': 'Bearer ' + ENV.SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const errText = (typeof r.text === 'function') ? await r.text().catch(() => '') : ''
      console.error('[supaOtpCall error]', path, r.status, errText)
    }
    return r.ok
  } catch (err) {
    console.error('[supaOtpCall exception]', path, err.message)
    return false
  }
}

// يرسل رمزاً جديداً؛ يرمي otp_wait / otp_limit / mail_failed
async function issueOtp(email, purpose, ip) {
  const cdKey = 'otp:cd:' + purpose + ':' + email
  const cd = await rlGet(cdKey)
  if (cd && (Date.now() - (cd.first || 0)) < OTP_RESEND_COOLDOWN_MS) {
    const e = new Error('otp_wait'); e.code = 'otp_wait'; e.status = 429; throw e
  }
  const dayKey = 'otp:day:' + email
  const day = await rlGet(dayKey)
  const dayCount = (day && (Date.now() - (day.first || 0)) < 86400000) ? (day.count || 0) : 0
  if (dayCount >= OTP_DAILY_LIMIT) {
    const e = new Error('otp_limit'); e.code = 'otp_limit'; e.status = 429; throw e
  }
  const sent = await supaOtpCall('otp', { email: email, create_user: true })
  if (!sent) { const e = new Error('mail_failed'); e.code = 'mail_failed'; e.status = 502; throw e }
  await rlSet(cdKey, 1, Date.now(), [])
  await rlSet(dayKey, dayCount + 1, dayCount ? day.first : Date.now(), [])
  await secEvent(null, 'otp_issued', { email: email, purpose: purpose }, ip)
  return {}
}

// يتحقق من الرمز عند Supabase (أحادي الاستخدام)؛ يرمي bad_otp
//  وعند النجاح يصفّر الكولداون حتى يكدر المستخدم يدخل فوراً من جديد إذا انغلق.
async function consumeOtp(email, purpose, code) {
  const token = String(code || '').trim()
  if (!/^\d{6}$/.test(token)) { const e = new Error('bad_otp'); e.code = 'bad_otp'; throw e }
  const ok = await supaOtpCall('verify', { type: 'email', email: email, token: token })
  if (!ok) { const e = new Error('bad_otp'); e.code = 'bad_otp'; throw e }
  try { await rlSet('otp:cd:' + purpose + ':' + email, 0, 0, []) } catch (_) {}
  return true
}

// ------------------------------------------------------------ جهاز الحساب
async function activeDevice(profileId, fp) {
  if (!fp) return null
  return await dal.find('ur_devices', { profile_id: profileId, fingerprint: fp, status: 'active' })
}
async function deviceOwner(fp) {
  if (!fp) return null
  return await dal.find('ur_devices', { fingerprint: fp, status: 'active' })
}
async function countActiveDevices(profileId) {
  return (await dal.all('ur_devices', { profile_id: profileId, status: 'active' })).length
}
// تفعيل جهاز (مع مزامنة المصفوفة القديمة profiles.devices لكشف التعامل الذاتي)
async function activateDevice(profile, fp, label, ip) {
  try {
    await dal.insert('ur_devices', {
      profile_id: profile.id, fingerprint: fp, label: String(label || '').slice(0, 80),
      status: 'active', created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
    })
  } catch (e) {
    if (String((e && e.message) || '').indexOf('duplicate') >= 0) {
      const owner = await deviceOwner(fp)
      if (owner && owner.profile_id === profile.id) {
        try { await dal.update('ur_devices', { id: owner.id }, { last_seen: new Date().toISOString() }) } catch (_) {}
      } else {
        const err = new Error('device_in_use'); err.code = 'device_in_use'; err.status = 403; throw err
      }
    } else throw e
  }
  const devs = Array.from(new Set([].concat(profile.devices || [], [fp]))).slice(-10)
  try { await dal.update('ur_profiles', { id: profile.id }, { devices: devs, last_ip: ip || profile.last_ip || '' }) } catch (_) {}
  await secEvent(profile.id, 'device_activated', { fp: fp.slice(0, 24) }, ip)
}

async function checkDeviceFraud(req, body, phone) {
  const ip = getClientIp(req)
  const deviceId = deviceFp(req, body)
  if (await isBanned(ip, deviceId)) {
    return { blocked: true, error: 'device_blocked', message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به لإنشاء الحسابات (أكثر من 3 حسابات)' }
  }
  const ipPhones = await regPhones('reg:ip:' + ip)
  const devPhones = await regPhones('reg:dev:' + deviceId)
  if ((ipPhones.length >= 3 && ipPhones.indexOf(phone) < 0) || (devPhones.length >= 3 && devPhones.indexOf(phone) < 0)) {
    await banBoth(ip, deviceId)
    return { blocked: true, error: 'device_blocked', message: '🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى المسموح به (أكثر من 3 حسابات)' }
  }
  return { blocked: false, ip, deviceId }
}

// ------------------------------------------------------------ handler
module.exports = async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  try {
    await provisionAdmin()
    const body = await readBody(req)
    const action = body.action || (req.query && req.query.action)
    if (action === 'register') return await register(res, body, req)
    if (action === 'login') return await login(res, body, req)
    if (action === 'verifyOtp') return await verifyOtpAction(res, body, req)
    if (action === 'resendOtp') return await resendOtp(res, body, req)
    if (action === 'bindEmail') return await bindEmail(res, body, req)
    if (action === 'forgotPassword') return await forgotPassword(res, body, req)
    if (action === 'resetPassword') return await resetPassword(res, body, req)
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
  const email = String(b.email || '').trim().toLowerCase()
  const area = String(b.area || '').trim()
  const role = b.role === 'provider' ? 'provider' : 'customer'

  if (name.length < 2) return json(res, 400, { ok: false, error: 'bad_name' })
  if (!PHONE_RE.test(phone)) return json(res, 400, { ok: false, error: 'bad_phone' })
  if (!EMAIL_RE.test(email)) return json(res, 400, { ok: false, error: 'bad_email' })
  if (pass.length < 6) return json(res, 400, { ok: false, error: 'bad_pass' })
  if (!area) return json(res, 400, { ok: false, error: 'bad_area' })

  const ip = getClientIp(req)
  // تحقق البشر (إن فُعّل من الإدارة) قبل أي كتابة
  if (!(await verifyTurnstile(String(b.turnstileToken || ''), ip))) {
    return json(res, 403, { ok: false, error: 'turnstile_failed' })
  }

  const fraudCheck = await checkDeviceFraud(req, b, phone)
  if (fraudCheck.blocked) return json(res, 403, { ok: false, error: fraudCheck.error, message: fraudCheck.message })

  const dup = await dal.find('ur_profiles', { phone })
  if (dup) return json(res, 409, { ok: false, error: 'phone_taken' })
  const dupEmail = await dal.find('ur_profiles', { email: email })
  if (dupEmail) return json(res, 409, { ok: false, error: 'email_taken' })
  // الجهاز مربوط بحساب آخر فعّال؟ امنع من أول لحظة — حساب واحد لكل جهاز
  const devOwner = await deviceOwner(fraudCheck.deviceId)
  if (devOwner) {
    await secEvent(null, 'register_on_used_device', { phone: phone }, ip)
    return json(res, 403, { ok: false, error: 'device_in_use', message: '🚫 هذا الجهاز مرتبط بحساب آخر. جهاز واحد = حساب واحد — إذا كان حسابك، سجّل دخولك.' })
  }

  let primaryServiceRow = null
  let selectedServiceIds = []

  if (role === 'provider') {
    let serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds.slice(0, 3) : []
    if (!serviceIds.length && b.serviceId) serviceIds = [b.serviceId]
    if (!serviceIds.length) serviceIds = ['s1']

    for (const sId of serviceIds) {
      if (sId === 'custom' || (sId === serviceIds[0] && b.customServiceName)) {
        const customName = String(b.customServiceName || 'مهنة خاصة').trim().slice(0, 60) || 'مهنة خاصة'
        const customDesc = String(b.customServiceDesc || 'خدمة مخصصة').trim().slice(0, 200)
        const minPrice = Math.min(500000, Math.max(1000, parseInt(b.customServiceMin, 10) || 10000))
        const maxPrice = Math.min(500000, Math.max(minPrice, parseInt(b.customServiceMax, 10) || 40000))
        const customId = 'svc_' + Date.now().toString(36)
        try {
          const sRow = await dal.insert('ur_services', {
            id: customId, icon: '⭐', name: customName, cat: 'home', unit: 'خدمة',
            min_price: minPrice, max_price: maxPrice, wave: 3, description: customDesc,
            popular: false, sensitive: false, gold: false, active: true, created_at: new Date().toISOString()
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
  let profile
  try {
    profile = await dal.insert('ur_profiles', {
      phone, role, name, area, status: 'active', pass_hash: passHash,
      email: email, email_verified: false, last_ip: ip,
      devices: [],
    })
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (msg.indexOf('duplicate') >= 0) {
      return json(res, 409, { ok: false, error: msg.indexOf('email') >= 0 ? 'email_taken' : 'phone_taken' })
    }
    throw e
  }

  await noteRegistration(fraudCheck.ip, fraudCheck.deviceId, phone)

  if (role === 'provider') {
    const areas = Array.isArray(b.areas) && b.areas.length ? b.areas : [area]
    const exp = Math.max(0, parseInt(b.exp, 10) || 0)
    const sensitive = !!(primaryServiceRow && primaryServiceRow.sensitive)
    await dal.insert('ur_providers', {
      profile_id: profile.id,
      service_id: primaryServiceRow.id,
      service_ids: selectedServiceIds,
      exp: exp, areas: areas,
      verified: 'pending',
      avail: true,
      sensitive: sensitive
    })
    try {
      await notifyAdmins('👷', 'مقدم خدمة جديد ينتظر التوثيق: ' + name + ' (' + selectedServiceIds.length + ' مهن: ' + primaryServiceRow.name + ') — منطقة ' + area, null)
    } catch (_) {}
  }

  // البريد هو بوابة التفعيل: لا جلسة قبل رمز البريد
  let extra = {}
  try {
    extra = await issueOtp(email, 'register', ip)
  } catch (e) {
    if (e.code === 'mail_not_configured' || e.code === 'mail_failed') {
      await notifyAdmins('📧', 'خدمة الرموز متعطلة — حساب ' + name + ' (' + phone + ') ينتظر رمز التفعيل. فعّل Email provider من لوحة Supabase ← Authentication', null)
      extra = { mailPending: true }
    } else throw e
  }
  const pending = signToken({ scope: 'otp', purpose: 'register', sub: profile.id, ph: phone, em: email, fp: fraudCheck.deviceId }, 0.007)
  await secEvent(profile.id, 'register_pending_otp', {}, ip)
  return json(res, 200, Object.assign({ ok: true, needsOtp: true, pending: pending, email: email }, extra))
}

async function login(res, b, req) {
  const phone = normalizePhone(b.phone)
  const pass = String(b.pass || '')
  if (!PHONE_RE.test(phone) || !pass) return json(res, 400, { ok: false, error: 'bad_credentials' })

  const ip = getClientIp(req)
  const deviceId = deviceFp(req, b)

  if (await isBanned(ip, deviceId)) {
    return json(res, 403, { ok: false, error: 'device_blocked', message: '🚫 هذا الجهاز محظور من استخدام المنصة' })
  }
  if (!(await verifyTurnstile(String(b.turnstileToken || ''), ip))) {
    return json(res, 403, { ok: false, error: 'turnstile_failed' })
  }

  const failCount = await loginFailCount(ip)
  if (failCount >= 6) {
    return json(res, 429, { ok: false, error: 'device_blocked', message: '🚫 محاولات دخول كثيرة — انتظر شوية وحاول من جديد' })
  }

  const profile = await dal.find('ur_profiles', { phone })
  if (!profile) { await noteLoginFail(ip); return json(res, 401, { ok: false, error: 'not_registered' }) }
  if (profile.status === 'suspended') return json(res, 403, { ok: false, error: 'suspended' })

  const ok = await verifyPassword(pass, profile.pass_hash)
  if (!ok) { await noteLoginFail(ip); await secEvent(profile.id, 'login_bad_password', {}, ip); return json(res, 401, { ok: false, error: 'bad_credentials' }) }

  await clearLoginFails(ip)
  try { await dal.update('ur_profiles', { id: profile.id }, { last_ip: ip }) } catch (_) {}

  // 👑 ميزة الإدارة: الأدمن يسجل دخول من أي جهاز مباشرة وبلا قيود وبلا انتظار موافقة أو OTP
  if (profile.role === 'admin') {
    if (deviceId) {
      try {
        const known = await activeDevice(profile.id, deviceId)
        if (!known) {
          try { await dal.del('ur_devices', { fingerprint: deviceId }) } catch (_) {}
          await activateDevice(profile, deviceId, req.headers['user-agent'], ip)
        } else {
          try { await dal.update('ur_devices', { id: known.id }, { last_seen: new Date().toISOString() }) } catch (_) {}
        }
      } catch (_) {}
    }
    const token = signToken({ sub: profile.id, role: 'admin', phone: profile.phone, dv: deviceId })
    return json(res, 200, { ok: true, token: token, userId: profile.id, role: 'admin', needsEmail: !profile.email })
  }

  // جهاز مربوط بحساب آخر؟ ممنوع — حساب واحد لكل جهاز
  const owner = await deviceOwner(deviceId)
  if (owner && owner.profile_id !== profile.id) {
    await secEvent(profile.id, 'login_on_foreign_device', { owner: owner.profile_id }, ip)
    await notifyAdmins('🚨', 'محاولة دخول لحساب ' + profile.name + ' من جهاز مربوط بحساب آخر — اشتباه مشاركة/اختراق', null)
    return json(res, 403, { ok: false, error: 'device_in_use', message: '🚫 هذا الجهاز مربوط بحساب آخر — جهاز واحد = حساب واحد.' })
  }
  const known = !!(await activeDevice(profile.id, deviceId))

  // v8.8 — كل حساب عنده بريد يمر بالرمز حتماً: غير المفعّل يكمّل رمز التفعيل (register)،
  // والمسار المتساهل بالأسفل صار فقط لمن لا بريد له إطلاقاً — ماكو التفاف على OTP
  if (profile.email) {
    const purpose = !profile.email_verified ? 'register' : (known ? 'login' : 'device')
    let extra = {}
    try {
      extra = await issueOtp(profile.email, purpose, ip)
    } catch (e) {
      if (e.code === 'mail_not_configured' || e.code === 'mail_failed') {
        await notifyAdmins('📧', 'خدمة الرموز متعطلة — ' + profile.name + ' ما يكدر يسجّل دخول (OTP). فعّل Email provider من Supabase', null)
        return json(res, 503, { ok: false, error: 'mail_not_configured' })
      }
      throw e
    }
    const pending = signToken({ scope: 'otp', purpose: purpose, sub: profile.id, ph: phone, em: profile.email, fp: deviceId }, 0.007)
    return json(res, 200, Object.assign({ ok: true, needsOtp: true, pending: pending, email: profile.email, newDevice: !known }, extra))
  }

  // حسابات قديمة بلا بريد مفعّل (ومنها الإدارة): دخول مباشر مع تنبيه إكمال البريد
  if (!known) {
    await activateDevice(profile, deviceId, req.headers['user-agent'], ip)
    await notifyAdmins('🛡️', 'جهاز جديد فُعّل مباشرة لحساب قديم بلا بريد: ' + profile.name + ' — راجع الأجهزة', null)
    await secEvent(profile.id, 'legacy_device_autoactivated', { fp: deviceId.slice(0, 24) }, ip)
  } else {
    try { await dal.update('ur_devices', { profile_id: profile.id, fingerprint: deviceId, status: 'active' }, { last_seen: new Date().toISOString() }) } catch (_) {}
  }
  const token = signToken({ sub: profile.id, role: profile.role, phone: profile.phone, dv: deviceId })
  return json(res, 200, { ok: true, token: token, userId: profile.id, role: profile.role, needsEmail: !profile.email })
}

// v8.8 — ربط بريد لحساب قديم (يتطلب جلسة صالحة): يرسل رمزاً لغرض bind
async function bindEmail(res, b, req) {
  const token = getToken(req)
  const payload = token && verifyToken(token)
  if (!payload || payload.scope === 'otp') return json(res, 401, { ok: false, error: 'unauthorized' })
  const profile = await dal.find('ur_profiles', { id: payload.sub })
  if (!profile) return json(res, 404, { ok: false, error: 'user_not_found' })
  if (profile.email && profile.email_verified) return json(res, 409, { ok: false, error: 'email_taken' })
  const email = String(b.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return json(res, 400, { ok: false, error: 'bad_email' })
  // الربط المتقاطع ممنوع: بريد مربوط برقم آخر ما ينربط لرقمك — والعكس بالتسجيل
  const dup = await dal.find('ur_profiles', { email: email })
  if (dup && dup.id !== profile.id) return json(res, 409, { ok: false, error: 'email_taken' })
  const ip = getClientIp(req)
  const extra = await issueOtp(email, 'bind', ip)
  const pending = signToken({ scope: 'otp', purpose: 'bind', sub: profile.id, em: email, fp: payload.dv || '' }, 0.007)
  await secEvent(profile.id, 'bind_email_issued', {}, ip)
  return json(res, 200, Object.assign({ ok: true, needsOtp: true, pending: pending, email: email }, extra))
}

async function verifyOtpAction(res, b, req) {
  const payload = verifyToken(String(b.pending || ''))
  if (!payload || payload.scope !== 'otp') return json(res, 401, { ok: false, error: 'bad_pending' })
  const ip = getClientIp(req)
  const profile = await dal.find('ur_profiles', { id: payload.sub })
  if (!profile) return json(res, 404, { ok: false, error: 'user_not_found' })
  const email = payload.em || profile.email
  if (!email) return json(res, 400, { ok: false, error: 'bad_pending' })

  await consumeOtp(email, payload.purpose, b.code) // يرمي bad_otp

  if (payload.purpose === 'register' || payload.purpose === 'login') {
    if (payload.purpose === 'register' && !profile.email_verified) {
      await dal.update('ur_profiles', { id: profile.id }, { email_verified: true })
    }
    if (payload.fp) {
      const known = await activeDevice(profile.id, payload.fp)
      if (!known) {
        const actCount = await countActiveDevices(profile.id)
        const hasEmailGate = profile.email_verified || payload.purpose === 'register'
        if (actCount === 0 || !hasEmailGate) {
          await activateDevice(profile, payload.fp, req.headers['user-agent'], ip)
        } else {
          // جهاز جديد لحساب مفعّل: يمر بريداً ثم ينتظر موافقة الإدارة (تبديل العطلان)
          await dal.insert('ur_devices', {
            profile_id: profile.id, fingerprint: payload.fp,
            label: String(req.headers['user-agent'] || '').slice(0, 80),
            status: 'pending', created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
            note: 'بانتظار موافقة الإدارة (تبديل جهاز)',
          })
          await notifyAdmins('🛡️', 'طلب تبديل جهاز: ' + profile.name + ' (' + profile.phone + ') — راجع تبويب الأمان لاعتماد الجهاز الجديد وإلغاء القديم', null)
          await secEvent(profile.id, 'device_pending_approval', { fp: payload.fp.slice(0, 24) }, ip)
          return json(res, 200, { ok: true, needsDeviceApproval: true, message: '🛡️ جهازك الجديد سجّلناه وينتظر موافقة الإدارة — تصلك الموافقة قريباً ومن بعدها تسجّل دخولك بأمان.' })
        }
      } else {
        try { await dal.update('ur_devices', { id: known.id }, { last_seen: new Date().toISOString() }) } catch (_) {}
      }
    }
    await secEvent(profile.id, payload.purpose === 'register' ? 'register_verified' : 'login_verified', {}, ip)
    const token = signToken({ sub: profile.id, role: profile.role, phone: profile.phone, dv: payload.fp || '' })
    return json(res, 200, { ok: true, token: token, userId: profile.id, role: profile.role })
  }

  if (payload.purpose === 'device') {
    // رمز البريد صحيح — الجهاز ينتظر قرار الإدارة
    try {
      await dal.insert('ur_devices', {
        profile_id: profile.id, fingerprint: payload.fp || deviceFp(req, b),
        label: String(req.headers['user-agent'] || '').slice(0, 80),
        status: 'pending', created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
        note: 'بانتظار موافقة الإدارة (تبديل جهاز)',
      })
    } catch (e) {
      if (String((e && e.message) || '').indexOf('duplicate') < 0) throw e
    }
    await notifyAdmins('🛡️', 'طلب تبديل جهاز: ' + profile.name + ' (' + profile.phone + ') — راجع تبويب الأمان', null)
    await secEvent(profile.id, 'device_pending_approval', {}, ip)
    return json(res, 200, { ok: true, needsDeviceApproval: true, message: '🛡️ جهازك الجديد ينتظر موافقة الإدارة.' })
  }

  if (payload.purpose === 'bind') {
    const dup = await dal.find('ur_profiles', { email: email })
    if (dup && dup.id !== profile.id) return json(res, 409, { ok: false, error: 'email_taken' })
    await dal.update('ur_profiles', { id: profile.id }, { email: email, email_verified: true })
    await secEvent(profile.id, 'email_bound', {}, ip)
    return json(res, 200, { ok: true, bound: true, email: email })
  }

  return json(res, 400, { ok: false, error: 'bad_pending' })
}

// ------------------------------------------------------------ نسيت كلمة المرور / إعادة التعيين (OTP)
async function forgotPassword(res, b, req) {
  const phone = normalizePhone(b.phone)
  if (!PHONE_RE.test(phone)) return json(res, 400, { ok: false, error: 'bad_phone' })

  const ip = getClientIp(req)
  if (!(await verifyTurnstile(String(b.turnstileToken || ''), ip))) {
    return json(res, 403, { ok: false, error: 'turnstile_failed' })
  }

  const profile = await dal.find('ur_profiles', { phone })
  if (!profile) return json(res, 404, { ok: false, error: 'not_registered', message: '⚠️ هذا الرقم غير مسجّل لدينا' })
  if (profile.status === 'suspended') return json(res, 403, { ok: false, error: 'suspended' })
  if (!profile.email) {
    return json(res, 400, { ok: false, error: 'no_email', message: '⚠️ هذا الحساب غير مربوط ببريد إلكتروني — تواصل مع الإدارة للمساعدة' })
  }

  let extra = {}
  try {
    extra = await issueOtp(profile.email, 'reset', ip)
  } catch (e) {
    if (e.code === 'mail_not_configured' || e.code === 'mail_failed') {
      return json(res, 503, { ok: false, error: 'mail_not_configured', message: '📧 خدمة إرسال الرموز غير متاحة حالياً' })
    }
    throw e
  }

  const parts = profile.email.split('@')
  const maskedEmail = (parts[0].length <= 2 ? parts[0][0] + '*' : parts[0][0] + '***' + parts[0].slice(-1)) + '@' + (parts[1] || '')

  const deviceId = deviceFp(req, b)
  const pending = signToken({ scope: 'otp', purpose: 'reset', sub: profile.id, ph: phone, em: profile.email, fp: deviceId }, 0.007)
  await secEvent(profile.id, 'forgot_password_requested', {}, ip)
  return json(res, 200, Object.assign({ ok: true, needsOtp: true, pending: pending, email: maskedEmail }, extra))
}

async function resetPassword(res, b, req) {
  const payload = verifyToken(String(b.pending || ''))
  if (!payload || payload.scope !== 'otp' || payload.purpose !== 'reset') {
    return json(res, 401, { ok: false, error: 'bad_pending' })
  }
  const newPass = String(b.newPass || '')
  if (newPass.length < 6) return json(res, 400, { ok: false, error: 'bad_pass', message: '🔑 كلمة المرور يجب أن تكون 6 أحرف على الأقل' })

  const ip = getClientIp(req)
  const profile = await dal.find('ur_profiles', { id: payload.sub })
  if (!profile) return json(res, 404, { ok: false, error: 'user_not_found' })
  const email = payload.em || profile.email
  if (!email) return json(res, 400, { ok: false, error: 'bad_pending' })

  await consumeOtp(email, 'reset', b.code) // يرمي bad_otp

  const passHash = await hashPassword(newPass)
  await dal.update('ur_profiles', { id: profile.id }, { pass_hash: passHash, email_verified: true })
  await clearLoginFails(ip)
  await secEvent(profile.id, 'password_reset_success', {}, ip)

  const deviceId = payload.fp || deviceFp(req, b)
  if (deviceId) {
    try {
      const known = await activeDevice(profile.id, deviceId)
      if (!known) {
        await activateDevice(profile, deviceId, req.headers['user-agent'], ip)
      }
    } catch (_) {}
  }
  const token = signToken({ sub: profile.id, role: profile.role, phone: profile.phone, dv: deviceId })
  return json(res, 200, { ok: true, token: token, userId: profile.id, role: profile.role, message: '🎉 تم تغيير كلمة المرور بنجاح!' })
}

async function resendOtp(res, b, req) {
  const payload = verifyToken(String(b.pending || ''))
  if (!payload || payload.scope !== 'otp') return json(res, 401, { ok: false, error: 'bad_pending' })
  const ip = getClientIp(req)
  let email = payload.em || ''
  if (!email && payload.sub) {
    const profile = await dal.find('ur_profiles', { id: payload.sub })
    email = profile && profile.email || ''
  }
  if (!email) return json(res, 400, { ok: false, error: 'bad_pending' })
  const extra = await issueOtp(email, payload.purpose, ip) // يرمي otp_wait / otp_limit
  return json(res, 200, Object.assign({ ok: true, needsOtp: true, pending: b.pending, email: email }, extra))
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

  // أجهزتي — المستخدم يشوف أجهزة حسابه (والإدارة تشوف الكل من السنابشوت)
  let devices = []
  try {
    devices = (await dal.all('ur_devices', { profile_id: profile.id }))
      .map((d) => ({ id: d.id, label: d.label, status: d.status, at: new Date(d.created_at).getTime(), lastSeen: new Date(d.last_seen).getTime() }))
      .sort((a, b2) => b2.lastSeen - a.lastSeen)
  } catch (_) {}

  const safeUser = Object.assign({}, profile)
  delete safeUser.pass_hash
  delete safeUser.devices
  safeUser.devicesList = devices
  return json(res, 200, { ok: true, user: safeUser, provider })
}
