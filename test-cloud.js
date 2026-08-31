// =====================================================================
//  Offline integration test: runs the REAL server handlers/engine
//  through the full order lifecycle, backed by an in-memory Supabase
//  mock. No network. Verifies shapes + the known commission math.
// =====================================================================
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert')

// ---- 1) in-memory Supabase client (implements the subset the DAL uses)
function makeFakeClient() {
  const store = {
    ur_categories: [], ur_services: [], ur_profiles: [], ur_providers: [],
    ur_orders: [], ur_reviews: [], ur_order_messages: [], ur_notifications: [],
    ur_tickets: [], ur_ticket_messages: [], ur_payouts: [], ur_audit_log: [],
    ur_settings: [], ur_counters: [],
  }
  const serial = { ur_order_messages: 0, ur_notifications: 0, ur_ticket_messages: 0, ur_audit_log: 0 }
  const clone = (x) => JSON.parse(JSON.stringify(x))

  class QB {
    constructor(table) { this.t = table; this.op = 'select'; this.f = []; this.body = null; this.lim = null }
    select() { return this }
    insert(obj) { this.op = 'insert'; this.body = obj; return this }
    update(patch) { this.op = 'update'; this.body = patch; return this }
    delete() { this.op = 'delete'; return this }
    eq(k, v) { this.f.push([k, v]); return this }
    limit(n) { this.lim = n; return this }
    _match(r) { return this.f.every(([k, v]) => r[k] === v) }
    _run() {
      const arr = store[this.t]
      if (!arr) return { data: null, error: { message: 'no table ' + this.t } }
      if (this.op === 'select') {
        let rows = arr.filter((r) => this._match(r))
        if (this.lim != null) rows = rows.slice(0, this.lim)
        return { data: clone(rows), error: null }
      }
      if (this.op === 'insert') {
        const objs = Array.isArray(this.body) ? this.body : [this.body]
        const inserted = []
        for (const o of objs) {
          const row = clone(o)
          if (row.id == null) {
            if (this.t === 'ur_profiles') row.id = crypto.randomUUID()
            else if (serial[this.t] != null) row.id = ++serial[this.t]
          }
          arr.push(row)
          inserted.push(clone(row))
        }
        return { data: inserted, error: null }
      }
      if (this.op === 'update') {
        const out = []
        for (const r of arr) if (this._match(r)) { Object.assign(r, clone(this.body)); out.push(clone(r)) }
        return { data: out, error: null }
      }
      if (this.op === 'delete') {
        for (let i = arr.length - 1; i >= 0; i--) if (this._match(arr[i])) arr.splice(i, 1)
        return { data: null, error: null }
      }
      return { data: null, error: { message: 'bad op' } }
    }
    then(resolve) { resolve(this._run()) }
  }

  return {
    store,
    from(table) { return new QB(table) },
    async rpc(name, args) {
      if (name !== 'ur_next_seq') return { data: null, error: { message: 'no rpc ' + name } }
      const kind = args.p_kind, start = args.p_start
      let row = store.ur_counters.find((c) => c.kind === kind)
      if (!row) { row = { kind, value: start }; store.ur_counters.push(row); return { data: row.value, error: null } }
      row.value = row.value + 1
      return { data: row.value, error: null }
    },
  }
}

// ---- 2) extract the frontend catalog constants to seed the DB exactly
function extractArray(src, name) {
  const marker = 'const ' + name + '='
  const i = src.indexOf(marker)
  if (i < 0) throw new Error('missing ' + name)
  let j = src.indexOf('[', i), depth = 0, k = j
  for (; k < src.length; k++) {
    if (src[k] === '[') depth++
    else if (src[k] === ']') { depth--; if (depth === 0) { k++; break } }
  }
  // eslint-disable-next-line no-eval
  return eval(src.slice(j, k))
}

function seed(client) {
  const appPath = fs.existsSync('/data/v6-app.js')
    ? '/data/v6-app.js'
    : path.join(__dirname, 'v6-app.js')
  const src = fs.readFileSync(appPath, 'utf8')
  const CATS = extractArray(src, 'DEF_CATS')
  const SERVICES = extractArray(src, 'DEF_SERVICES')
  const AREAS = extractArray(src, 'DEF_AREAS')
  CATS.forEach((c, i) => client.store.ur_categories.push({ id: c.id, name: c.name, icon: c.icon, sort: i }))
  SERVICES.forEach((s) => client.store.ur_services.push({
    id: s.id, icon: s.icon, name: s.name, cat: s.cat, min_price: s.min, max_price: s.max,
    unit: s.unit, popular: !!s.popular, wave: s.wave, active: s.active !== false,
    sensitive: !!s.sensitive, gold: !!s.gold, description: s.desc,
  }))
  client.store.ur_settings.push({ key: 'commission', value: { first: 18, standard: 15, loyal: 13, elite: 10, delivery: 10 } })
  client.store.ur_settings.push({ key: 'thresholds', value: { loyalAt: 11, eliteAt: 31, minPayout: 10000 } })
  client.store.ur_settings.push({ key: 'areas', value: AREAS })
  return { CATS, SERVICES, AREAS }
}

// ---- 3) fake req/res so we exercise the real HTTP handlers
function callHandler(handler, { method = 'POST', body = {}, token = null } = {}) {
  return new Promise((resolve) => {
    const req = { method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }
    const res = {
      statusCode: 200, _h: {},
      setHeader(k, v) { this._h[k] = v },
      end(s) { resolve({ status: this.statusCode, json: s ? JSON.parse(s) : null }) },
    }
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 500, json: { error: e.message } }))
  })
}

// ---- 4) run
;(async function main() {
  // Force cloud-mode env BEFORE requiring _lib
  process.env.SUPABASE_URL = 'http://memory'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'memory'
  process.env.JWT_SECRET = 'test-secret-please-change-'.repeat(2)
  process.env.ADMIN_PHONE = '07800000000'
  process.env.ADMIN_PASSWORD = 'ur-admin-2026'

  const lib = require('./api/_lib')
  const client = makeFakeClient()
  lib.__setClientForTest(client)
  const cat = seed(client)
  assert.strictEqual(cat.SERVICES.length, 30, 'should seed 30 services')

  const authHandler = require('./api/auth')
  const dataHandler = require('./api/data')

  const P = (r) => { if (!r.json || r.json.ok === false) throw new Error('FAIL ' + r.status + ' ' + JSON.stringify(r.json)); return r.json }

  // health
  assert.strictEqual(lib.cloudReady, true, 'cloudReady true')

  // admin auto-provision + login
  const adminLogin = P(await callHandler(authHandler, { body: { action: 'login', phone: '07800000000', pass: 'ur-admin-2026' } }))
  const adminTok = adminLogin.token
  assert.ok(adminTok, 'admin token')
  assert.strictEqual(adminLogin.role, 'admin')

  // register provider (Abu Ali, s1 غسيل سيارة, الحبوبي)
  const provReg = P(await callHandler(authHandler, { body: { action: 'register', role: 'provider', name: '\u0623\u0628\u0648 \u0639\u0644\u064a \u0627\u0644\u063a\u0633\u0651\u0627\u0644', phone: '07701112223', pass: 'pass1234', area: '\u0627\u0644\u062d\u0628\u0648\u0628\u064a', serviceId: 's1', exp: '5 \u0633\u0646\u0648\u0627\u062a', areas: ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a', '\u0633\u0648\u0645\u0631'] } }))
  const provId = provReg.userId, provTok = provReg.token
  assert.strictEqual(provReg.role, 'provider')

  // register customer (Haidar)
  const custReg = P(await callHandler(authHandler, { body: { action: 'register', role: 'customer', name: '\u062d\u064a\u062f\u0631 \u0643\u0631\u064a\u0645', phone: '07701234567', pass: 'pass1234', area: '\u0627\u0644\u062d\u0628\u0648\u0628\u064a' } }))
  const custId = custReg.userId, custTok = custReg.token

  // duplicate phone rejected
  const dup = await callHandler(authHandler, { body: { action: 'register', role: 'customer', name: 'Dup Tester', phone: '07701234567', pass: 'pass1234', area: '\u0623\u0648\u0631' } })
  assert.strictEqual(dup.json.ok, false); assert.strictEqual(dup.json.error, 'phone_taken')

  // wrong password rejected
  const badpw = await callHandler(authHandler, { body: { action: 'login', phone: '07701234567', pass: 'nope' } })
  assert.strictEqual(badpw.json.error, 'bad_credentials')

  // provider cannot accept before verification
  // first customer places order
  const act = (tok, action, payload) => callHandler(dataHandler, { token: tok, body: { action, payload } })
  const snap = (tok) => callHandler(dataHandler, { token: tok, body: { action: 'snapshot' } })

  const created = P(await act(custTok, 'createOrder', { serviceId: 's1', area: '\u0627\u0644\u062d\u0628\u0648\u0628\u064a', address: '\u0645\u062d\u0644\u0629 123', desc: '\u063a\u0633\u064a\u0644 \u0634\u0627\u0645\u0644', estimate: 14500, when: 'now', payMethod: 'cash' }))
  const orderId = created.result.orderId
  assert.strictEqual(orderId, 'UR-1042', 'first order id must be UR-1042, got ' + orderId)

  // provider tries to accept while still pending verification -> not_verified
  const preAccept = await act(provTok, 'acceptOrder', { orderId })
  assert.strictEqual(preAccept.json.error, 'not_verified', 'unverified provider blocked')

  // admin verifies provider
  P(await act(adminTok, 'verifyProvider', { userId: provId }))

  // provider accepts -> commissionRate should be 'first' = 18
  const accepted = P(await act(provTok, 'acceptOrder', { orderId }))
  const ordAfterAccept = accepted.db.orders.find((o) => o.id === orderId)
  assert.strictEqual(ordAfterAccept.status, 'accepted')
  assert.strictEqual(ordAfterAccept.finalPrice, 14500, 'finalPrice defaults to estimate')
  assert.strictEqual(ordAfterAccept.commissionRate, 18, 'first-order commission = 18%')

  // cannot advance before price confirmed
  const blocked = await act(provTok, 'advanceOrder', { orderId })
  assert.strictEqual(blocked.json.error, 'price_not_confirmed', 'advance blocked until price confirmed')

  // customer confirms price
  P(await act(custTok, 'confirmPrice', { orderId }))

  // provider advances: accepted -> enroute -> started -> done
  P(await act(provTok, 'advanceOrder', { orderId })) // enroute
  P(await act(provTok, 'advanceOrder', { orderId })) // started
  const done = P(await act(provTok, 'advanceOrder', { orderId })) // done
  const ordDone = done.db.orders.find((o) => o.id === orderId)
  assert.strictEqual(ordDone.status, 'done')

  // MATH: 14500 * 18% = 2610 commission ; net = 11890
  const provUserAfter = done.db.users.find((u) => u.id === provId)
  assert.strictEqual(provUserAfter.provider.jobs, 1, 'jobs incremented')
  assert.strictEqual(provUserAfter.provider.balance, 11890, 'net balance = 14500-2610 = 11890, got ' + provUserAfter.provider.balance)

  // customer rates 5 stars
  P(await act(custTok, 'rate', { orderId, stars: 5, text: '\u0645\u0645\u062a\u0627\u0632' }))
  const afterRate = P(await snap(adminTok))
  const provRated = afterRate.db.users.find((u) => u.id === provId)
  assert.strictEqual(provRated.provider.ratingCount, 1)
  assert.strictEqual(provRated.provider.ratingSum, 5)
  const ratedOrder = afterRate.db.orders.find((o) => o.id === orderId)
  assert.ok(ratedOrder.review && ratedOrder.review.stars === 5, 'review attached to order')

  // cannot rate twice
  const twice = await act(custTok, 'rate', { orderId, stars: 3, text: 'x' })
  assert.strictEqual(twice.json.error, 'already_rated')

  // provider requests payout (balance 11890 >= 10000)
  const payoutReq = P(await act(provTok, 'requestPayout', {}))
  const payoutId = payoutReq.result.payoutId
  assert.strictEqual(payoutId, 'PO-1')
  const provAfterReq = payoutReq.db.users.find((u) => u.id === provId)
  assert.strictEqual(provAfterReq.provider.balance, 0, 'balance reset after payout request')

  // admin pays payout -> settled += 11890
  const paid = P(await act(adminTok, 'payPayout', { payoutId }))
  const provAfterPay = paid.db.users.find((u) => u.id === provId)
  assert.strictEqual(provAfterPay.provider.settled, 11890, 'settled after pay')
  const po = paid.db.payouts.find((x) => x.id === payoutId)
  assert.strictEqual(po.status, 'paid')

  // ---- role scoping / privacy checks
  const adminSnap = P(await snap(adminTok)).db
  assert.strictEqual(adminSnap.stats.doneOrders, 1)
  assert.strictEqual(adminSnap.stats.avgR, 5)
  assert.ok(adminSnap.audit.length > 0, 'admin sees audit log')
  const adminSeesProvPhone = adminSnap.users.find((u) => u.id === provId).phone
  assert.strictEqual(adminSeesProvPhone, '07701112223', 'admin sees full phone')

  const custSnap = P(await snap(custTok)).db
  assert.strictEqual(custSnap.orders.length, 1, 'customer sees only own order')
  assert.strictEqual(custSnap.audit.length, 0, 'customer cannot see audit')
  const custSeesProvPhone = custSnap.users.find((u) => u.id === provId).phone
  assert.ok(custSeesProvPhone.indexOf('2223') >= 0 && custSeesProvPhone.indexOf('0770') < 0, 'phone masked for others: ' + custSeesProvPhone)
  assert.strictEqual(custSnap.users.find((u) => u.id === custId).phone, '07701234567', 'sees own full phone')

  const publicSnap = P(await snap(null)).db
  assert.strictEqual(publicSnap.session, null, 'no session when logged out')
  assert.strictEqual(publicSnap.orders.length, 0, 'public sees no orders')
  assert.strictEqual(publicSnap.stats.doneOrders, 1, 'public still sees aggregate stats')
  assert.strictEqual(publicSnap.services.length, 30, 'catalog public')

  // ================= extended actions (profile / password / areas / cancel / reject) =================
  // change password (customer) -> old rejected, new accepted
  P(await act(custTok, 'changePassword', { oldPass: 'pass1234', newPass: 'newpass9' }))
  const okNew = await callHandler(authHandler, { body: { action: 'login', phone: '07701234567', pass: 'newpass9' } })
  assert.strictEqual(okNew.json.ok, true, 'login with NEW password works')
  const okOld = await callHandler(authHandler, { body: { action: 'login', phone: '07701234567', pass: 'pass1234' } })
  assert.strictEqual(okOld.json.error, 'bad_credentials', 'OLD password rejected after change')

  // update customer profile
  P(await act(custTok, 'updateProfile', { name: '\u062d\u064a\u062f\u0631 \u0643\u0631\u064a\u0645 \u0627\u0644\u0645\u062d\u062f\u0651\u062b', phone: '07701234567', area: '\u0633\u0648\u0645\u0631' }))
  const cp = P(await snap(custTok)).db.users.find((u) => u.id === custId)
  assert.strictEqual(cp.area, '\u0633\u0648\u0645\u0631', 'customer area updated')
  assert.ok(cp.name.indexOf('\u0627\u0644\u0645\u062d\u062f\u0651\u062b') >= 0, 'customer name updated')

  // duplicate phone on profile update is rejected
  const dupPhone = await act(custTok, 'updateProfile', { name: '\u062d\u064a\u062f\u0631', phone: '07701112223', area: '\u0633\u0648\u0645\u0631' })
  assert.strictEqual(dupPhone.json.error, 'phone_taken', 'cannot steal another user phone')

  // update provider profile
  P(await act(provTok, 'updateProviderProfile', { name: '\u0623\u0628\u0648 \u0639\u0644\u064a \u0627\u0644\u063a\u0633\u0651\u0627\u0644', phone: '07701112223', serviceId: 's1', exp: 8, areas: ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a', '\u0623\u0648\u0631'] }))
  const pp = P(await snap(provTok)).db.users.find((u) => u.id === provId)
  assert.deepStrictEqual(pp.provider.areas, ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a', '\u0623\u0648\u0631'], 'provider areas updated')
  assert.strictEqual(pp.provider.exp, 8, 'provider exp updated')
  assert.strictEqual(pp.provider.verified, 'verified', 'stays verified for non-sensitive service')

  // switching to a SENSITIVE service forces re-verification
  const sens = P(await act(provTok, 'updateProviderProfile', { name: '\u0623\u0628\u0648 \u0639\u0644\u064a \u0627\u0644\u063a\u0633\u0651\u0627\u0644', phone: '07701112223', serviceId: 's20', exp: 8, areas: ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a'] }))
  assert.strictEqual(sens.result.reverify, true, 'sensitive switch triggers reverify')
  assert.strictEqual(P(await snap(provTok)).db.users.find((u) => u.id === provId).provider.verified, 'pending', 'provider back to pending')
  // restore provider to s1 + verified so later checks stay meaningful
  P(await act(provTok, 'updateProviderProfile', { name: '\u0623\u0628\u0648 \u0639\u0644\u064a \u0627\u0644\u063a\u0633\u0651\u0627\u0644', phone: '07701112223', serviceId: 's1', exp: 8, areas: ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a', '\u0623\u0648\u0631'] }))
  P(await act(adminTok, 'verifyProvider', { userId: provId }))

  // admin: areas list
  P(await act(adminTok, 'saveAreas', { areas: ['\u0627\u0644\u062d\u0628\u0648\u0628\u064a', '\u0633\u0648\u0645\u0631', '\u0623\u0648\u0631'] }))
  assert.strictEqual(P(await snap(null)).db.settings.areas.length, 3, 'areas list updated')
  const badAreas = await act(adminTok, 'saveAreas', { areas: ['\u0648\u0627\u062d\u062f\u0629'] })
  assert.strictEqual(badAreas.json.error, 'bad_area', 'needs at least two areas')

  // admin: add then delete a service; in-use service cannot be deleted
  const added = P(await act(adminTok, 'addService', { name: '\u062e\u062f\u0645\u0629 \u062a\u062c\u0631\u064a\u0628\u064a\u0629', cat: 'home', min: 5000, max: 9000, unit: '\u0632\u064a\u0627\u0631\u0629', wave: 1, icon: '\ud83e\uddea' }))
  const newSvcId = added.result.serviceId
  assert.ok(newSvcId, 'service created')
  P(await act(adminTok, 'deleteService', { serviceId: newSvcId }))
  assert.ok(!P(await snap(adminTok)).db.services.some((x) => x.id === newSvcId), 'service deleted')
  const delUsed = await act(adminTok, 'deleteService', { serviceId: 's1' })
  assert.strictEqual(delUsed.json.error, 'service_in_use', 'cannot delete a service that has orders')

  // second order: provider ignores it, then customer cancels it
  const o2 = P(await act(custTok, 'createOrder', { serviceId: 's1', area: '\u0627\u0644\u062d\u0628\u0648\u0628\u064a', address: '\u0645\u062d\u0644\u0629 9', desc: '\u063a\u0633\u064a\u0644 \u062b\u0627\u0646\u064a', estimate: 12000 }))
  const oid2 = o2.result.orderId
  assert.strictEqual(oid2, 'UR-1043', 'second order id sequential')
  assert.ok(P(await snap(provTok)).db.orders.some((o) => o.id === oid2), 'provider sees pending order2')
  P(await act(provTok, 'rejectOrder', { orderId: oid2 }))
  assert.ok(!P(await snap(provTok)).db.orders.some((o) => o.id === oid2), 'ignored order hidden from that provider')
  assert.ok(P(await snap(adminTok)).db.orders.some((o) => o.id === oid2 && o.status === 'pending'), 'order2 still pending for others')
  P(await act(custTok, 'cancelOrder', { orderId: oid2 }))
  const o2c = P(await snap(custTok)).db.orders.find((o) => o.id === oid2)
  assert.strictEqual(o2c.status, 'cancelled', 'order2 cancelled')
  assert.ok(o2c.cancelReason && o2c.cancelReason.indexOf('\u0627\u0644\u0632\u0628\u0648\u0646') >= 0, 'cancel reason names the customer')
  const reCancel = await act(custTok, 'cancelOrder', { orderId: oid2 })
  assert.strictEqual(reCancel.json.error, 'order_unavailable', 'cannot cancel twice')
  // completed order cannot be cancelled
  const cancelDone = await act(custTok, 'cancelOrder', { orderId: orderId })
  assert.strictEqual(cancelDone.json.error, 'order_unavailable', 'cannot cancel a completed order')

  // notifications: mark a single one read
  const notes0 = P(await snap(provTok)).db.notes
  assert.ok(notes0.length > 0, 'provider has notifications')
  const unread0 = notes0.filter((n) => !n.read).length
  const target = notes0.find((n) => !n.read)
  if (target) {
    P(await act(provTok, 'markRead', { noteId: target.id }))
    const unread1 = P(await snap(provTok)).db.notes.filter((n) => !n.read).length
    assert.strictEqual(unread1, unread0 - 1, 'exactly one notification marked read')
  }
  // mark all read
  P(await act(provTok, 'markAllRead', {}))
  assert.strictEqual(P(await snap(provTok)).db.notes.filter((n) => !n.read).length, 0, 'all notifications read')

  // support ticket + dispute
  const tk = P(await act(custTok, 'openTicket', { subject: '\u0627\u0633\u062a\u0641\u0633\u0627\u0631 \u0639\u0646 \u0627\u0644\u062a\u0633\u0648\u064a\u0629', body: '\u0623\u0631\u064a\u062f \u062a\u0648\u0636\u064a\u062d \u0639\u0646 \u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639' }))
  assert.strictEqual(tk.result.ticketId, 'T-1', 'ticket id')
  P(await act(adminTok, 'replyTicket', { ticketId: 'T-1', body: '\u0623\u0647\u0644\u0627\u064b \u0628\u064a\u0643\u060c \u0627\u0644\u062f\u0641\u0639 \u0646\u0642\u062f\u0627\u064b \u0639\u0646\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645' }))
  const tkSeen = P(await snap(custTok)).db.tickets.find((t) => t.id === 'T-1')
  assert.strictEqual(tkSeen.msgs.length, 2, 'ticket has both messages')
  P(await act(adminTok, 'closeTicket', { ticketId: 'T-1' }))
  assert.strictEqual(P(await snap(adminTok)).db.tickets.find((t) => t.id === 'T-1').status, 'closed', 'ticket closed')
  // customer cannot see other users' tickets
  assert.strictEqual(P(await snap(provTok)).db.tickets.length, 0, 'provider sees no foreign tickets')

  // chat is scoped to the order participants
  P(await act(custTok, 'sendMessage', { orderId: orderId, text: '\u0634\u0643\u0631\u0627\u064b \u0639\u0644\u0649 \u0627\u0644\u0634\u063a\u0644' }))
  assert.ok(P(await snap(provTok)).db.messages.some((m) => m.orderId === orderId), 'provider sees order chat')

  // suspended user is blocked
  P(await act(adminTok, 'toggleUserStatus', { userId: custId }))
  const suspended = await act(custTok, 'createOrder', { serviceId: 's1', area: '\u0627\u0644\u062d\u0628\u0648\u0628\u064a', estimate: 5000 })
  assert.strictEqual(suspended.json.error, 'suspended', 'suspended user blocked')

  console.log('\u2705 ALL CLOUD TESTS PASSED \u2014 lifecycle + math (14500\u00d718%=2610, net 11890) + scoping OK')
})().catch((e) => { console.error('\u274c TEST FAILED:\n', e && e.stack || e); process.exit(1) })
