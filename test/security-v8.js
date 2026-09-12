// =====================================================================
//  مدللني — جناح اختبارات الأمان v8 (يعمل دون شبكة: قاعدة بيانات وهمية
//  بالذاكرة + بريد بوضع التطوير). التشغيل: node security-v8.js
// =====================================================================
'use strict'
process.env.JWT_SECRET = 'suite-secret-key-for-tests-only'
process.env.MAIL_DEV_ECHO = '1'
process.env.TURNSTILE_SECRET = 'ts-secret-test'
process.env.TURNSTILE_SITE_KEY = 'ts-site-test'
process.env.ADMIN_PHONE = '07800000000'
process.env.ADMIN_PASSWORD = 'admin-pass-123'

// Turnstile siteverify مُزيّف — نتحكم بنتيجته من الاختبارات
const fetchState = { ok: true, calls: 0 }
global.fetch = async (url, opts) => {
  fetchState.calls++
  return { ok: true, json: async () => ({ success: fetchState.ok }) }
}

// ---------------------------------------------------------- قاعدة وهمية
const tables = {}
let _id = 100
const seqs = {}
function rows(t) { return (tables[t] = tables[t] || []) }
function dupErr(what) { const e = new Error('duplicate key value violates unique constraint "' + what + '"'); return e }

function checkUnique(t, row) {
  if (t === 'ur_profiles') {
    if (row.phone && rows(t).some((r) => r.phone === row.phone)) throw dupErr('ur_profiles_phone_key')
    if (row.email && rows(t).some((r) => r.email && String(r.email).toLowerCase() === String(row.email).toLowerCase())) throw dupErr('ur_profiles_email_uniq')
  }
  if (t === 'ur_devices' && row.status === 'active') {
    if (rows(t).some((r) => r.fingerprint === row.fingerprint && r.status === 'active')) throw dupErr('ur_devices_active_fp')
  }
  if (t === 'ur_ledger' && row.kind === 'commission' && row.order_id) {
    if (rows(t).some((r) => r.kind === 'commission' && r.order_id === row.order_id)) throw dupErr('ur_ledger_commission_order_uniq')
  }
}

function qb(table) {
  const st = { op: 'select', match: {}, payload: null, limitN: 0 }
  function matchRow(r) { return Object.keys(st.match).every((k) => r[k] === st.match[k]) }
  function exec() {
    try {
      const all = rows(table)
      if (st.op === 'select') {
        let out = all.filter(matchRow)
        if (st.limitN) out = out.slice(0, st.limitN)
        return { data: out, error: null }
      }
      if (st.op === 'insert') {
        const arr = Array.isArray(st.payload) ? st.payload : [st.payload]
        const inserted = arr.map((o) => {
          const row = Object.assign({}, o)
          if (row.id === undefined || row.id === null) row.id = _id++
          checkUnique(table, row)
          return row
        })
        inserted.forEach((r) => all.push(r))
        return { data: inserted, error: null }
      }
      if (st.op === 'update') {
        const out = []
        all.forEach((r) => { if (matchRow(r)) { Object.assign(r, st.payload); out.push(r) } })
        return { data: out, error: null }
      }
      if (st.op === 'delete') {
        for (let i = all.length - 1; i >= 0; i--) if (matchRow(all[i])) all.splice(i, 1)
        return { data: null, error: null }
      }
    } catch (e) { return { data: null, error: e } }
  }
  const api = {
    select() { return api },
    insert(o) { st.op = 'insert'; st.payload = o; return api },
    update(p) { st.op = 'update'; st.payload = p; return api },
    delete() { st.op = 'delete'; return api },
    eq(k, v) { st.match[k] = v; return api },
    limit(n) { st.limitN = n; return api },
    then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
  }
  return api
}

const mockClient = {
  from(t) { return qb(t) },
  async rpc(fn, args) {
    if (fn === 'ur_next_seq') {
      const k = args.p_kind
      if (seqs[k] === undefined) seqs[k] = (args.p_start == null ? 1 : args.p_start)
      const v = seqs[k]; seqs[k] = v + 1
      return { data: v, error: null }
    }
    if (fn === 'ur_apply_debt') {
      // ذري: يحدّث الذمة ويقيّد بالدفتر بمعاملة وحدة — ويعكس عند التكرار
      const prov = rows('ur_providers').find((p) => p.profile_id === args.p_provider)
      if (!prov) return { data: null, error: new Error('provider_not_found') }
      const before = prov.debt || 0
      prov.debt = Math.max(0, before + args.p_amount)
      const entry = { id: _id++, provider_id: args.p_provider, order_id: args.p_order || null, kind: args.p_kind, amount: args.p_amount, balance_after: prov.debt, note: args.p_note || '', created_at: new Date().toISOString() }
      try { checkUnique('ur_ledger', entry) } catch (e) { prov.debt = before; return { data: null, error: e } }
      rows('ur_ledger').push(entry)
      return { data: { debt: prov.debt }, error: null }
    }
    return { data: null, error: new Error('unknown_rpc:' + fn) }
  },
}

// ---------------------------------------------------------- تحميل الوحدات
const path = require('path')
const OUT = path.resolve(__dirname, '../api')
const lib = require(path.join(OUT, '_lib.js'))
lib.__setClientForTest(mockClient)
const engine = require(path.join(OUT, '_engine.js'))
const authHandler = require(path.join(OUT, 'auth.js'))
const dataHandler = require(path.join(OUT, 'data.js'))
const healthHandler = require(path.join(OUT, 'health.js'))

// ---------------------------------------------------------- مساعدات HTTP
function mkReq(body, ip, ua, token) {
  const h = { 'x-forwarded-for': ip || '9.9.9.9', 'user-agent': ua || 'suite-agent/1.0' }
  if (token) h['authorization'] = 'Bearer ' + token
  return { method: 'POST', headers: h, body: body }
}
function mkRes() { return { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(s) { this.body = s } } }
async function call(handler, body, ip, ua, token) {
  const res = mkRes()
  await handler(mkReq(body, ip, ua, token), res)
  return { status: res.statusCode, j: JSON.parse(res.body || '{}') }
}
const findRow = (t, k, v) => rows(t).find((r) => r[k] === v)

// ---------------------------------------------------------- إطار التأكيدات
let pass = 0, fail = 0
const failures = []
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')) }
}

// ---------------------------------------------------------- البذور
function seed() {
  rows('ur_services').push({ id: 's1', icon: '⚡', name: 'كهربائي', cat: 'home', unit: 'خدمة', min_price: 10000, max_price: 40000, wave: 1, description: 'أعمال كهرباء', popular: true, sensitive: false, gold: false, active: true, created_at: new Date().toISOString() })
  rows('ur_categories').push({ id: 'home', name: 'خدمات المنزل', icon: '🏠' })
  rows('ur_counters').push({ kind: 'order', value: 1042, last_value: 1042 }, { kind: 'ticket', value: 1, last_value: 1 }, { kind: 'payout', value: 1, last_value: 1 })
}

async function regAndVerify(phone, email, device, ip, role) {
  const r = await call(authHandler, { action: 'register', turnstileToken: 'tok', name: 'مستخدم ' + phone.slice(-4), phone, pass: 'secret123', email, area: 'الحبوبي / المركز', deviceId: device, role: role || 'customer', serviceIds: role === 'provider' ? ['s1'] : undefined, exp: 5, areas: ['الحبوبي / المركز'] }, ip, 'ua-' + device)
  if (!r.j.needsOtp) return { err: 'register: ' + JSON.stringify(r.j) }
  const v = await call(authHandler, { action: 'verifyOtp', pending: r.j.pending, code: r.j.devCode }, ip, 'ua-' + device)
  return { reg: r.j, ver: v.j, profile: findRow('ur_profiles', 'phone', phone) }
}

// ============================================================ الاختبارات
async function main() {
  seed()
  console.log('\n[S1–S3] تسجيل بخطوتين + قفل الرمز + تفعيل')
  const r1 = await call(authHandler, { action: 'register', turnstileToken: 'tok', name: 'زبون أول', phone: '07701110001', pass: 'secret123', email: 'cust@test.iq', area: 'الحبوبي / المركز', deviceId: 'devA' }, '9.9.9.9')
  t('S1 التسجيل يرجّع needsOtp ورمز تطوير 6 أرقام بلا جلسة', r1.j.needsOtp === true && /^\d{6}$/.test(r1.j.devCode || '') && !r1.j.token, JSON.stringify(r1.j).slice(0, 120))
  for (let i = 0; i < 5; i++) {
    const w = await call(authHandler, { action: 'verifyOtp', pending: r1.j.pending, code: '000000' }, '9.9.9.9')
    if (i < 4 && w.j.error !== 'bad_otp') t('S2 محاولة ' + (i + 1) + ' bad_otp', false, w.j.error)
    if (i === 4) t('S2 خامس خطأ bad_otp', w.j.error === 'bad_otp', w.j.error)
  }
  const w6 = await call(authHandler, { action: 'verifyOtp', pending: r1.j.pending, code: '000000' }, '9.9.9.9')
  t('S2 سادس محاولة → otp_locked', w6.j.error === 'otp_locked', w6.j.error)
  // رمز جديد (إعادة إرسال) ثم تحقق صحيح
  await new Promise((r) => setTimeout(r, 5))
  rows('ur_email_otps').forEach((o) => { o.created_at = new Date(Date.now() - 61000).toISOString() }) // تجاوز الكولداون
  const rs = await call(authHandler, { action: 'resendOtp', pending: r1.j.pending }, '9.9.9.9')
  t('S3 إعادة الإرسال ترجع رمزاً جديداً', rs.j.ok === true && /^\d{6}$/.test(rs.j.devCode || ''), JSON.stringify(rs.j).slice(0, 100))
  const v1 = await call(authHandler, { action: 'verifyOtp', pending: rs.j.pending, code: rs.j.devCode }, '9.9.9.9')
  t('S3 الرمز الصحيح يُصدر جلسة + بريد مفعّل', !!v1.j.token && findRow('ur_profiles', 'phone', '07701110001').email_verified === true, JSON.stringify(v1.j).slice(0, 100))
  const devRowA = rows('ur_devices').find((d) => d.fingerprint === 'devA')
  t('S3 جهاز devA فعّال والجلسة تحمل بصمته', devRowA && devRowA.status === 'active' && lib.verifyToken(v1.j.token).dv === 'devA')
  const cust = findRow('ur_profiles', 'phone', '07701110001')

  console.log('\n[S4–S5] منع التكرار: بريد/هاتف/جهاز')
  const d1 = await call(authHandler, { action: 'register', turnstileToken: 'tok', name: 'متكرر', phone: '07702220002', pass: 'secret123', email: 'CUST@test.iq', area: 'الحبوبي / المركز', deviceId: 'devX' }, '7.7.7.7')
  t('S4 بريد مكرر (بأي حالة أحرف) → email_taken', d1.j.error === 'email_taken', d1.j.error)
  const d2 = await call(authHandler, { action: 'register', turnstileToken: 'tok', name: 'متكرر', phone: '07701110001', pass: 'secret123', email: 'other@test.iq', area: 'الحبوبي / المركز', deviceId: 'devX' }, '7.7.7.7')
  t('S4 هاتف مكرر → phone_taken', d2.j.error === 'phone_taken', d2.j.error)
  const d3 = await call(authHandler, { action: 'register', turnstileToken: 'tok', name: 'ثانٍ', phone: '07703330003', pass: 'secret123', email: 'third@test.iq', area: 'الحبوبي / المركز', deviceId: 'devA' }, '6.6.6.6')
  t('S5 حساب ثانٍ على نفس الجهاز → device_in_use', d3.j.error === 'device_in_use', d3.j.error)

  console.log('\n[S6–S9] دخول بخطوتين + جهاز جديد ينتظر الإدارة + إلغاء يقتل الجلسة')
  const l1 = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07701110001', pass: 'secret123', deviceId: 'devA' }, '9.9.9.9')
  t('S6 دخول من جهاز معروف → needsOtp (login)', l1.j.needsOtp === true && l1.j.newDevice === false, JSON.stringify(l1.j).slice(0, 100))
  const lv = await call(authHandler, { action: 'verifyOtp', pending: l1.j.pending, code: l1.j.devCode }, '9.9.9.9')
  t('S6 رمز الدخول يُصدر جلسة', !!lv.j.token)
  const l2 = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07701110001', pass: 'secret123', deviceId: 'devB' }, '9.9.9.9')
  t('S7 جهاز جديد → needsOtp بغرض device', l2.j.needsOtp === true && l2.j.newDevice === true, JSON.stringify(l2.j).slice(0, 100))
  const lv2 = await call(authHandler, { action: 'verifyOtp', pending: l2.j.pending, code: l2.j.devCode }, '9.9.9.9')
  t('S7 بعد الرمز → needsDeviceApproval وجهاز pending', lv2.j.needsDeviceApproval === true && rows('ur_devices').some((d) => d.fingerprint === 'devB' && d.status === 'pending'), JSON.stringify(lv2.j).slice(0, 120))
  const admin = findRow('ur_profiles', 'phone', '07800000000')
  t('S7 الإدارة انبّهت بطلب الجهاز', rows('ur_notifications').some((n) => n.user_id === admin.id && String(n.body).indexOf('تبديل جهاز') >= 0))

  const pendDev = rows('ur_devices').find((d) => d.fingerprint === 'devB' && d.status === 'pending')
  const ap = await engine.runAction(admin, 'approveDevice', { deviceId: pendDev.id, mode: 'replace' })
  const devsOf = rows('ur_devices').filter((d) => d.profile_id === cust.id)
  t('S8 اعتماد-تبديل: devB فعّال وdevA ملغى', devsOf.find((d) => d.fingerprint === 'devB').status === 'active' && devsOf.find((d) => d.fingerprint === 'devA').status === 'revoked')
  t('S8 profiles.devices زامن = [devB]', JSON.stringify(findRow('ur_profiles', 'id', cust.id).devices) === JSON.stringify(['devB']), JSON.stringify(findRow('ur_profiles', 'id', cust.id).devices))
  t('S8 حدث device_replaced موثّق', rows('ur_security_events').some((e) => e.kind === 'device_replaced'))

  const snapOld = await call(dataHandler, { action: 'snapshot' }, '9.9.9.9', 'ua-devA', v1.j.token) // توكن قديم dv=devA
  t('S9 توكن الجهاز الملغى → 401 device_revoked', snapOld.status === 401 && snapOld.j.error === 'device_revoked', snapOld.status + ' ' + JSON.stringify(snapOld.j).slice(0, 80))
  const l3 = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07701110001', pass: 'secret123', deviceId: 'devB' }, '9.9.9.9')
  const lv3 = await call(authHandler, { action: 'verifyOtp', pending: l3.j.pending, code: l3.j.devCode }, '9.9.9.9')
  const snapNew = await call(dataHandler, { action: 'snapshot' }, '9.9.9.9', 'ua-devB', lv3.j.token)
  t('S9 الجهاز المعتمد الجديد يمر (snapshot 200)', snapNew.status === 200 && snapNew.j.ok === true)

  console.log('\n[S10] حساب قديم بلا بريد (الإدارة) — مسار متساهل بلا جمود')
  const la = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07800000000', pass: 'admin-pass-123', deviceId: 'devADM' }, '5.5.5.5')
  t('S10 دخول الإدارة مباشر + needsEmail', !!la.j.token && la.j.needsEmail === true, JSON.stringify(la.j).slice(0, 100))

  console.log('\n[S11] شبكة التواطؤ: نفس آخر IP بين زبون ومقدم → استبعاد + توثيق')
  const p1 = await regAndVerify('07704440004', 'prov1@test.iq', 'devP1', '9.9.9.9', 'provider') // نفس IP الزبون
  const p2 = await regAndVerify('07705550005', 'prov2@test.iq', 'devP2', '8.8.8.8', 'provider')
  t('S11 تسجيل مقدمين اثنين بنجاح', !!(p1.profile && p2.profile), JSON.stringify(p1.err || p2.err || ''))
  for (const pp of [p1, p2]) {
    const pr = findRow('ur_providers', 'profile_id', pp.profile.id)
    pr.verified = 'verified'; pr.avail = true
  }
  const custFresh = findRow('ur_profiles', 'id', cust.id)
  const co = await engine.runAction(custFresh, 'createOrder', { serviceId: 's1', area: 'الحبوبي / المركز', estimate: 15000, desc: 'تصليح عطل كهرباء بالبيت', address: 'قرب الجامعة', when: 'now', whenTime: '', payMethod: 'cash' })
  const orderId = co && co.orderId
  const orderRow = findRow('ur_orders', 'id', orderId)
  t('S11 الطلب انشأ ومُعلَّم flagged', !!(orderRow && orderRow.flagged === true), JSON.stringify(co).slice(0, 100))
  t('S11 حدث collusion_flag عبر IP موثّق', rows('ur_security_events').some((e) => e.kind === 'collusion_flag' && e.meta && e.meta.via === 'ip'))
  t('S11 المقدم المتواطئ ما وصله إشعار بالطلب', !rows('ur_notifications').some((n) => n.user_id === p1.profile.id && n.order_id === orderId))
  t('S11 المقدم النظيف وصله الإشعار', rows('ur_notifications').some((n) => n.user_id === p2.profile.id && n.order_id === orderId))

  console.log('\n[S12–S14] دورة طلب كاملة + سباق إكمال: عمولة وحدة موثّقة')
  const p2row = findRow('ur_profiles', 'id', p2.profile.id)
  const acc = await engine.runAction(p2row, 'acceptOrder', { orderId })
  t('S12 المقدم النظيف يقبل الطلب', !!(acc !== false && findRow('ur_orders', 'id', orderId).status === 'accepted'))
  await engine.runAction(p2row, 'advanceOrder', { orderId }) // enroute
  await engine.runAction(p2row, 'advanceOrder', { orderId }) // started
  const race = await Promise.all([
    engine.runAction(p2row, 'advanceOrder', { orderId }).then(() => 'ok').catch((e) => 'err:' + (e.code || e.message)),
    engine.runAction(p2row, 'advanceOrder', { orderId }).then(() => 'ok').catch((e) => 'err:' + (e.code || e.message)),
  ])
  const doneRow = findRow('ur_orders', 'id', orderId)
  const commRows = rows('ur_ledger').filter((l) => l.kind === 'commission' && l.order_id === orderId)
  const provRow = findRow('ur_providers', 'profile_id', p2.profile.id)
  console.log('    [معلومة] نتيجة السباق: ' + JSON.stringify(race) + ' — الحارس الذري يضمن المال حتى لو نجح النداءان')
  const afterDone = await engine.runAction(p2row, 'advanceOrder', { orderId }).then(() => 'ok').catch((e) => 'err:' + (e.code || e.message))
  t('S12 الإكمال بعد done مرفوض (قفل الحالة النهائية)', afterDone.indexOf('err') === 0, afterDone)
  t('S12 قيد عمولة واحد فقط بالدفتر رغم السباق', commRows.length === 1, 'count=' + commRows.length)
  t('S12 الذمة = العمولة بالضبط (دينار بدينار)', provRow.debt === commRows[0].amount, 'debt=' + provRow.debt + ' comm=' + (commRows[0] || {}).amount)
  const pricePaid = (doneRow.final_price != null ? doneRow.final_price : doneRow.estimate)
  const expectedComm = Math.max(250, Math.round(pricePaid * 0.18 / 250) * 250)
  t('S13 العمولة = 18% (شريحة أول طلب) من السعر المقرّر سيرفرياً ومقرّبة 250', doneRow.status === 'done' && commRows[0].amount === expectedComm && commRows[0].amount % 250 === 0, 'price=' + pricePaid + ' amount=' + commRows[0].amount + ' expected=' + expectedComm)
  t('S14 السنابشوت يعرض العمولة الموثّقة للطلب', doneRow.commission_amount === commRows[0].amount, 'order.commission_amount=' + doneRow.commission_amount)

  console.log('\n[S15] Turnstile يحجب عند الفشل ويمرّر عند النجاح')
  fetchState.ok = false
  const lt = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07701110001', pass: 'secret123', deviceId: 'devB', turnstileToken: 'bad' }, '9.9.9.9')
  t('S15 توكن Turnstile فاشل → turnstile_failed', lt.j.error === 'turnstile_failed', JSON.stringify(lt.j).slice(0, 80))
  fetchState.ok = true
  const lt2 = await call(authHandler, { action: 'login', turnstileToken: 'tok', phone: '07701110001', pass: 'secret123', deviceId: 'devB', turnstileToken: 'good' }, '9.9.9.9')
  t('S15 توكن ناجح يمرّ للـ OTP', lt2.j.needsOtp === true, JSON.stringify(lt2.j).slice(0, 80))

  console.log('\n[S16] عزل الأمان بالسنابشوت: الإدارة تشوف الكل، المستخدم يشوف أجهزته')
  const snapAdm = await engine.snapshot(admin)
  const snapCust = await engine.snapshot(custFresh)
  t('S16 الإدارة تشوف الأجهزة والأحداث والطلبات', snapAdm.security && snapAdm.security.devices.length >= 3 && snapAdm.security.events.length > 0 && Array.isArray(snapAdm.security.deviceRequests))
  t('S16 الزبون يشوف أجهزته فقط — بلا أحداث ولا أجهزة غيره', snapCust.security && snapCust.security.myDevices.length === 2 && snapCust.security.devices.length === 0 && snapCust.security.events.length === 0, JSON.stringify({ my: snapCust.security && snapCust.security.myDevices.length, d: snapCust.security && snapCust.security.devices.length, e: snapCust.security && snapCust.security.events.length }))
  t('S16 الزائر بلا جلسة ما عنده طبقة أمان', (await engine.snapshot(null)).security === null)

  console.log('\n[S17] health يعلن الإعدادات العامة بلا أسرار')
  const hres = mkRes()
  await healthHandler(mkReq({}, '1.1.1.1'), hres)
  const hj = JSON.parse(hres.body)
  t('S17 turnstileSiteKey علني + mailReady=false بلا أسرار', hj.turnstileSiteKey === 'ts-site-test' && hj.mailReady === false && !JSON.stringify(hj).includes('ts-secret-test'), hres.body)

  console.log('\n[S18] إلغاء جهاز من الإدارة يقتل جلسته الحالية فوراً')
  const devBrow = rows('ur_devices').find((d) => d.fingerprint === 'devB' && d.status === 'active')
  await engine.runAction(admin, 'revokeDevice', { deviceId: devBrow.id, reason: 'اختبار' })
  const snapAfter = await call(dataHandler, { action: 'snapshot' }, '9.9.9.9', 'ua-devB', lv3.j.token)
  t('S18 revokeDevice → الجلسة الحية ماتت (401)', snapAfter.status === 401 && snapAfter.j.error === 'device_revoked', snapAfter.status + '')

  console.log('\n========================================')
  console.log('النتيجة: ' + pass + '/' + (pass + fail) + ' ناجحة')
  if (failures.length) { console.log('الفاشلة:'); failures.forEach((f) => console.log('  ✗ ' + f)) }
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2) })
