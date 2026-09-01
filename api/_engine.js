// =====================================================================
//  مدللني mdllni — server business engine.
//  Assembles the exact DB snapshot the frontend render code consumes,
//  and applies every mutation with the exact same rules as the client.
//  Uses ONLY dal.* so it runs identically in prod and in the offline test.
//  v7.1 — صلاحيات صارمة: الإلغاء للزبون/الإدارة فقط · قفل السعر بعد الموافقة
//  · التقدير يُحسب من الكتالوج بالسيرفر · تعليم الأسعار تحت الأرضية.
// =====================================================================
const { dal, hashPassword, verifyPassword, ENV } = require('./_lib')

const STATUS_ORDER = ['pending', 'accepted', 'enroute', 'started', 'done']

function toMs(x) {
  if (x == null) return null
  if (typeof x === 'number') return x
  const t = new Date(x).getTime()
  return isNaN(t) ? null : t
}
const nowIso = () => new Date().toISOString()
const round = (n) => Math.round(n)

// In-memory cache for static catalog tables (30s TTL) to accelerate responses
let _staticCache = { time: 0, cats: null, services: null, settings: null }
function clearStaticCache() { _staticCache.time = 0; }

async function getCachedStatic() {
  const now = Date.now()
  if (_staticCache.time && (now - _staticCache.time < 30000) && _staticCache.cats && _staticCache.services && _staticCache.settings) {
    return { cats: _staticCache.cats, services: _staticCache.services, S: _staticCache.settings }
  }
  const [cats, services, S] = await Promise.all([
    dal.all('ur_categories'),
    dal.all('ur_services'),
    settingsMap()
  ])
  _staticCache = { time: now, cats, services, settings: S }
  return { cats, services, S }
}

let _adminProvisioned = false
async function provisionAdmin() {
  if (_adminProvisioned) return
  const existing = await dal.find('ur_profiles', { phone: ENV.ADMIN_PHONE })
  if (existing) { _adminProvisioned = true; return existing }
  const created = await dal.insert('ur_profiles', {
    role: 'admin', name: ENV.ADMIN_NAME, phone: ENV.ADMIN_PHONE,
    pass_hash: hashPassword(ENV.ADMIN_PASSWORD), area: 'الناصرية',
    status: 'active', created_at: nowIso(),
  })
  _adminProvisioned = true
  return created
}

// -------------------------------------------------------- small helpers
const DEF_NASIRIYAH_AREAS = [
  'الحبوبي / المركز', 'شارع 40', 'الإدارة المحلية', 'الحي العسكري',
  'حي المعلمين', 'حي أريدو', 'حي الحسين', 'حي الزهراء', 'حي سومر',
  'حي الشموخ', 'حي القادسية', 'حي التضحية', 'حي الفداء', 'حي الثورة',
  'صوب الشامية', 'صوب الجزيرة', 'الصالحية', 'المنصورية', 'الإسكان', 'الحي الصناعي'
];

async function settingsMap() {
  const rows = await dal.all('ur_settings')
  const m = {}
  for (const r of rows) m[r.key] = r.value
  return {
    commission: m.commission || { first: 18, standard: 15, loyal: 13, elite: 10, delivery: 10 },
    thresholds: m.thresholds || { loyalAt: 11, eliteAt: 31, minPayout: 10000 },
    areas: (m.areas && m.areas.length >= 10) ? m.areas : DEF_NASIRIYAH_AREAS,
    debt: m.debt || { warnAt: 25000, blockAt: 50000, roundingUnit: 250, maxOpenOrders: 3, loyalMinCustomers: 6, eliteMinCustomers: 15 },
  }
}
async function svc(id) { return await dal.find('ur_services', { id }) }
async function getProfile(id) { return await dal.find('ur_profiles', { id }) }
async function getProvider(id) { return await dal.find('ur_providers', { profile_id: id }) }
async function getOrder(id) { return await dal.find('ur_orders', { id }) }

async function notify(userId, icon, text, orderId) {
  if (!userId) return
  await dal.insert('ur_notifications', {
    user_id: userId, icon: icon, body: text, order_id: orderId || null,
    read: false, created_at: nowIso(),
  })
}
async function notifyAdmins(icon, text, orderId) {
  const admins = await dal.all('ur_profiles', { role: 'admin' })
  for (const a of admins) await notify(a.id, icon, text, orderId)
}
async function audit(who, action) {
  await dal.insert('ur_audit_log', { actor: who, action: action, created_at: nowIso() })
}

// ------------------------------------------------------------ DEBT LEDGER
//  المنصة لا تمسك فلوس أحد أبداً. العمولة دَين (ذمة) على المقدم يوثَّق
//  بدفتر ur_ledger مع الرصيد بعد كل قيد — كل دينار لازم يتفسَّر.
//  signedAmount: موجب يرفع الذمة (عمولة/تعديل)، سالب ينزلها (سداد).
async function applyDebt(providerId, signedAmount, kind, orderId, note) {
  // قفل تفاؤلي: لو رصيد الذمة تغيّر بين القراءة والكتابة (طلبان يكتملان بنفس اللحظة)
  // نعيد القراءة ونحاول — ما نفقد ولا دينار بالتحديث المتسابق
  for (let attempt = 0; attempt < 4; attempt++) {
    const prov = await getProvider(providerId)
    if (!prov) return null
    const cur = prov.debt || 0
    const newDebt = Math.max(0, cur + signedAmount)
    const upd = await dal.update('ur_providers', { profile_id: providerId, debt: cur }, { debt: newDebt })
    if (upd && upd.length) {
      await dal.insert('ur_ledger', {
        provider_id: providerId, order_id: orderId || null, kind: kind,
        amount: signedAmount, balance_after: newDebt, note: note || '', created_at: nowIso(),
      })
      return newDebt
    }
  }
  const e = new Error('server_error'); e.code = 'server_error'; throw e
}

function areaMatch(prov, area) {
  const arr = prov.areas || []
  return arr.indexOf('\u0643\u0644 \u0627\u0644\u0646\u0627\u0635\u0631\u064a\u0629') >= 0 || arr.indexOf(area) >= 0
}
async function providersMatching(serviceId, area, excludeId) {
  // multi-service: المقدم يطابق بأي وحدة من مهنه (مو بس الأساسية)
  const provs = await dal.all('ur_providers')
  const out = []
  for (const p of provs) {
    const ids = (Array.isArray(p.service_ids) && p.service_ids.length) ? p.service_ids : [p.service_id]
    if (ids.indexOf(serviceId) < 0) continue
    if (p.verified !== 'verified' || !p.avail) continue
    if (excludeId && p.profile_id === excludeId) continue
    if (area && !areaMatch(p, area)) continue
    const prof = await getProfile(p.profile_id)
    if (!prof || prof.status !== 'active') continue
    out.push(p)
  }
  return out
}
// إحصائيات الشهر: عدد الطلبات المكتملة + عدد الزبائن المختلفين.
//  الزبائن المختلفون هو قاتل ثغرة «أطلب من نفسي» — 100 طلب من زبون واحد = زبون واحد.
async function monthStats(providerId) {
  const done = await dal.all('ur_orders', { provider_id: providerId, status: 'done' })
  const d = new Date(), m = d.getMonth(), y = d.getFullYear()
  const month = done.filter((o) => {
    const t = new Date(o.done_at || o.created_at)
    return t.getMonth() === m && t.getFullYear() === y
  })
  return { count: month.length, customers: new Set(month.map((o) => o.customer_id)).size }
}
async function commissionRateFor(prov, order, S) {
  const c = S.commission
  const s = await svc(order.service_id)
  if (s && s.cat === 'other') return c.delivery
  const withCustomer = (await dal.all('ur_orders', {
    provider_id: prov.profile_id, customer_id: order.customer_id, status: 'done',
  })).length
  if (withCustomer === 0) return c.first
  const ms = await monthStats(prov.profile_id)
  const D = S.debt || {}
  // الشريحة تحتاج عدد طلبات + تنوّع زبائن حقيقي — وإلا تبقى standard مهما سوّى
  if (ms.count >= S.thresholds.eliteAt && ms.customers >= (D.eliteMinCustomers || 15)) return c.elite
  if (ms.count >= S.thresholds.loyalAt && ms.customers >= (D.loyalMinCustomers || 6)) return c.loyal
  return c.standard
}
//  قانون التقريب: العمولة تُدفع بأوراق نقد عراقية حقيقية — وحدة 250 د.ع.
//  التقريب للأقرب، والفرق (±124 كحد أقصى) يُوثَّق بعمود rounding_delta
//  وبملاحظة القيد — الزايد أو الناقص ذمة محاسبية معلنة، ماكو شي يختفي.
function extrasTotal(order) {
  return (order.extras || []).filter((x) => x.status === 'approved').reduce((s, x) => s + x.amount, 0)
}
function earnings(order, S) {
  const price = (order.final_price != null ? order.final_price : order.estimate) + extrasTotal(order)
  const rate = order.commission_rate != null ? order.commission_rate : S.commission.standard
  const exact = price * rate / 100
  const unit = (S.debt && S.debt.roundingUnit) || 250
  const commission = Math.round(exact / unit) * unit
  const delta = commission - Math.round(exact)
  return { price, rate, exact: Math.round(exact), commission, delta, net: price - commission }
}

// ------------------------------------------------------------ SNAPSHOT
//  viewer: profile row or null. Produces a role-scoped DB object shaped
//  EXACTLY like the frontend's localStorage DB, plus a `stats` block for
//  public homepage aggregates.
async function snapshot(viewer) {
  const isAdmin = !!(viewer && viewer.role === 'admin')
  const [staticData, profiles, providers, allOrders, reviews,
    allMsgs, allNotes, tickets, ticketMsgs, payouts, auditRows, ledgerRows,
    cOrder, cTicket, cPayout] = await Promise.all([
    getCachedStatic(),
    dal.all('ur_profiles'), dal.all('ur_providers'), dal.all('ur_orders'),
    dal.all('ur_reviews'), dal.all('ur_order_messages'), dal.all('ur_notifications'),
    dal.all('ur_tickets'), dal.all('ur_ticket_messages'), dal.all('ur_payouts'),
    dal.all('ur_audit_log'), dal.all('ur_ledger'),
    dal.find('ur_counters', { kind: 'order' }), dal.find('ur_counters', { kind: 'ticket' }),
    dal.find('ur_counters', { kind: 'payout' }),
  ])
  const { cats, services, S } = staticData

  // تنظيف السوق: طلب معلّق أكثر من 48 ساعة ينلغي تلقائياً ويُخطر الزبون (CAS — ما يتكرر)
  const staleBefore = Date.now() - 48 * 3600000
  for (const o of allOrders) {
    if (o.status === 'pending' && (toMs(o.created_at) || 0) < staleBefore) {
      const swept = await dal.update('ur_orders', { id: o.id, status: 'pending' }, {
        status: 'cancelled', cancelled_by: null,
        cancel_reason: 'انتهت صلاحية الطلب تلقائياً — ما انقبل خلال 48 ساعة',
        timeline: (o.timeline || []).concat([{ s: 'cancelled', at: Date.now() }]),
      })
      if (swept && swept.length) {
        o.status = 'cancelled'
        await notify(o.customer_id, '⌛', 'طلبك ' + o.id + ' انتهت صلاحيته — ما لكّى مقدم متاح بمنطقتك. اطلب من جديد وإحنا نوسّع التغطية.', o.id)
      }
    }
  }

  const provByProfile = {}
  for (const p of providers) provByProfile[p.profile_id] = p
  const reviewByOrder = {}
  for (const r of reviews) reviewByOrder[r.order_id] = r

  // ---- users (global; phone masked for non-admin/non-self; pass never sent)
  const canSeePhone = (pid) => isAdmin || (viewer && viewer.id === pid)
  const mask = (phone) => phone ? ('•••••••' + String(phone).slice(-4)) : ''
  const users = profiles.map((pf) => {
    const u = {
      id: pf.id, role: pf.role, name: pf.name,
      phone: canSeePhone(pf.id) ? pf.phone : mask(pf.phone),
      pass: '', area: pf.area, createdAt: toMs(pf.created_at), status: pf.status,
    }
    const pv = provByProfile[pf.id]
    if (pf.role === 'provider') {
      const pVerified = (pv && pv.verified) || 'pending'
      let rejectReason = ''
      let adminNote = ''
      
      // Sort notifications by newest first to get the most recent decision
      const userNotes = (allNotes || [])
        .filter(n => n.user_id === pf.id)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

      if (pVerified === 'rejected') {
        for (const n of userNotes) {
          if (n.icon === '🚫' || (n.body && n.body.includes('مرفوض'))) {
            const match = n.body.match(/السبب:\s*(.+)$/)
            if (match) { rejectReason = match[1].trim(); break }
          }
        }
      } else if (pVerified === 'verified') {
        for (const n of userNotes) {
          if (n.icon === '🎉' || (n.body && n.body.includes('وثّقت'))) {
            const match = n.body.match(/ملاحظة:\s*(.+)$/)
            if (match) { adminNote = match[1].trim(); break }
          }
        }
      }

      u.provider = {
        serviceId: (pv && pv.service_id) || 's1',
        serviceIds: (pv && Array.isArray(pv.service_ids) && pv.service_ids.length) ? pv.service_ids : [ (pv && pv.service_id) || 's1' ],
        exp: (pv && pv.exp) || 0,
        areas: (pv && Array.isArray(pv.areas) && pv.areas.length) ? pv.areas : ['كل الناصرية', pf.area || 'الناصرية'],
        verified: pVerified,
        avail: pv ? pv.avail !== false : true,
        ratingSum: (pv && pv.rating_sum) || 0,
        ratingCount: (pv && pv.rating_count) || 0,
        jobs: (pv && pv.jobs) || 0,
        balance: (pv && pv.balance) || 0,
        settled: (pv && pv.settled) || 0,
        debt: (pv && pv.debt) || 0,
        avgResponseMin: (pv && pv.resp_count) ? Math.max(1, Math.round((pv.resp_sum || 0) / pv.resp_count)) : null,
        sensitive: pv ? !!pv.sensitive : false,
        rejectReason: rejectReason || '',
        adminNote: adminNote || '',
      }
    }
    return u
  })

  // ---- orders (scoped)
  const myProv = (viewer && viewer.role === 'provider') ? (provByProfile[viewer.id] || {
    service_id: 's1', areas: ['كل الناصرية', viewer.area || 'الناصرية'], verified: 'pending', avail: true
  }) : null
  function orderVisible(o) {
    if (isAdmin) return true
    if (!viewer) return false
    if (o.customer_id === viewer.id) return true
    if (o.provider_id === viewer.id) return true
    const mySvcIds = myProv ? ((Array.isArray(myProv.service_ids) && myProv.service_ids.length) ? myProv.service_ids : [myProv.service_id]) : []
    if (viewer.role === 'provider' && myProv && o.status === 'pending' &&
        mySvcIds.indexOf(o.service_id) >= 0 && areaMatch(myProv, o.area) &&
        (o.rejected_by || []).indexOf(viewer.id) < 0 && o.customer_id !== viewer.id) return true
    return false
  }
  function shapeOrder(o) {
    const rv = reviewByOrder[o.id]
    return {
      id: o.id, serviceId: o.service_id, customerId: o.customer_id, providerId: o.provider_id,
      desc: o.description, area: o.area,
      // الخصوصية: العنوان الدقيق يظهر فقط للأطراف والإدارة — مقدم يتصفح طلب معلّق يشوف المنطقة بس
      address: (isAdmin || (viewer && (o.customer_id === viewer.id || o.provider_id === viewer.id))) ? o.address : '',
      when: o.when_type,
      whenTime: o.when_time, payMethod: o.pay_method, estimate: o.estimate,
      finalPrice: o.final_price, priceConfirmed: o.price_confirmed, status: o.status,
      timeline: o.timeline || [], createdAt: toMs(o.created_at),
      commissionRate: o.commission_rate == null ? null : Number(o.commission_rate),
      commissionAmount: o.commission_amount == null ? null : o.commission_amount,
      roundingDelta: o.rounding_delta || 0,
      flagged: isAdmin ? !!o.flagged : false,
      review: rv ? { stars: rv.stars, text: rv.body, at: toMs(rv.created_at) } : null,
      extras: o.extras || [],
      disputed: !!o.disputed, rejectedBy: o.rejected_by || [], doneAt: toMs(o.done_at),
      cancelledBy: o.cancelled_by || null, cancelReason: o.cancel_reason || null,
    }
  }
  const visibleOrders = allOrders.filter(orderVisible)
  const orders = visibleOrders.map(shapeOrder)
  const visibleOrderIds = {}
  for (const o of visibleOrders) visibleOrderIds[o.id] = true

  // ---- messages (only for visible orders)
  const messages = allMsgs
    .filter((m) => isAdmin || visibleOrderIds[m.order_id])
    .map((m) => ({ id: 'm' + m.id, orderId: m.order_id, fromId: m.from_id, text: m.body, at: toMs(m.created_at) }))

  // ---- notes (only mine)
  const notes = allNotes
    .filter((n) => viewer && n.user_id === viewer.id)
    .map((n) => ({ id: 'n' + n.id, userId: n.user_id, icon: n.icon, text: n.body, orderId: n.order_id, at: toMs(n.created_at), read: !!n.read }))
    .sort((a, b) => b.at - a.at)

  // ---- tickets (mine, or all for admin) with embedded msgs
  const msgsByTicket = {}
  for (const tm of ticketMsgs) {
    (msgsByTicket[tm.ticket_id] = msgsByTicket[tm.ticket_id] || []).push(tm)
  }
  const ticketsOut = tickets
    .filter((t) => isAdmin || (viewer && t.user_id === viewer.id))
    .map((t) => ({
      id: t.id, userId: t.user_id, orderId: t.order_id, subject: t.subject,
      status: t.status, at: toMs(t.created_at),
      msgs: (msgsByTicket[t.id] || [])
        .sort((a, b) => toMs(a.created_at) - toMs(b.created_at))
        .map((tm) => ({ from: tm.from_id, text: tm.body, at: toMs(tm.created_at) })),
    }))
    .sort((a, b) => b.at - a.at)

  // ---- payouts (mine / all for admin) — v7: سجل بلاغات السداد من المقدمين
  const payoutsOut = payouts
    .filter((p) => isAdmin || (viewer && p.provider_id === viewer.id))
    .map((p) => ({ id: p.id, providerId: p.provider_id, amount: p.amount, status: p.status, direction: p.direction || 'settlement', at: toMs(p.requested_at), paidAt: toMs(p.paid_at) }))
    .sort((a, b) => b.at - a.at)

  // ---- audit (admin only)
  const auditOut = (isAdmin ? auditRows : [])
    .map((a) => ({ at: toMs(a.created_at), who: a.actor, action: a.action }))
    .sort((a, b) => b.at - a.at)

  // ---- ledger (mine / all for admin) — آخر 50 قيد
  const ledgerOut = (ledgerRows || [])
    .filter((l) => isAdmin || (viewer && l.provider_id === viewer.id))
    .sort((a, b) => toMs(b.created_at) - toMs(a.created_at))
    .slice(0, 50)
    .map((l) => ({ id: 'l' + l.id, orderId: l.order_id, kind: l.kind, amount: l.amount, balanceAfter: l.balance_after, note: l.note, at: toMs(l.created_at) }))

  // ---- global stats for public homepage
  const doneAll = allOrders.filter((o) => o.status === 'done')
  const verifiedProvs = providers.filter((p) => {
    if (p.verified !== 'verified') return false
    const prof = profiles.find((x) => x.id === p.profile_id)
    return prof && prof.status === 'active'
  }).length
  const ratedDone = doneAll.filter((o) => reviewByOrder[o.id])
  const avgR = ratedDone.length
    ? ratedDone.reduce((s, o) => s + reviewByOrder[o.id].stars, 0) / ratedDone.length : null
  const statReviews = ratedDone
    .sort((a, b) => toMs(reviewByOrder[b.id].created_at) - toMs(reviewByOrder[a.id].created_at))
    .slice(0, 3)
    .map((o) => ({
      id: o.id, serviceId: o.service_id, customerId: o.customer_id, providerId: o.provider_id,
      status: 'done',
      review: { stars: reviewByOrder[o.id].stars, text: reviewByOrder[o.id].body, at: toMs(reviewByOrder[o.id].created_at) },
    }))

  const db = {
    meta: {
      orderSeq: cOrder ? cOrder.value + 1 : 1042,
      userSeq: profiles.length + 1,
      noteSeq: 1, msgSeq: 1,
      ticketSeq: cTicket ? cTicket.value + 1 : 1,
      payoutSeq: cPayout ? cPayout.value + 1 : 1,
      seededAt: Date.now(),
    },
    settings: {
      commission: S.commission,
      loyalAt: S.thresholds.loyalAt, eliteAt: S.thresholds.eliteAt, minPayout: S.thresholds.minPayout,
      areas: S.areas,
      debt: S.debt,
    },
    cats: cats.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    services: services.map((s) => ({
      id: s.id, icon: s.icon, name: s.name, cat: s.cat, min: s.min_price, max: s.max_price,
      unit: s.unit, popular: !!s.popular, wave: s.wave, active: s.active !== false,
      sensitive: !!s.sensitive, gold: !!s.gold, desc: s.description,
    })).sort((a, b) => (parseInt(a.id.slice(1)) || 0) - (parseInt(b.id.slice(1)) || 0)),
    users: users,
    session: viewer ? { userId: viewer.id, at: Date.now() } : null,
    orders: orders,
    messages: messages,
    notes: notes,
    tickets: ticketsOut,
    payouts: payoutsOut,
    audit: auditOut,
    ledger: ledgerOut,
    stats: { verifiedProvs: verifiedProvs, doneOrders: doneAll.length, avgR: avgR, reviews: statReviews },
  }
  return db
}

// ------------------------------------------------------------- ACTIONS
function need(cond, code) { if (!cond) { const e = new Error(code); e.code = code; e.status = 400; throw e } }
function forbid(cond) { if (!cond) { const e = new Error('forbidden'); e.code = 'forbidden'; e.status = 403; throw e } }

async function runAction(actor, action, p) {
  p = p || {}
  const S = await settingsMap()
  const isAdmin = actor && actor.role === 'admin'

  switch (action) {
    // ---------------- customer ----------------
    case 'createOrder': {
      const s = await svc(p.serviceId)
      need(s && s.active !== false, 'service_unavailable')
      need(p.area, 'area_required')
      // التقدير يُحسب من الكتالوج بالسيرفر — لا نثق بأي سعر يرسله العميل
      const est = Math.max(1000, Math.round(((s.min_price || 0) + (s.max_price || 0)) / 2))
      // مكافحة الإغراق: حد أقصى للطلبات المفتوحة لكل زبون
      const myOpen = (await dal.all('ur_orders', { customer_id: actor.id, status: 'pending' })).length
      need(myOpen < ((S.debt && S.debt.maxOpenOrders) || 3), 'too_many_open')
      // سوء استخدام الإلغاء: 3 إلغاءات خلال 24 ساعة → إيقاف الطلبات مؤقتاً (حماية وقت المقدمين)
      const dayAgo = Date.now() - 86400000
      const myCancels = (await dal.all('ur_orders', { customer_id: actor.id, status: 'cancelled' }))
        .filter((x) => x.cancelled_by === actor.id && toMs(x.created_at) > dayAgo).length
      need(myCancels < 3, 'cancel_abuse')
      const seq = await dal.nextSeq('order', 1042)
      const id = 'UR-' + seq
      // كشف التعامل الذاتي: تطابق بصمة جهاز الزبون مع جهاز أي مقدم مطابق
      // → الطلب يُعلَّم للإدارة ويُخفى عن ذلك المقدم تحديداً
      const myDevices = actor.devices || []
      let flagged = false
      const matched = await providersMatching(p.serviceId, p.area, actor.id)
      const targets = []
      for (const t of matched) {
        const tp = await getProfile(t.profile_id)
        const shared = tp && (tp.devices || []).some((d) => myDevices.indexOf(d) >= 0)
        if (shared) flagged = true
        else targets.push(t)
      }
      await dal.insert('ur_orders', {
        id: id, service_id: p.serviceId, customer_id: actor.id, provider_id: null,
        description: p.desc || '', area: p.area, address: p.address || '',
        when_type: p.when === 'scheduled' ? 'scheduled' : 'now', when_time: p.whenTime || null,
        pay_method: p.payMethod === 'wallet' ? 'wallet' : 'cash', estimate: est,
        final_price: null, price_confirmed: false, status: 'pending', commission_rate: null,
        timeline: [{ s: 'pending', at: Date.now() }], rejected_by: [], disputed: false,
        flagged: flagged, created_at: nowIso(),
      })
      if (flagged) await notifyAdmins('🚨', 'طلب ' + id + ' مُعلَّم: تطابق بصمة جهاز الزبون مع جهاز مقدم خدمة مطابق (اشتباه تعامل ذاتي)', id)
      // ماكو مقدم متاح؟ الإدارة لازم تدري فوراً — الطلب ما يظل صامت
      if (!targets.length) await notifyAdmins('⚠️', 'طلب ' + id + ' (' + (s ? s.name : '') + ' — ' + p.area + ') بدون مقدم موثّق متاح — وفّر مقدم أو كلّف أحد', id)
      for (const t of targets) await notify(t.profile_id, '\ud83d\udce5', '\u0637\u0644\u0628 \u062c\u062f\u064a\u062f ' + id + ' \u0628\u0645\u0646\u0637\u0642\u062a\u0643 \u2014 ' + (s ? s.name : ''), id)
      return { orderId: id }
    }
    case 'confirmPrice': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.customer_id === actor.id || isAdmin)
      // الموافقة فقط على سعر مخصص بحالة مقبول — ما تنضغط على فراغ أو على طلب مكتمل
      need(o.status === 'accepted' && o.final_price != null && o.final_price !== o.estimate && !o.price_confirmed, 'order_unavailable')
      await dal.update('ur_orders', { id: o.id }, { price_confirmed: true })
      if (o.provider_id) await notify(o.provider_id, '\ud83d\udcb0', '\u0627\u0644\u0632\u0628\u0648\u0646 \u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0644\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      return {}
    }
    case 'rate': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.customer_id === actor.id)
      need(o.status === 'done', 'order_not_done')
      const stars = parseInt(p.stars) || 0
      need(stars >= 1 && stars <= 5, 'bad_stars')
      const existing = await dal.find('ur_reviews', { order_id: o.id })
      need(!existing, 'already_rated')
      // مكافحة التقييم الذاتي: نفس الجهاز بين الزبون والمقدم = ممنوع
      const provProf = o.provider_id ? await getProfile(o.provider_id) : null
      const sharedDev = provProf && (provProf.devices || []).some((d) => (actor.devices || []).indexOf(d) >= 0)
      need(!sharedDev, 'self_dealing')
      const myRv = await dal.insert('ur_reviews', { order_id: o.id, stars: stars, body: p.text || '', created_at: nowIso() })
      // حارس السباق: تقييم وحدة بس للطلب مهما ضغط الزبون بسرعة
      const rvCount = await dal.all('ur_reviews', { order_id: o.id })
      if (rvCount.length > 1) { await dal.del('ur_reviews', { id: myRv.id }); need(false, 'already_rated') }
      const prov = await getProvider(o.provider_id)
      if (prov) await dal.update('ur_providers', { profile_id: o.provider_id }, { rating_sum: prov.rating_sum + stars, rating_count: prov.rating_count + 1 })
      if (o.provider_id) await notify(o.provider_id, '\u2b50', '\u062a\u0642\u064a\u064a\u0645 \u062c\u062f\u064a\u062f ' + stars + '/5 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      return {}
    }
    // ---------------- provider ----------------
    case 'acceptOrder': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      const o = await getOrder(p.orderId); need(o && o.status === 'pending', 'order_unavailable')
      need(prov.verified === 'verified', 'not_verified')
      need(prov.avail, 'not_available')
      // لا قبول خارج نطاق مهنه ومناطقه — الصلاحية على السيرفر مو بس بالواجهة
      const provSvcIds = (Array.isArray(prov.service_ids) && prov.service_ids.length) ? prov.service_ids : [prov.service_id]
      need(provSvcIds.indexOf(o.service_id) >= 0 && areaMatch(prov, o.area), 'forbidden')
      // بوابة الذمة: من تجاوز حد الإيقاف ما يستلم طلبات حتى يسدّد
      need((prov.debt || 0) < ((S.debt && S.debt.blockAt) || 50000), 'debt_blocked')
      const rate = await commissionRateFor(prov, o, S)
      // CAS: قبول ذري — لو مقدم ثاني سبق بالمللي ثانية، التحديث يفشل وما يصير تمزّق
      const accepted = await dal.update('ur_orders', { id: o.id, status: 'pending' }, {
        provider_id: actor.id, status: 'accepted', final_price: o.estimate,
        price_confirmed: false, commission_rate: rate,
        timeline: (o.timeline || []).concat([{ s: 'accepted', at: Date.now() }]),
      })
      need(accepted.length > 0, 'order_unavailable')
      // قياس سرعة الاستجابة — متوسط تراكمي يظهر بملف المقدم
      const respMin = Math.max(1, Math.round((Date.now() - (toMs(o.created_at) || Date.now())) / 60000))
      await dal.update('ur_providers', { profile_id: actor.id }, { resp_sum: (prov.resp_sum || 0) + respMin, resp_count: (prov.resp_count || 0) + 1 })
      await notify(o.customer_id, '\u2705', '\u0645\u0642\u062f\u0645 \u0645\u0648\u062b\u0651\u0642 \u0642\u0628\u0644 \u0637\u0644\u0628\u0643 ' + o.id + ': ' + actor.name, o.id)
      await audit(actor.name, '\u0642\u0628\u0648\u0644 \u0627\u0644\u0637\u0644\u0628 ' + o.id)
      return {}
    }
    case 'setFinalPrice': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id || isAdmin)
      // السعر ينقفل بعد موافقة الزبون — وما ينعدل بعد ما يتحرك العمل
      need(o.status === 'accepted' && !o.price_confirmed, 'price_locked')
      const v = parseInt(p.price) || 0; need(v >= 1000, 'bad_price')
      await dal.update('ur_orders', { id: o.id }, { final_price: v, price_confirmed: false })
      // سعر تحت أرضية الكتالوج = اشتباه التفاف على العمولة → يُعلَّم للإدارة
      const sv = await svc(o.service_id)
      if (sv && sv.min_price && v < sv.min_price) {
        await dal.update('ur_orders', { id: o.id }, { flagged: true })
        await notifyAdmins('🚨', 'طلب ' + o.id + ' سُعّر بـ ' + v + ' د.ع — تحت أرضية الكتالوج (' + sv.min_price + ') — اشتباه التفاف على العمولة', o.id)
      }
      await notify(o.customer_id, '\ud83d\udcb0', '\u0645\u0642\u062f\u0645 \u0627\u0644\u062e\u062f\u0645\u0629 \u062d\u062f\u062f \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0644\u0644\u0637\u0644\u0628 ' + o.id + ': ' + v + ' \u062f.\u0639', o.id)
      return {}
    }
    case 'revertToEstimate': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id)
      // المقدم يرجّع الطلب للسعر التقديري ويكمّل بدون انتظار — يفكّ جمود «الزبون ما رد»
      need(o.status === 'accepted' && o.final_price != null && o.final_price !== o.estimate && !o.price_confirmed, 'order_unavailable')
      await dal.update('ur_orders', { id: o.id }, { final_price: o.estimate, price_confirmed: false })
      await notify(o.customer_id, '\ud83d\udcb0', 'مقدم الخدمة رجّع طلبك ' + o.id + ' للسعر التقديري (' + o.estimate + ' د.ع) ويكمّل بدون انتظار', o.id)
      await audit(actor.name, 'رجّع السعر للتقديري ' + o.id)
      return {}
    }
    // ---------------- الأعمال الإضافية الميدانية (موثقة + بموافقة الزبون) ----------------
    case 'addExtra': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id)
      need(['accepted', 'enroute', 'started'].indexOf(o.status) >= 0, 'order_unavailable')
      const desc = String(p.desc || '').trim(); need(desc.length >= 3, 'bad_body')
      const amount = parseInt(p.amount) || 0; need(amount >= 250 && amount % 250 === 0, 'bad_price')
      const extras = o.extras || []
      need(extras.filter((x) => x.status === 'pending').length < 5, 'too_many_open')
      const ex = { id: 'EX' + (extras.length + 1) + '-' + (Date.now() % 100000), desc: desc, amount: amount, status: 'pending', at: Date.now() }
      await dal.update('ur_orders', { id: o.id }, { extras: extras.concat([ex]) })
      await notify(o.customer_id, '➕', 'مقدم الخدمة اقترح عملاً إضافياً على طلبك ' + o.id + ': ' + desc + ' — ' + amount + ' د.ع — وافق أو ارفض', o.id)
      await audit(actor.name, 'اقترح إضافة ' + ex.id + ' على ' + o.id + ' (' + amount + ' د.ع)')
      // إضافة تتجاوز ضعف قيمة الطلب = غير معتادة → تُعلَّم للإدارة
      const curTotal = (o.final_price != null ? o.final_price : o.estimate) + extrasTotal(o)
      if (amount > curTotal * 2) {
        await dal.update('ur_orders', { id: o.id }, { flagged: true })
        await notifyAdmins('🚨', 'إضافة غير معتادة على الطلب ' + o.id + ': ' + amount + ' د.ع (ضعف قيمة الطلب تقريباً) — راجع التفاصيل', o.id)
      }
      return { extraId: ex.id }
    }
    case 'respondExtra': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.customer_id === actor.id)
      const extras = o.extras || []
      const ex = extras.find((x) => x.id === p.extraId); need(ex, 'order_not_found')
      need(ex.status === 'pending', 'order_unavailable')
      const approve = !!p.approve
      ex.status = approve ? 'approved' : 'rejected'
      await dal.update('ur_orders', { id: o.id }, { extras: extras })
      if (o.provider_id) await notify(o.provider_id, approve ? '✅' : '🚫', 'الزبون ' + (approve ? 'وافق على' : 'رفض') + ' الإضافة «' + ex.desc + '» (' + ex.amount + ' د.ع) — طلب ' + o.id, o.id)
      return { status: ex.status }
    }
    case 'withdrawExtra': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id)
      const extras = o.extras || []
      const ex = extras.find((x) => x.id === p.extraId); need(ex, 'order_not_found')
      need(ex.status === 'pending', 'order_unavailable')
      ex.status = 'withdrawn'
      await dal.update('ur_orders', { id: o.id }, { extras: extras })
      await notify(o.customer_id, '↩️', 'مقدم الخدمة سحب الإضافة المقترحة «' + ex.desc + '» من طلبك ' + o.id, o.id)
      return {}
    }
    case 'advanceOrder': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id || isAdmin)
      // القفل يشتغل فقط إذا المقدم غيّر السعر عن التقديري — بالسعر التقديري يكمل عادي بدون انتظار
      if (o.status === 'accepted' && o.final_price != null && o.final_price !== o.estimate && !o.price_confirmed) need(false, 'price_not_confirmed')
      const i = STATUS_ORDER.indexOf(o.status); need(i >= 0 && i < STATUS_ORDER.length - 1, 'cannot_advance')
      const next = STATUS_ORDER[i + 1]
      // الإكمال حدث مالي — طلب عليه نزاع مفتوح ما يكتمِل حتى تُحسم الإدارة
      if (next === 'done' && o.disputed) need(false, 'disputed_open')
      // إكمال وكو إضافة معلّقة = عمولة ناقصة — الزبون يوافق/يرفض أو المقدم يسحب أولاً
      if (next === 'done' && (o.extras || []).some((x) => x.status === 'pending')) need(false, 'extra_pending')
      const patch = { status: next, timeline: (o.timeline || []).concat([{ s: next, at: Date.now() }]) }
      if (next === 'done') {
        patch.done_at = nowIso()
        const prov = await getProvider(o.provider_id)
        const e = earnings(o, S)
        // التوثيق المحاسبي الكامل على الطلب نفسه
        patch.commission_amount = e.commission
        patch.rounding_delta = e.delta
        if (prov) {
          await dal.update('ur_providers', { profile_id: o.provider_id }, { jobs: prov.jobs + 1 })
          // العمولة تصير ذمة موثّقة — المنصة ما تدفع ولا تستلم، تسجّل فقط
          const nd = await applyDebt(o.provider_id, e.commission, 'commission', o.id,
            'عمولة ' + e.rate + '% عن الطلب ' + o.id + ' بقيمة ' + e.price + ' د.ع' +
            (extrasTotal(o) > 0 ? ' (أساسي ' + (e.price - extrasTotal(o)) + ' + إضافات ' + extrasTotal(o) + ')' : '') +
            (e.delta !== 0 ? ' — فرق تقريب موثّق ' + (e.delta > 0 ? '+' : '') + e.delta + ' د.ع' : ''))
          if (nd != null && nd >= (S.debt.warnAt || 25000) && (prov.debt || 0) < (S.debt.warnAt || 25000)) {
            await notify(o.provider_id, '⚠️', 'ذمتك للمنصة وصلت ' + nd + ' د.ع — سدّدها قبل حد الإيقاف ' + (S.debt.blockAt || 50000) + ' د.ع', null)
          }
        }
        await notify(o.customer_id, '\ud83c\udf89', '\u0637\u0644\u0628\u0643 ' + o.id + ' \u0627\u0643\u062a\u0645\u0644! \u0642\u064a\u0651\u0645 \u0627\u0644\u062e\u062f\u0645\u0629', o.id)
      } else {
        await notify(o.customer_id, '\ud83d\udd14', '\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      }
      await dal.update('ur_orders', { id: o.id }, patch)
      return {}
    }
    case 'providerDrop': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.provider_id === actor.id)
      await dal.update('ur_orders', { id: o.id }, {
        rejected_by: (o.rejected_by || []).concat([actor.id]), provider_id: null,
        status: 'pending', final_price: null, price_confirmed: false, commission_rate: null,
        timeline: (o.timeline || []).concat([{ s: 'pending', at: Date.now() }]),
      })
      await notify(o.customer_id, '\ud83d\udd04', '\u0645\u0642\u062f\u0645 \u0627\u0644\u062e\u062f\u0645\u0629 \u0627\u0639\u062a\u0630\u0631 \u0639\u0646 \u0627\u0644\u0637\u0644\u0628 ' + o.id + ' \u2014 \u0631\u062c\u0639 \u0644\u0644\u0645\u0642\u062f\u0645\u064a\u0646', o.id)
      // نمط الاعتذارات: كل 3 اعتذارات تراكمية → تنبيه مراجعة أداء للإدارة
      const provD = await getProvider(actor.id)
      if (provD) {
        const dc = (provD.drop_count || 0) + 1
        await dal.update('ur_providers', { profile_id: actor.id }, { drop_count: dc })
        if (dc >= 3 && dc % 3 === 0) await notifyAdmins('⚠️', 'مقدم ' + actor.name + ' اعتذر عن ' + dc + ' طلبات — راجع أداءه', null)
      }
      await notifyAdmins('🔄', 'مقدم اعتذر عن الطلب ' + o.id + ' بعد استلامه — ' + actor.name, o.id)
      await audit(actor.name, '\u0627\u0639\u062a\u0630\u0627\u0631 \u0639\u0646 \u0627\u0644\u0637\u0644\u0628 ' + o.id)
      return {}
    }
    // ---------------- v7: السداد (بلاغ من المقدم ← تأكيد من الإدارة) ----------------
    case 'reportPayment': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      const amount = parseInt(p.amount) || 0
      need(amount >= 250 && amount % 250 === 0, 'bad_price')
      need(amount <= (prov.debt || 0), 'overpay')
      const open = await dal.all('ur_payouts', { provider_id: actor.id, status: 'pending' })
      need(!open.length, 'payout_unavailable')
      const seq = await dal.nextSeq('payout', 1)
      const id = 'ST-' + seq
      await dal.insert('ur_payouts', { id: id, provider_id: actor.id, amount: amount, status: 'pending', direction: 'settlement', requested_at: nowIso(), paid_at: null })
      // حارس الدبل-كليك: لو انفتح أكثر من بلاغ بنفس اللحظة (سباق) — نلغي الزائد فوراً
      const pendNow = await dal.all('ur_payouts', { provider_id: actor.id, status: 'pending' })
      if (pendNow.length > 1) { await dal.del('ur_payouts', { id: id }); need(false, 'payout_unavailable') }
      await notifyAdmins('💵', 'بلاغ سداد ذمة ' + id + ' من ' + actor.name + ': ' + amount + ' د.ع — يحتاج تأكيد استلام', null)
      await audit(actor.name, 'بلاغ سداد ' + id)
      return { settlementId: id }
    }
    case 'payPayout': case 'confirmSettlement': {
      forbid(isAdmin)
      const po = await dal.find('ur_payouts', { id: p.payoutId }); need(po && po.status === 'pending', 'payout_unavailable')
      const prof = await getProfile(po.provider_id)
      // CAS: التأكيد مرة وحدة بس — دبل-كليك أو سباق ما يخصم الذمة مرتين
      const paidRows = await dal.update('ur_payouts', { id: po.id, status: 'pending' }, { status: 'paid', paid_at: nowIso() })
      need(paidRows.length > 0, 'payout_unavailable')
      // السداد يخفّض الذمة ويُقيد بالدفتر — ماكو خصم بدون قيد
      const nd = await applyDebt(po.provider_id, -po.amount, 'payment', null, 'تأكيد استلام سداد ' + po.id)
      await notify(po.provider_id, '✅', 'استلمنا دفعتك ' + po.amount + ' د.ع — ذمتك المتبقية ' + (nd == null ? 0 : nd) + ' د.ع', null)
      await audit(actor.name, 'تأكيد سداد ' + po.id + ' من ' + (prof ? prof.name : po.provider_id))
      return { debt: nd }
    }
    case 'adjustDebt': {
      // تسوية قانونية: أي زايد/ناقص يدوي لازم سبب مكتوب + قيد + أثر بالأوديت
      forbid(isAdmin)
      const amount = parseInt(p.amount) || 0; need(amount !== 0, 'bad_price')
      const note = String(p.note || '').trim(); need(note.length >= 3, 'bad_body')
      // مكافحة التواطؤ: تنزيل الذمة (قيمة سالبة) يتطلب رقم طلب مرجعي يخص نفس المقدم —
      // وثاني تنزيل+ خلال 30 يوم → تنبيه «نمط تواطؤ محتمل» لباقي الإدارة قبل الاعتماد
      let adjOrderId = null
      if (amount < 0) {
        adjOrderId = String(p.orderId || '').trim()
        need(/^UR-\d+$/.test(adjOrderId), 'bad_body')
        const refOrder = await getOrder(adjOrderId)
        need(refOrder && refOrder.provider_id === p.userId, 'order_not_found')
        const monthAgo = Date.now() - 30 * 86400000
        const prevRed = (await dal.all('ur_ledger', { provider_id: p.userId, kind: 'adjustment' }))
          .filter((l) => l.amount < 0 && toMs(l.created_at) > monthAgo).length
        if (prevRed >= 1) {
          await notifyAdmins('🚨', 'تنزيل ذمة متكرر لنفس المقدم خلال 30 يوم (' + (prevRed + 1) + ' مرة) — نمط تواطؤ محتمل: راجع الدفتر والمحادثات قبل أي اعتماد إضافي', null)
        }
      }
      const nd = await applyDebt(p.userId, amount, 'adjustment', adjOrderId, 'تعديل إداري: ' + note)
      await notify(p.userId, '⚖️', 'تعديل على ذمتك: ' + (amount > 0 ? '+' : '') + amount + ' د.ع — ' + note, null)
      await audit(actor.name, 'تعديل ذمة ' + (amount > 0 ? '+' : '') + amount + ' — ' + note)
      return { debt: nd }
    }
    case 'toggleAvail': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      need(prov.verified === 'verified', 'not_verified')
      await dal.update('ur_providers', { profile_id: actor.id }, { avail: !prov.avail })
      return { avail: !prov.avail }
    }
    // ---------------- shared: chat / tickets ----------------
    case 'sendMessage': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(isAdmin || o.customer_id === actor.id || o.provider_id === actor.id)
      const text = String(p.text || '').trim(); need(text, 'empty')
      await dal.insert('ur_order_messages', { order_id: o.id, from_id: actor.id, body: text, created_at: nowIso() })
      const other = actor.id === o.customer_id ? o.provider_id : o.customer_id
      if (other) await notify(other, '\ud83d\udcac', '\u0631\u0633\u0627\u0644\u0629 \u062c\u062f\u064a\u062f\u0629 \u0628\u0627\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      return {}
    }
    case 'openTicket': {
      const subject = String(p.subject || '').trim(); const body = String(p.body || '').trim()
      need(subject.length >= 3, 'bad_subject'); need(body.length >= 5, 'bad_body')
      const seq = await dal.nextSeq('ticket', 1); const id = 'T-' + seq
      await dal.insert('ur_tickets', { id: id, user_id: actor.id, order_id: null, subject: subject, status: 'open', created_at: nowIso() })
      await dal.insert('ur_ticket_messages', { ticket_id: id, from_id: actor.id, body: body, created_at: nowIso() })
      await notifyAdmins('\ud83c\udfa7', '\u062a\u0630\u0643\u0631\u0629 \u062c\u062f\u064a\u062f\u0629 ' + id + ' \u0645\u0646 ' + actor.name, null)
      return { ticketId: id }
    }
    case 'disputeOrder': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      forbid(o.customer_id === actor.id || o.provider_id === actor.id)
      const body = String(p.body || '').trim(); need(body.length >= 5, 'bad_body')
      await dal.update('ur_orders', { id: o.id }, { disputed: true })
      const seq = await dal.nextSeq('ticket', 1); const id = 'T-' + seq
      await dal.insert('ur_tickets', { id: id, user_id: actor.id, order_id: o.id, subject: '\u0646\u0632\u0627\u0639 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 ' + o.id, status: 'open', created_at: nowIso() })
      await dal.insert('ur_ticket_messages', { ticket_id: id, from_id: actor.id, body: body, created_at: nowIso() })
      await notifyAdmins('\u26a0\ufe0f', '\u0646\u0632\u0627\u0639 \u062c\u062f\u064a\u062f \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      return { ticketId: id }
    }
    case 'resolveDispute': {
      forbid(isAdmin)
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      need(o.disputed, 'order_unavailable')
      await dal.update('ur_orders', { id: o.id }, { disputed: false })
      await notify(o.customer_id, '✅', 'انحسم النزاع على طلبك ' + o.id + ' — الإدارة راجعت وحسمت', o.id)
      if (o.provider_id) await notify(o.provider_id, '✅', 'انحسم النزاع على الطلب ' + o.id, o.id)
      await audit(actor.name, 'حسم النزاع على الطلب ' + o.id)
      return {}
    }
    case 'replyTicket': {
      const t = await dal.find('ur_tickets', { id: p.ticketId }); need(t, 'ticket_not_found')
      forbid(isAdmin || t.user_id === actor.id)
      const body = String(p.body || '').trim(); need(body, 'empty')
      await dal.insert('ur_ticket_messages', { ticket_id: t.id, from_id: actor.id, body: body, created_at: nowIso() })
      if (isAdmin) await notify(t.user_id, '\ud83c\udfa7', '\u0631\u062f \u0645\u0646 \u0627\u0644\u0625\u062f\u0627\u0631\u0629 \u0639\u0644\u0649 \u062a\u0630\u0643\u0631\u062a\u0643 ' + t.id, t.order_id)
      else await notifyAdmins('\ud83c\udfa7', '\u0631\u062f \u062c\u062f\u064a\u062f \u0639\u0644\u0649 \u0627\u0644\u062a\u0630\u0643\u0631\u0629 ' + t.id, t.order_id)
      return {}
    }
    case 'markAllRead': {
      const mine = await dal.all('ur_notifications', { user_id: actor.id })
      for (const n of mine) if (!n.read) await dal.update('ur_notifications', { id: n.id }, { read: true })
      return {}
    }
    // ---------------- admin ----------------
    case 'verifyProvider': case 'rejectProvider': case 'unverifyProvider': case 'reconsiderProvider': {
      forbid(isAdmin)
      const prov = await getProvider(p.userId); need(prov, 'not_provider')
      const map = {
        verifyProvider: 'verified',
        rejectProvider: 'rejected',
        unverifyProvider: 'pending',
        reconsiderProvider: 'pending'
      }
      const val = map[action] || 'pending'
      const note = String(p.note || p.reason || '').trim()
      await dal.update('ur_providers', { profile_id: p.userId }, { verified: val })
      const prof = await getProfile(p.userId)
      let msg = val === 'verified'
        ? '🎉 الإدارة وثّقت حسابك بنجاح'
        : val === 'rejected'
        ? '🚫 طلب التوثيق مرفوض'
        : '⏳ أُعيد حسابك لقائمة التوثيق والمراجعة'
      if (note) msg += (val === 'rejected' ? ' — السبب: ' + note : ' — ملاحظة: ' + note)
      await notify(p.userId, val === 'verified' ? '🎉' : val === 'rejected' ? '🚫' : '⏳', msg, null)
      const actionName = val === 'verified' ? 'توثيق' : val === 'rejected' ? 'رفض' : 'إعادة نظر'
      await audit(actor.name, actionName + ' مقدم الخدمة ' + (prof ? prof.name : p.userId) + (note ? ' (' + note + ')' : ''))
      return { status: val }
    }
    case 'saveSettings': {
      forbid(isAdmin)
      const clamp = (v, d) => Math.min(40, Math.max(0, parseInt(v) != null && !isNaN(parseInt(v)) ? parseInt(v) : d))
      const c = p.commission || {}
      const commission = {
        first: clamp(c.first, S.commission.first), standard: clamp(c.standard, S.commission.standard),
        loyal: clamp(c.loyal, S.commission.loyal), elite: clamp(c.elite, S.commission.elite),
        delivery: clamp(c.delivery, S.commission.delivery),
      }
      const loyalAt = Math.max(1, parseInt(p.loyalAt) || S.thresholds.loyalAt)
      const thresholds = {
        loyalAt: loyalAt,
        eliteAt: Math.max(loyalAt + 1, parseInt(p.eliteAt) || S.thresholds.eliteAt),
        minPayout: Math.max(1000, parseInt(p.minPayout) || S.thresholds.minPayout),
      }
      await dal.update('ur_settings', { key: 'commission' }, { value: commission })
      await dal.update('ur_settings', { key: 'thresholds' }, { value: thresholds })
      clearStaticCache()
      await audit(actor.name, 'تعديل إعدادات العمولة والتسويات')
      return {}
    }
    case 'saveAreas': {
      forbid(isAdmin)
      const areas = Array.isArray(p.areas) ? p.areas.map(String).map(x=>x.trim()).filter(Boolean) : []
      need(areas.length >= 2, 'bad_area')
      await dal.update('ur_settings', { key: 'areas' }, { value: areas })
      clearStaticCache()
      await audit(actor.name, 'تحديث قائمة المناطق المشمولة')
      return {}
    }
    case 'addService': {
      forbid(isAdmin)
      const name = String(p.name || '').trim(); need(name.length >= 3, 'bad_name')
      const min = parseInt(p.min), max = parseInt(p.max); need(min && max && max >= min, 'bad_range')
      const services = await dal.all('ur_services')
      const maxId = services.reduce((mx, s) => Math.max(mx, parseInt(String(s.id).slice(1)) || 0), 0)
      const id = 's' + (maxId + 1)
      const wave = parseInt(p.wave) || 1
      await dal.insert('ur_services', {
        id: id, icon: p.icon || '🧰', name: name, cat: p.cat || 'other',
        min_price: min, max_price: max, unit: p.unit || 'خدمة',
        popular: !!p.popular, wave: wave, active: true, sensitive: !!p.sensitive,
        gold: wave === 3, description: p.desc || name, created_at: nowIso(),
      })
      clearStaticCache()
      await audit(actor.name, 'إضافة خدمة: ' + name)
      return { serviceId: id }
    }
    case 'toggleService': {
      forbid(isAdmin)
      const s = await svc(p.serviceId); need(s, 'service_not_found')
      await dal.update('ur_services', { id: s.id }, { active: s.active === false })
      clearStaticCache()
      await audit(actor.name, (s.active === false ? 'تفعيل' : 'تعطيل') + ' خدمة ' + s.name)
      return {}
    }
    case 'deleteService': {
      forbid(isAdmin)
      const s = await svc(p.serviceId); need(s, 'service_not_found')
      const orders = await dal.all('ur_orders', { service_id: s.id })
      need(!orders.length, 'service_in_use')
      await dal.del('ur_services', { id: s.id })
      clearStaticCache()
      await audit(actor.name, 'حذف خدمة: ' + s.name)
      return {}
    }
    case 'toggleUserStatus': {
      forbid(isAdmin)
      const u = await getProfile(p.userId); need(u, 'user_not_found')
      const next = u.status === 'active' ? 'suspended' : 'active'
      await dal.update('ur_profiles', { id: u.id }, { status: next })
      await notify(u.id, next === 'active' ? '✅' : '🚫', next === 'active' ? 'حسابك أُعيد تفعيله' : 'حسابك أُوقف', null)
      await audit(actor.name, (next === 'active' ? 'تفعيل' : 'إيقاف') + ' حساب ' + u.name)
      return {}
    }
    case 'closeTicket': {
      forbid(isAdmin)
      const t = await dal.find('ur_tickets', { id: p.ticketId }); need(t, 'ticket_not_found')
      await dal.update('ur_tickets', { id: t.id }, { status: 'closed' })
      await notify(t.user_id, '\u2705', '\u0623\u064f\u063a\u0644\u0642\u062a \u062a\u0630\u0643\u0631\u062a\u0643 ' + t.id, t.order_id)
      await audit(actor.name, '\u0625\u063a\u0644\u0627\u0642 \u0627\u0644\u062a\u0630\u0643\u0631\u0629 ' + t.id)
      return {}
    }
    // ---------------- lifecycle: reject / cancel ----------------
    case 'rejectOrder': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      const o = await getOrder(p.orderId); need(o && o.status === 'pending', 'order_unavailable')
      if ((o.rejected_by || []).indexOf(actor.id) < 0) {
        await dal.update('ur_orders', { id: o.id }, { rejected_by: (o.rejected_by || []).concat([actor.id]) })
      }
      return {}
    }
    case 'cancelOrder': {
      const o = await getOrder(p.orderId); need(o, 'order_not_found')
      // الإلغاء ملك الزبون صاحب الطلب أو الإدارة فقط — المقدم «يعتذر» (providerDrop)
      // ويرجّع الطلب للسوق، لكنه لا يستطيع قتل طلب زبون أبداً — قاعدة سيرفر صارمة.
      forbid(isAdmin || o.customer_id === actor.id)
      need(o.status !== 'done' && o.status !== 'cancelled', 'order_unavailable')
      // الزبون يلغي قبل انطلاق المقدم — أو بأي مرحلة إذا المقدم متوقف أكثر من 24 ساعة
      if (!isAdmin && o.status !== 'pending' && o.status !== 'accepted') {
        const lastEv = (o.timeline || [])[(o.timeline || []).length - 1]
        const stalledH = lastEv ? (Date.now() - lastEv.at) / 3600000 : 999
        need(stalledH >= 24, 'order_unavailable')
      }
      const who = isAdmin ? '\u0627\u0644\u0625\u062f\u0627\u0631\u0629' : '\u0627\u0644\u0632\u0628\u0648\u0646'
      await dal.update('ur_orders', { id: o.id }, {
        status: 'cancelled', cancelled_by: actor.id,
        cancel_reason: '\u0623\u064f\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u0629 ' + who,
        timeline: (o.timeline || []).concat([{ s: 'cancelled', at: Date.now() }]),
      })
      const other = actor.id === o.customer_id ? o.provider_id : o.customer_id
      if (other) await notify(other, '\ud83d\udeab', '\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0637\u0644\u0628 ' + o.id, o.id)
      if (isAdmin) await audit(actor.name, '\u0625\u0644\u063a\u0627\u0621 \u0625\u062f\u0627\u0631\u064a \u0644\u0644\u0637\u0644\u0628 ' + o.id)
      return {}
    }
    // ---------------- profile / password ----------------
    case 'updateProfile': {
      const name = String(p.name || '').trim(); need(name.length >= 2, 'bad_name')
      const phone = String(p.phone || '').replace(/\s/g, ''); need(/^07[0-9]{9}$/.test(phone), 'bad_phone')
      const area = String(p.area || actor.area || 'الحبوبي / المركز').trim()
      const dupe = await dal.find('ur_profiles', { phone: phone })
      need(!dupe || dupe.id === actor.id, 'phone_taken')
      await dal.update('ur_profiles', { id: actor.id }, {
        name: name, phone: phone, area: area,
      })
      return {}
    }
    case 'updateProviderProfile': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      const name = String(p.name || '').trim(); need(name.length >= 2, 'bad_name')
      const phone = String(p.phone || '').replace(/\s/g, ''); need(/^07[0-9]{9}$/.test(phone), 'bad_phone')
      const dupe = await dal.find('ur_profiles', { phone: phone })
      need(!dupe || dupe.id === actor.id, 'phone_taken')
      const areas = Array.isArray(p.areas) ? p.areas.map((x) => String(x).trim()).filter(Boolean) : []
      need(areas.length >= 1, 'bad_area')
      
      let serviceIds = Array.isArray(p.serviceIds) ? p.serviceIds.slice(0, 3) : []
      if (!serviceIds.length && p.serviceId) serviceIds = [p.serviceId]
      if (!serviceIds.length) serviceIds = ['s1']

      const s2 = await svc(serviceIds[0]); need(s2, 'service_not_found')
      await dal.update('ur_profiles', { id: actor.id }, { name: name, phone: phone })
      const patch = { service_id: s2.id, service_ids: serviceIds, exp: Math.max(0, parseInt(p.exp) || 0), areas: areas }
      if (s2.sensitive && !prov.sensitive) {
        patch.sensitive = true
        patch.verified = 'pending'
        await notifyAdmins('🛡️', name + ' غيّر خدمته إلى خدمة حساسة — يحتاج إعادة توثيق', null)
      }
      await dal.update('ur_providers', { profile_id: actor.id }, patch)
      return { reverify: !!(s2.sensitive && !prov.sensitive) }
    }
    case 'changePassword': {
      const oldPass = String(p.oldPass || '')
      const newPass = String(p.newPass || '')
      need(verifyPassword(oldPass, actor.pass_hash), 'bad_credentials')
      need(newPass.length >= 6, 'bad_pass')
      await dal.update('ur_profiles', { id: actor.id }, { pass_hash: hashPassword(newPass) })
      if (actor.role === 'admin') await audit(actor.name, 'تغيير كلمة مرور الإدارة')
      return { ok: true }
    }
    case 'markRead': {
      const num = parseInt(String(p.noteId || '').replace(/^n/, ''))
      if (!num) return {}
      const n = await dal.find('ur_notifications', { id: num })
      if (n && n.user_id === actor.id && !n.read) {
        await dal.update('ur_notifications', { id: n.id }, { read: true })
      }
      return {}
    }
    case 'reapplyVerification': {
      const prov = await getProvider(actor.id); need(prov, 'not_provider')
      await dal.update('ur_providers', { profile_id: actor.id }, { verified: 'pending' })
      await notifyAdmins('🛡️', 'إعادة تقديم طلب توثيق من مقدم الخدمة: ' + actor.name, null)
      await notify(actor.id, '⏳', 'تم استلام طلب إعادة التوثيق — قيد مراجعة الإدارة', null)
      await audit(actor.name, 'إعادة تقديم طلب التوثيق')
      return { status: 'pending' }
    }
    case 'deleteAccount': {
      const targetId = (isAdmin && p.userId) ? p.userId : actor.id
      const target = await getProfile(targetId); need(target, 'user_not_found')
      need(target.role !== 'admin', 'cannot_delete_admin')
      
      if (!isAdmin) {
        need(verifyPassword(String(p.pass || ''), target.pass_hash), 'bad_credentials')
      }
      
      // المقدم ما يحذف حسابه وعليه ذمة — الذمة ما تموت بالحذف
      const provRow = await getProvider(target.id)
      if (provRow) need((provRow.debt || 0) === 0, 'debt_blocked')
      // Preserve tickets, messages, and orders: anonymize user profile and remove provider role
      const freedPhone = '07000' + Math.floor(100000 + Math.random() * 900000);
      await dal.update('ur_profiles', { id: target.id }, {
        name: target.name + ' [حساب محذوف]',
        phone: freedPhone,
        status: 'suspended',
        pass_hash: 'deleted_' + Date.now()
      });
      // Remove from providers so they no longer appear in service listings or receive jobs
      await dal.del('ur_providers', { profile_id: target.id });
      // Delete temporary notifications
      await dal.del('ur_notifications', { user_id: target.id });
      
      await audit(actor.name, 'طلب حذف الحساب وتم أرشفة السجلات وحفظ التذاكر والمحادثات: ' + target.name + ' (' + target.phone + ')');
      return { deleted: true };
    }
    default: {
      const e = new Error('unknown_action'); e.code = 'unknown_action'; e.status = 400; throw e
    }
  }
}

module.exports = { snapshot, runAction, provisionAdmin, STATUS_ORDER }
